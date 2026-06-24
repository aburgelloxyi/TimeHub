import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  enrichTasks,
  filterToMotionTeam,
  hydrateMissingFolders,
  parseWrikeData,
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
    const url = nextPageToken
      ? `https://www.wrike.com/api/v4/tasks?nextPageToken=${nextPageToken}`
      : `https://www.wrike.com/api/v4/tasks?fields=${FIELDS_FILTER}&updatedDate=${dateFilter}&pageSize=1000`;
    console.log("[WrikeCache] fetching:", url.replace(/Bearer\s\S+/, "Bearer ***"));
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[WrikeCache] 400 body:", body);
      throw new Error(`Wrike tasks fetch failed: ${res.status}`);
    }
    const json = await res.json();
    rawTasks = [...rawTasks, ...(json.data || [])];
    nextPageToken = json.nextPageToken;
    if (!nextPageToken) break;
  }

  return rawTasks;
}

// ---------------------------------------------------------------------------
// Re-fetch specific tasks by ID *with* the fields param.
// Wrike pagination drops optional fields (description, customFields) on pages
// 2+, so tasks from later pages come back without their description — which is
// where the MATRIX table + notes live. Fetching by ID guarantees we get them.
// ---------------------------------------------------------------------------
async function fetchTasksByIds(token, ids) {
  const out = [];
  // The single-task endpoint /tasks/{id} returns the FULL task (incl. description)
  // by default. The multi-id batch + fields combo 400s, so fetch one at a time.
  const headers = { Authorization: `Bearer ${token}` };
  const descFields = encodeURIComponent("[description,customFields]");
  for (const id of ids) {
    let task = null;
    // Attempt 1: explicit description field
    try {
      const r = await fetch(`https://www.wrike.com/api/v4/tasks/${id}?fields=${descFields}`, { headers });
      if (r.ok) task = (await r.json()).data?.[0];
      else console.warn(`[WrikeCache] ${id} w/fields ${r.status}:`, await r.text().catch(() => ""));
    } catch (e) { console.warn(`[WrikeCache] ${id} w/fields error`, e); }
    // Attempt 2: no fields param (single-task GET returns description by default)
    if (!task) {
      try {
        const r = await fetch(`https://www.wrike.com/api/v4/tasks/${id}`, { headers });
        if (r.ok) task = (await r.json()).data?.[0];
        else console.warn(`[WrikeCache] ${id} no-fields ${r.status}:`, await r.text().catch(() => ""));
      } catch (e) { console.warn(`[WrikeCache] ${id} no-fields error`, e); }
    }
    if (task) out.push(task);
  }
  return out;
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
  // Load all rows regardless of wrike_user_id — single-team tool, cache is shared
  useEffect(() => {
    (async () => {
      // Supabase default limit is 1000 — paginate to get all rows
      let allTasks = [];
      const PAGE = 1000;
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from("wrike_tasks_cache")
          .select("task_data")
          .range(page * PAGE, (page + 1) * PAGE - 1);
        if (error || !data?.length) break;
        allTasks = [...allTasks, ...data.map((r) => r.task_data)];
        if (data.length < PAGE) break;
        page++;
      }
      let loaded = [];
      if (allTasks.length) {
        // Deduplicate by id — keep the row with the most data (non-empty tableHtml wins)
        const map = new Map();
        for (const t of allTasks) {
          const existing = map.get(t.id);
          if (!existing || (!existing.tableHtml && t.tableHtml)) {
            map.set(t.id, t);
          }
        }
        loaded = [...map.values()];
        setTasks(loaded);
      }

      // Load latest meta (sync time + dicts for re-enrichment)
      const { data: meta } = await supabase
        .from("wrike_sync_meta")
        .select("last_synced_at,folder_dictionary,contact_dictionary,status_dictionary")
        .order("last_synced_at", { ascending: false })
        .limit(1)
        .single();
      if (meta?.last_synced_at) setLastSynced(new Date(meta.last_synced_at));

      // --- SELF-HEAL: repair MATRIX tasks whose description (table) is missing ---
      // These are old tasks outside the sync's updatedDate window, so the normal
      // sync never re-touches them. Re-fetch their descriptions by ID directly.
      if (token && loaded.length) {
        const broken = loaded.filter(
          (t) => t.title?.toUpperCase().includes("MATRIX") && !t.tableHtml
        );
        if (broken.length > 0) {
          console.log(`[WrikeCache] repairing ${broken.length} MATRIX tasks with missing tables`);
          const refetched = await fetchTasksByIds(token, broken.map((t) => t.id));
          const descById = new Map(refetched.map((t) => [t.id, t.description]));
          // Merge parsed description into the EXISTING cached task — preserves
          // the already-correct projectName, assignees, status, etc.
          const repaired = broken
            .filter((t) => descById.get(t.id))
            .map((t) => {
              const parsed = parseWrikeData(descById.get(t.id));
              return {
                ...t,
                tableHtml: parsed.tableHtml,
                notesText: parsed.notesText,
                extractedPathData: parsed.extractedPathData || t.extractedPathData,
              };
            });
          console.log(`[WrikeCache] got descriptions for ${repaired.length}/${broken.length} tasks`);
          if (repaired.length) {
            // Persist each repaired task (UPDATE by id — no dupe rows, fixes all partitions)
            for (const t of repaired) {
              await supabase.from("wrike_tasks_cache").update({ task_data: t }).eq("id", t.id);
            }
            // Merge repaired tasks into state
            setTasks((prev) => {
              const m = new Map(prev.map((p) => [p.id, p]));
              repaired.forEach((t) => m.set(t.id, t));
              return [...m.values()];
            });
            console.log(`[WrikeCache] repaired ${repaired.length} MATRIX tasks`);
          }
        }
      }
    })();
  }, []);

  // --- Core sync function ---
  const sync = useCallback(async ({ fullRefresh = false } = {}) => {
    if (!token) return;
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    setSyncError(null);

    try {
      // Resolve wrike_user_id — re-fetch from API if localStorage was cleared
      let userId = wrikeUserId;
      if (!userId) {
        const meRes = await fetch("https://www.wrike.com/api/v4/contacts?me=true", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meRes.ok) {
          const meJson = await meRes.json();
          userId = meJson.data?.[0]?.id;
          if (userId) localStorage.setItem("wrike_user_id", userId);
        }
      }
      if (!userId) throw new Error("Could not resolve Wrike user ID");

      // Read existing meta (last sync time + cached dicts)
      const { data: meta } = await supabase
        .from("wrike_sync_meta")
        .select("*")
        .eq("wrike_user_id", userId)
        .single();

      const now = Date.now();
      const lastSync = meta?.last_synced_at ? new Date(meta.last_synced_at).getTime() : 0;

      // Skip if recently synced and not a forced refresh
      if (!fullRefresh && now - lastSync < SYNC_INTERVAL_MS) {
        console.log("[WrikeCache] skipping sync — last synced", meta?.last_synced_at);
        return;
      }

      // Determine the lookback window — always format as 2026-03-24T00:00:00Z (no ms, no offset)
      const toWrikeDate = (d) => new Date(d).toISOString().split(".")[0] + "Z";
      const sinceIso = fullRefresh || !meta?.last_synced_at
        ? toWrikeDate(new Date(new Date().setMonth(new Date().getMonth() - LOOKBACK_MONTHS)))
        : toWrikeDate(meta.last_synced_at);

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

      // Filter to the motion-team-relevant subset FIRST (filter only uses base
      // fields — title/parentIds/responsibleIds/subTaskIds — present on every page).
      const relevant = filterToMotionTeam(rawTasks, folderDictionary, contactDictionary);

      // Re-fetch descriptions for any relevant task missing one (pagination drops
      // the fields param on pages 2+). This restores the MATRIX table + notes.
      const missingDesc = relevant.filter((t) => !t.description).map((t) => t.id);
      if (missingDesc.length > 0) {
        console.log(`[WrikeCache] re-fetching descriptions for ${missingDesc.length} tasks`);
        const refetched = await fetchTasksByIds(token, missingDesc);
        const byId = new Map(refetched.map((t) => [t.id, t]));
        relevant.forEach((t) => {
          const full = byId.get(t.id);
          if (full) {
            t.description = full.description;
            t.customFields = full.customFields;
          }
        });
      }

      // Enrich the relevant set (parses description → tableHtml + notesText)
      const filtered = enrichTasks(relevant, folderDictionary, contactDictionary, statusDictionary);

      // Upsert to Supabase in batches
      if (filtered.length > 0) {
        const rows = filtered.map((t) => ({
          id: t.id,
          wrike_user_id: userId,
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
        wrike_user_id: userId,
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
    if (!token) return;
    const t = setTimeout(() => sync(), 500);
    return () => clearTimeout(t);
  }, [token, sync]);

  const syncNow = useCallback(() => sync({ fullRefresh: true }), [sync]);

  return { tasks, isSyncing, lastSynced, syncError, syncNow };
}
