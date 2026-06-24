import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  enrichTasks,
  filterToMotionTeam,
  hydrateMissingFolders,
} from "../lib/wrikeEnrich";

const FIELDS_FILTER = encodeURIComponent(
  "[customFields,parentIds,responsibleIds,subTaskIds,description]"
);
const SYNC_INTERVAL_MS  = 15 * 60 * 1000;   // re-sync if data is >15 min old
const META_MAX_AGE_MS   = 24 * 60 * 60 * 1000; // refresh folder/contact dicts daily
const LOOKBACK_MONTHS   = 3;                 // how far back the full refresh window goes

// ---------------------------------------------------------------------------
// Fetch folders, contacts, workflows from Wrike
// ---------------------------------------------------------------------------
async function fetchWrikeMeta(token) {
  const [fRes, cRes, wRes] = await Promise.all([
    fetch("https://www.wrike.com/api/v4/folders",  { headers: { Authorization: `Bearer ${token}` } }),
    fetch("https://www.wrike.com/api/v4/contacts",  { headers: { Authorization: `Bearer ${token}` } }),
    fetch("https://www.wrike.com/api/v4/workflows", { headers: { Authorization: `Bearer ${token}` } }),
  ]);

  const folderDictionary = {};
  (await fRes.json()).data?.forEach((f) => { folderDictionary[f.id] = f; });

  const contactDictionary = {};
  (await cRes.json()).data?.forEach((u) => {
    contactDictionary[u.id] = `${u.firstName || ""} ${u.lastName || ""}`.trim();
  });

  const statusDictionary = {};
  (await wRes.json()).data?.forEach((wf) => {
    wf.customStatuses?.forEach((s) => { statusDictionary[s.id] = s.name; });
  });

  return { folderDictionary, contactDictionary, statusDictionary };
}

// ---------------------------------------------------------------------------
// Paginate through Wrike tasks updated after `sinceIso`
// ---------------------------------------------------------------------------
async function fetchWrikeTasks(token, sinceIso) {
  const dateFilter = encodeURIComponent(`{"start":"${sinceIso}"}`);
  let rawTasks = [];
  let nextPageToken = null;

  while (true) {
    let url = `https://www.wrike.com/api/v4/tasks?fields=${FIELDS_FILTER}&updatedDate=${dateFilter}&pageSize=1000`;
    if (nextPageToken) url += `&nextPageToken=${nextPageToken}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Wrike tasks fetch failed: ${res.status}`);
    const json = await res.json();
    rawTasks = [...rawTasks, ...(json.data || [])];
    nextPageToken = json.nextPageToken;
    if (!nextPageToken) break;
  }

  return rawTasks;
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------
export function useWrikeCache() {
  const [tasks, setTasks]           = useState([]);
  const [isSyncing, setIsSyncing]   = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [syncError, setSyncError]   = useState(null);
  const syncingRef = useRef(false);

  const wrikeUserId = localStorage.getItem("wrike_user_id");
  const token       = localStorage.getItem("wrike_personal_token");

  // --- Load cached tasks from Supabase immediately on mount ---
  useEffect(() => {
    if (!wrikeUserId) return;
    (async () => {
      const { data, error } = await supabase
        .from("wrike_tasks_cache")
        .select("task_data")
        .eq("wrike_user_id", wrikeUserId);
      if (!error && data?.length) {
        setTasks(data.map((r) => r.task_data));
        const { data: meta } = await supabase
          .from("wrike_sync_meta")
          .select("last_synced_at")
          .eq("wrike_user_id", wrikeUserId)
          .single();
        if (meta?.last_synced_at) setLastSynced(new Date(meta.last_synced_at));
      }
    })();
  }, [wrikeUserId]);

  // --- Core sync function ---
  const sync = useCallback(async ({ fullRefresh = false } = {}) => {
    if (!token || !wrikeUserId) return;
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    setSyncError(null);

    try {
      // Read existing meta (last sync time + cached dicts)
      const { data: meta } = await supabase
        .from("wrike_sync_meta")
        .select("*")
        .eq("wrike_user_id", wrikeUserId)
        .single();

      const now = Date.now();
      const lastSync = meta?.last_synced_at ? new Date(meta.last_synced_at).getTime() : 0;

      // Skip if recently synced and not a forced refresh
      if (!fullRefresh && now - lastSync < SYNC_INTERVAL_MS) {
        return;
      }

      // Determine the lookback window
      const sinceIso = fullRefresh || !meta?.last_synced_at
        ? (() => { const d = new Date(); d.setMonth(d.getMonth() - LOOKBACK_MONTHS); return d.toISOString().split(".")[0] + "Z"; })()
        : meta.last_synced_at;

      // Refresh folder/contact/status dicts if stale or missing
      const metaAge = now - lastSync;
      const needsMetaRefresh = fullRefresh || metaAge > META_MAX_AGE_MS || !meta?.folder_dictionary;

      let folderDictionary  = meta?.folder_dictionary  || {};
      let contactDictionary = meta?.contact_dictionary || {};
      let statusDictionary  = meta?.status_dictionary  || {};

      if (needsMetaRefresh) {
        ({ folderDictionary, contactDictionary, statusDictionary } = await fetchWrikeMeta(token));
      }

      // Fetch tasks changed since last sync
      const rawTasks = await fetchWrikeTasks(token, sinceIso);

      // Hydrate any missing archive folder IDs
      if (rawTasks.length > 0) {
        await hydrateMissingFolders(rawTasks, folderDictionary, token);
      }

      // Enrich + filter
      const enriched = enrichTasks(rawTasks, folderDictionary, contactDictionary, statusDictionary);
      const filtered = filterToMotionTeam(enriched, folderDictionary, contactDictionary);

      // Upsert to Supabase in batches
      if (filtered.length > 0) {
        const rows = filtered.map((t) => ({
          id: t.id,
          wrike_user_id: wrikeUserId,
          task_data: t,
          updated_date: t.updatedDate ?? null,
        }));
        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
          await supabase.from("wrike_tasks_cache").upsert(rows.slice(i, i + BATCH));
        }
      }

      // Persist updated meta
      await supabase.from("wrike_sync_meta").upsert({
        wrike_user_id: wrikeUserId,
        last_synced_at: new Date().toISOString(),
        folder_dictionary:  needsMetaRefresh ? folderDictionary  : (meta?.folder_dictionary  ?? {}),
        contact_dictionary: needsMetaRefresh ? contactDictionary : (meta?.contact_dictionary ?? {}),
        status_dictionary:  needsMetaRefresh ? statusDictionary  : (meta?.status_dictionary  ?? {}),
      });

      // Merge new tasks into state
      if (filtered.length > 0) {
        setTasks((prev) => {
          const map = new Map(prev.map((t) => [t.id, t]));
          filtered.forEach((t) => map.set(t.id, t));
          return [...map.values()];
        });
      }

      const syncedAt = new Date();
      setLastSynced(syncedAt);
    } catch (err) {
      console.error("Wrike cache sync failed:", err);
      setSyncError(err.message);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [token, wrikeUserId]);

  // --- Background sync on mount (after cache loads) ---
  useEffect(() => {
    if (!token || !wrikeUserId) return;
    // Small delay so the instant cache load renders first
    const t = setTimeout(() => sync(), 500);
    return () => clearTimeout(t);
  }, [token, wrikeUserId, sync]);

  const syncNow = useCallback(() => sync({ fullRefresh: true }), [sync]);

  return { tasks, isSyncing, lastSynced, syncError, syncNow };
}
