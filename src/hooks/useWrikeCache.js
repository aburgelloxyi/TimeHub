import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  enrichTasks,
  filterToMotionTeam,
  hydrateMissingFolders,
  parseWrikeData,
  getStudioName,
  getFilmName,
  buildChildToParent,
  buildFilmCodeMappings,
} from "../lib/wrikeEnrich";

const FIELDS_FILTER = encodeURIComponent(
  "[customFields,parentIds,responsibleIds,subTaskIds,description]"
);
const SYNC_INTERVAL_MS  = 15 * 60 * 1000;   // re-sync if data is >15 min old
const META_MAX_AGE_MS   = 24 * 60 * 60 * 1000; // refresh folder/contact dicts daily
const LOOKBACK_MONTHS   = 2;                 // how far back the full refresh window goes

// ---------------------------------------------------------------------------
// Fetch folders, contacts, workflows from Wrike
// ---------------------------------------------------------------------------
async function fetchWrikeMeta() {
  // Paginate folders — childIds is NOT returned by default on the flat /folders
  // list, so request it explicitly. We store childIds and build a reverse
  // childToParent map for upward tree climbing (parentIds is never returned).
  const folderDictionary = {};
  const FOLDER_FIELDS = encodeURIComponent("[childIds]");
  let folderUrl = `/api/wrike/folders?fields=${FOLDER_FIELDS}`;
  while (folderUrl) {
    const fRes = await fetch(folderUrl);
    if (!fRes.ok) { console.warn("[WrikeCache] folders fetch failed", fRes.status); break; }
    const fJson = await fRes.json();
    fJson.data?.forEach((f) => { folderDictionary[f.id] = { id: f.id, title: f.title, childIds: f.childIds || [] }; });
    folderUrl = fJson.nextPageToken
      ? `/api/wrike/folders?fields=${FOLDER_FIELDS}&nextPageToken=${fJson.nextPageToken}`
      : null;
  }
  console.log(`[WrikeCache] folder dictionary loaded: ${Object.keys(folderDictionary).length} folders`);

  const [cRes, wRes] = await Promise.all([
    fetch("/api/wrike/contacts"),
    fetch("/api/wrike/workflows"),
  ]);

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
async function fetchWrikeTasks(sinceIso) {
  const dateFilter = encodeURIComponent(`{"start":"${sinceIso}"}`);
  let rawTasks = [];
  let nextPageToken = null;

  while (true) {
    const url = nextPageToken
      ? `/api/wrike/tasks?nextPageToken=${nextPageToken}`
      : `/api/wrike/tasks?fields=${FIELDS_FILTER}&updatedDate=${dateFilter}&pageSize=1000`;
    console.log("[WrikeCache] fetching:", url);
    const res = await fetch(url);
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
async function fetchTasksByIds(ids) {
  const out = [];
  // Batch up to 100 IDs per request — Wrike supports comma-separated IDs
  // and returns description by default (no fields param needed).
  const BATCH = 100;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    try {
      const r = await fetch(`/api/wrike/tasks/${batch.join(",")}`);
      if (r.ok) {
        const tasks = (await r.json()).data || [];
        out.push(...tasks);
      } else {
        // Batch failed — fall back to individual fetches for this batch
        for (const id of batch) {
          try {
            const r2 = await fetch(`/api/wrike/tasks/${id}`);
            if (r2.ok) {
              const task = (await r2.json()).data?.[0];
              if (task) out.push(task);
            }
          } catch (e) { console.warn(`[WrikeCache] refetch ${id} error`, e); }
        }
      }
    } catch (e) {
      console.warn(`[WrikeCache] batch refetch error`, e);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Root studio folders whose direct children are film/campaign folders
// ---------------------------------------------------------------------------
const STUDIO_FOLDER_TITLES = ["WARNER BROS", "SONY"];

function deriveFolderCampaigns(folderDictionary) {
  const campaigns = [];
  const seen = new Set();
  for (const folder of Object.values(folderDictionary)) {
    if (!STUDIO_FOLDER_TITLES.includes(folder.title?.trim().toUpperCase())) continue;
    for (const childId of folder.childIds || []) {
      if (seen.has(childId)) continue;
      seen.add(childId);
      const child = folderDictionary[childId];
      if (!child?.title) continue;
      const title = child.title.trim().replace(/_/g, " ");
      if (!title || title.startsWith("_") || title.toUpperCase().includes("ARCHIVE") || title.toUpperCase().includes("TEMPLATE")) continue;
      campaigns.push({
        id: `folder-${childId}`,
        folderId: childId,
        title,
        wrikeLink: `https://www.wrike.com/open.htm?id=${childId}`,
        studioHint: "Others",
        isFolder: true,
        notes: [],
        matrices: [],
        links: [],
      });
    }
  }
  return campaigns;
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------
export function useWrikeCache() {
  const [tasks, setTasks]                       = useState([]);
  const [folderCampaigns, setFolderCampaigns]   = useState([]);
  const [filmCodeMappings, setFilmCodeMappings] = useState({});
  const [isSyncing, setIsSyncing]               = useState(false);
  const [isScanning, setIsScanning]             = useState(false);
  const [lastSynced, setLastSynced]             = useState(null);
  const [syncError, setSyncError]               = useState(null);
  const syncingRef  = useRef(false);
  const scanningRef = useRef(false);
  // Dictionaries needed to enrich a single webhook-pushed task outside of a
  // full sync() call — sync() only keeps these as local variables, so we
  // mirror the latest copy here whenever mount-load or sync() refreshes them.
  const enrichCtxRef = useRef({
    folderDictionary: {},
    contactDictionary: {},
    statusDictionary: {},
    childToParent: {},
    filmCodeMappings: {},
  });

  const wrikeUserId = localStorage.getItem("wrike_user_id");

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
        .select("last_synced_at,folder_dictionary,contact_dictionary,status_dictionary,film_code_mappings")
        .order("last_synced_at", { ascending: false })
        .limit(1)
        .single();
      if (meta?.last_synced_at) setLastSynced(new Date(meta.last_synced_at));
      if (meta?.film_code_mappings && Object.keys(meta.film_code_mappings).length) {
        setFilmCodeMappings(meta.film_code_mappings);
      }
      enrichCtxRef.current = {
        folderDictionary: meta?.folder_dictionary || {},
        contactDictionary: meta?.contact_dictionary || {},
        statusDictionary: meta?.status_dictionary || {},
        childToParent: buildChildToParent(meta?.folder_dictionary || {}),
        filmCodeMappings: meta?.film_code_mappings || {},
      };

      // --- SELF-HEAL + STUDIO BACKFILL ---
      // MATRIX tasks that predate parentIds in FIELDS_FILTER have parentIds=undefined.
      // Re-fetch those by ID to get full data. Also re-fetch any still missing tableHtml.
      // After repair, fetch a fresh folder dict if the Supabase copy is sparse, then
      // backfill studioName on every task that still lacks it.
      if (wrikeUserId && loaded.length) {
        const broken = loaded.filter(
          (t) => t.title?.toUpperCase().includes("MATRIX") && (!t.tableHtml || !t.parentIds?.length)
        );
        if (broken.length > 0) {
          console.log(`[WrikeCache] repairing ${broken.length} MATRIX tasks (missing table/parentIds)`);
          const refetched = await fetchTasksByIds(broken.map((t) => t.id));
          const refetchedById = new Map(refetched.map((t) => [t.id, t]));
          const repaired = broken
            .filter((t) => refetchedById.get(t.id))
            .map((t) => {
              const full = refetchedById.get(t.id);
              const parsed = parseWrikeData(full.description);
              return {
                ...t,
                parentIds: full.parentIds || t.parentIds,
                tableHtml: parsed.tableHtml || t.tableHtml,
                notesText: parsed.notesText || t.notesText,
                extractedPathData: parsed.extractedPathData || t.extractedPathData,
              };
            });
          if (repaired.length) {
            for (const t of repaired) {
              await supabase.from("wrike_tasks_cache").update({ task_data: t }).eq("id", t.id);
            }
            setTasks((prev) => {
              const m = new Map(prev.map((p) => [p.id, p]));
              repaired.forEach((t) => m.set(t.id, t));
              return [...m.values()];
            });
            // Update loaded so the studio backfill below sees the repaired parentIds
            repaired.forEach((t) => {
              const idx = loaded.findIndex((l) => l.id === t.id);
              if (idx >= 0) loaded[idx] = t;
            });
            console.log(`[WrikeCache] repaired ${repaired.length} MATRIX tasks`);
          }
        }

        // Get fresh folder dictionary. The cached Supabase copy may be unusable for
        // tree-climbing if it predates the childIds fix (childIds absent or empty),
        // so we build the reverse parent map and re-fetch whenever it comes out empty.
        let fd = meta?.folder_dictionary || {};
        let c2p = buildChildToParent(fd);
        if (Object.keys(fd).length < 500 || Object.keys(c2p).length === 0) {
          console.log("[WrikeCache] folder dict sparse or missing childIds — fetching fresh from Wrike");
          const freshFd = {};
          const FF = encodeURIComponent("[childIds]");
          let folderUrl = `/api/wrike/folders?fields=${FF}`;
          let logged = false;
          while (folderUrl) {
            try {
              const fRes = await fetch(folderUrl);
              if (!fRes.ok) { console.warn("[WrikeCache] folders fetch failed", fRes.status); break; }
              const fJson = await fRes.json();
              if (!logged && fJson.data?.[0]) {
                console.log("[WrikeCache] sample folder:", JSON.stringify(fJson.data[0]));
                logged = true;
              }
              fJson.data?.forEach((f) => { freshFd[f.id] = { id: f.id, title: f.title, childIds: f.childIds || [] }; });
              folderUrl = fJson.nextPageToken
                ? `/api/wrike/folders?fields=${FF}&nextPageToken=${fJson.nextPageToken}`
                : null;
            } catch { break; }
          }
          if (Object.keys(freshFd).length > 100) {
            fd = freshFd;
            c2p = buildChildToParent(fd);
            console.log(`[WrikeCache] fresh folder dict: ${Object.keys(fd).length} folders`);
            supabase.from("wrike_sync_meta").upsert({ folder_dictionary: fd });
          }
        }
        console.log(`[WrikeCache] backfill: ${Object.keys(fd).length} folders, ${Object.keys(c2p).length} parent links`);
        enrichCtxRef.current = { ...enrichCtxRef.current, folderDictionary: fd, childToParent: c2p };
        const derived = deriveFolderCampaigns(fd);
        if (derived.length > 0) {
          console.log(`[WrikeCache] folder campaigns derived: ${derived.length}`);
          setFolderCampaigns(derived);
        }

        const needsStudio = loaded.filter((t) => !t.studioName);
        if (needsStudio.length > 0 && Object.keys(fd).length > 100) {
          const backfilled = needsStudio
            .map((t) => ({ ...t, studioName: getStudioName(t, fd, c2p) }))
            .filter((t) => t.studioName);
          if (backfilled.length > 0) {
            setTasks((prev) => {
              const m = new Map(prev.map((p) => [p.id, p]));
              backfilled.forEach((t) => m.set(t.id, t));
              return [...m.values()];
            });
            backfilled.forEach((t) => {
              supabase.from("wrike_tasks_cache").update({ task_data: t }).eq("id", t.id);
            });
            console.log(`[WrikeCache] studio backfilled ${backfilled.length} tasks`);
          }
        }
      }
    })();
  }, []);

  // --- Core sync function ---
  const sync = useCallback(async ({ fullRefresh = false } = {}) => {
    if (!wrikeUserId) return;
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    setSyncError(null);

    try {
      // Resolve wrike_user_id — re-fetch from API if localStorage was cleared
      let userId = wrikeUserId;
      if (!userId) {
        const meRes = await fetch("/api/wrike/contacts?me=true");
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
      const folderDictSize = Object.keys(meta?.folder_dictionary || {}).length;
      const needsMetaRefresh = fullRefresh || metaAge > META_MAX_AGE_MS || !meta?.folder_dictionary || folderDictSize < 10;

      let folderDictionary  = meta?.folder_dictionary  || {};
      let contactDictionary = meta?.contact_dictionary || {};
      let statusDictionary  = meta?.status_dictionary  || {};
      const existingFilmMappings = meta?.film_code_mappings || {};

      if (needsMetaRefresh) {
        ({ folderDictionary, contactDictionary, statusDictionary } = await fetchWrikeMeta());
      }

      // Fetch tasks changed since last sync
      const rawTasks = await fetchWrikeTasks(sinceIso);

      // Hydrate any missing archive folder IDs
      if (rawTasks.length > 0) {
        await hydrateMissingFolders(rawTasks, folderDictionary);
      }

      // Filter to the motion-team-relevant subset FIRST (filter only uses base
      // fields — title/parentIds/responsibleIds/subTaskIds — present on every page).
      const relevant = filterToMotionTeam(rawTasks, folderDictionary, contactDictionary);

      // Tasks Wrike reports as changed but that no longer pass the filter
      // (e.g. reassigned off the Motion team) must be purged from the cache —
      // otherwise their stale pre-change copy lingers there forever, since
      // nothing else ever revisits a task once it drops out of relevance.
      const relevantIds = new Set(relevant.map((t) => t.id));
      const droppedIds = rawTasks.filter((t) => !relevantIds.has(t.id)).map((t) => t.id);

      // Re-fetch descriptions for any relevant task missing one (pagination drops
      // the fields param on pages 2+). This restores the MATRIX table + notes.
      const missingDesc = relevant.filter((t) => !t.description).map((t) => t.id);
      if (missingDesc.length > 0) {
        console.log(`[WrikeCache] re-fetching descriptions for ${missingDesc.length} tasks`);
        const refetched = await fetchTasksByIds(missingDesc);
        const byId = new Map(refetched.map((t) => [t.id, t]));
        relevant.forEach((t) => {
          const full = byId.get(t.id);
          if (full) {
            t.description = full.description;
            t.customFields = full.customFields;
          }
        });
      }

      // Build reverse childToParent map for upward BFS studio detection
      const childToParent = buildChildToParent(folderDictionary);

      // Derive folder-based campaigns from Warner Bros / Sony root folders
      if (needsMetaRefresh) {
        const derived = deriveFolderCampaigns(folderDictionary);
        if (derived.length > 0) {
          console.log(`[WrikeCache] folder campaigns (sync): ${derived.length}`);
          setFolderCampaigns(derived);
        }
      }

      // Enrich the relevant set (parses description → tableHtml + notesText)
      const filtered = enrichTasks(relevant, folderDictionary, contactDictionary, statusDictionary, childToParent, existingFilmMappings);

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
      if (droppedIds.length > 0) {
        await supabase.from("wrike_tasks_cache").delete().in("id", droppedIds);
        console.log(`[WrikeCache] purged ${droppedIds.length} task(s) no longer Motion-relevant`);
      }

      // Collect code→filmName mappings discovered in this sync and merge with existing
      const newMappings = buildFilmCodeMappings(filtered);
      const mergedFilmMappings = { ...existingFilmMappings, ...newMappings };
      if (Object.keys(newMappings).length > 0) {
        setFilmCodeMappings(mergedFilmMappings);
        console.log(`[WrikeCache] film code mappings: ${Object.keys(mergedFilmMappings).length} total, ${Object.keys(newMappings).length} new this sync`);
      }

      // Persist updated meta
      await supabase.from("wrike_sync_meta").upsert({
        wrike_user_id: userId,
        last_synced_at: new Date().toISOString(),
        folder_dictionary:  needsMetaRefresh ? folderDictionary  : (meta?.folder_dictionary  ?? {}),
        contact_dictionary: needsMetaRefresh ? contactDictionary : (meta?.contact_dictionary ?? {}),
        status_dictionary:  needsMetaRefresh ? statusDictionary  : (meta?.status_dictionary  ?? {}),
        film_code_mappings: mergedFilmMappings,
      });
      enrichCtxRef.current = {
        folderDictionary,
        contactDictionary,
        statusDictionary,
        childToParent,
        filmCodeMappings: mergedFilmMappings,
      };

      // Merge new tasks into state, then backfill studioName on any task still missing it.
      // Archived tasks (outside the lookback window) are never re-enriched, so we use the
      // live in-memory folderDictionary (always complete) rather than the Supabase-stored copy.
      setTasks((prev) => {
        const map = new Map(prev.map((t) => [t.id, t]));
        droppedIds.forEach((id) => map.delete(id));
        filtered.forEach((t) => map.set(t.id, t));
        const merged = [...map.values()];

        const needsStudio = merged.filter((t) => !t.studioName);
        if (needsStudio.length > 0 && Object.keys(folderDictionary).length > 0) {
          const backfilled = [];
          needsStudio.forEach((t) => {
            const studio = getStudioName(t, folderDictionary, childToParent);
            if (studio) {
              const updated = { ...t, studioName: studio };
              map.set(t.id, updated);
              backfilled.push(updated);
            }
          });
          if (backfilled.length > 0) {
            console.log(`[WrikeCache] studio backfilled ${backfilled.length} tasks (sync)`);
            backfilled.forEach((t) => {
              supabase.from("wrike_tasks_cache").update({ task_data: t }).eq("id", t.id);
            });
          }
        }

        return [...map.values()];
      });

      const syncedAt = new Date();
      setLastSynced(syncedAt);
    } catch (err) {
      console.error("Wrike cache sync failed:", err);
      setSyncError(err.message);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [wrikeUserId]);

  // --- Background sync on mount (after cache loads) ---
  useEffect(() => {
    if (!wrikeUserId) return;
    const t = setTimeout(() => sync(), 500);
    return () => clearTimeout(t);
  }, [wrikeUserId, sync]);

  const syncNow = useCallback(() => sync({ fullRefresh: true }), [sync]);

  // --- Live updates: Wrike webhook events pushed via Supabase Realtime ---
  // The Worker (worker/index.js) receives Wrike webhooks and writes lightweight
  // {task_id, event_type} rows into wrike_webhook_events. We pick those up here,
  // fetch just the changed task(s), and run them through the same enrichTasks
  // pipeline sync() uses — this is the fast path; sync()'s 15-min poll remains
  // the fallback for missed webhook deliveries or when no tab is open.
  const handleWebhookTaskIds = useCallback(async (ids) => {
    if (!ids.length) return;

    let ctx = enrichCtxRef.current;
    if (Object.keys(ctx.folderDictionary).length === 0) {
      // No dictionaries in memory yet (e.g. tab just opened, sync() hasn't run) —
      // fall back to the last synced copy in Supabase.
      const { data: meta } = await supabase
        .from("wrike_sync_meta")
        .select("folder_dictionary,contact_dictionary,status_dictionary,film_code_mappings")
        .order("last_synced_at", { ascending: false })
        .limit(1)
        .single();
      ctx = {
        folderDictionary: meta?.folder_dictionary || {},
        contactDictionary: meta?.contact_dictionary || {},
        statusDictionary: meta?.status_dictionary || {},
        childToParent: buildChildToParent(meta?.folder_dictionary || {}),
        filmCodeMappings: meta?.film_code_mappings || {},
      };
      enrichCtxRef.current = ctx;
    }

    const raw = await fetchTasksByIds(ids);
    if (!raw.length) return;

    const enriched = enrichTasks(
      raw,
      ctx.folderDictionary,
      ctx.contactDictionary,
      ctx.statusDictionary,
      ctx.childToParent,
      ctx.filmCodeMappings
    );

    const rows = enriched.map((t) => ({
      id: t.id,
      wrike_user_id: wrikeUserId,
      task_data: t,
      updated_date: t.updatedDate ?? null,
    }));
    await supabase.from("wrike_tasks_cache").upsert(rows);

    setTasks((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]));
      enriched.forEach((t) => map.set(t.id, t));
      return [...map.values()];
    });
    console.log(`[WrikeCache] realtime: updated ${enriched.length} task(s) from webhook event(s)`);
  }, [wrikeUserId]);

  useEffect(() => {
    if (!wrikeUserId) return;

    let pendingIds = new Set();
    let debounceTimer = null;
    const flush = () => {
      const ids = [...pendingIds];
      pendingIds = new Set();
      debounceTimer = null;
      handleWebhookTaskIds(ids);
    };

    const channel = supabase
      .channel("wrike_webhook_events_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wrike_webhook_events" },
        (payload) => {
          const taskId = payload.new?.task_id;
          if (!taskId) return;
          pendingIds.add(taskId);
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(flush, 2000);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [wrikeUserId, handleWebhookTaskIds]);

  // --- Broad film-code mapping scan (all tasks, not just Motion-filtered) ---
  // Fetches every task from the last 2 years with minimal fields (parentIds only),
  // runs getFilmName via tree-climb on each, and persists newly discovered code→name
  // pairs without touching last_synced_at or the task cache.
  const scanFilmMappings = useCallback(async () => {
    if (!wrikeUserId) return;
    if (scanningRef.current) return;
    scanningRef.current = true;
    setIsScanning(true);

    try {
      // Load existing mappings + folder dict from Supabase
      const { data: meta } = await supabase
        .from("wrike_sync_meta")
        .select("folder_dictionary, film_code_mappings, wrike_user_id")
        .order("last_synced_at", { ascending: false })
        .limit(1)
        .single();

      let fd = meta?.folder_dictionary || {};
      const existingMappings = meta?.film_code_mappings || filmCodeMappings;
      const userId = meta?.wrike_user_id || wrikeUserId;

      // Fetch a fresh folder dict if the cached one is too sparse to tree-climb
      if (Object.keys(fd).length < 100) {
        const FF = encodeURIComponent("[childIds]");
        let url = `/api/wrike/folders?fields=${FF}`;
        while (url) {
          try {
            const r = await fetch(url);
            if (!r.ok) break;
            const j = await r.json();
            j.data?.forEach((f) => { fd[f.id] = { id: f.id, title: f.title, childIds: f.childIds || [] }; });
            url = j.nextPageToken
              ? `/api/wrike/folders?fields=${FF}&nextPageToken=${j.nextPageToken}`
              : null;
          } catch { break; }
        }
        console.log(`[FilmScan] fetched ${Object.keys(fd).length} folders`);
      }

      // Build reverse childId→parentId map so getFilmName can climb deep hierarchies
      // even when the flat folder list only returned childIds (not parentIds).
      const childToParent = buildChildToParent(fd);

      // Fetch all tasks updated in the last 2 years — minimal fields (parentIds only,
      // no descriptions) so the response is fast and lightweight.
      const SCAN_FIELDS = encodeURIComponent("[parentIds]");
      const since = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000)
        .toISOString().split(".")[0] + "Z";
      const dateFilter = encodeURIComponent(`{"start":"${since}"}`);

      let allTasks = [];
      let nextPageToken = null;
      while (true) {
        const url = nextPageToken
          ? `/api/wrike/tasks?nextPageToken=${nextPageToken}`
          : `/api/wrike/tasks?fields=${SCAN_FIELDS}&updatedDate=${dateFilter}&pageSize=1000`;
        const r = await fetch(url);
        if (!r.ok) { console.warn("[FilmScan] task fetch failed", r.status); break; }
        const j = await r.json();
        allTasks = [...allTasks, ...(j.data || [])];
        nextPageToken = j.nextPageToken;
        if (!nextPageToken) break;
      }
      console.log(`[FilmScan] ${allTasks.length} tasks to scan`);

      const newMappings = {};
      for (const task of allTasks) {
        if (!task.title) continue;
        const rawPrefix = task.title.split(/[_|-]/)[0].trim();
        // Only well-formed codes (2–8 uppercase alphanumeric chars starting with a letter)
        if (!/^[A-Z][A-Z0-9]{1,7}$/.test(rawPrefix)) continue;
        // Skip codes we already know
        if (existingMappings[rawPrefix] || newMappings[rawPrefix]) continue;

        const filmName = getFilmName(task, fd, "", {}, childToParent);
        if (!filmName || filmName === "Unknown Project") continue;

        // Skip if the result is just the title-cased prefix (raw fallback, not useful)
        const fallbackName = rawPrefix.charAt(0) + rawPrefix.slice(1).toLowerCase();
        if (filmName === fallbackName) continue;

        newMappings[rawPrefix] = filmName;
      }

      const merged = { ...existingMappings, ...newMappings };
      setFilmCodeMappings(merged);
      console.log(`[FilmScan] ${Object.keys(newMappings).length} new mappings, ${Object.keys(merged).length} total`);

      if (userId) {
        await supabase
          .from("wrike_sync_meta")
          .update({ film_code_mappings: merged })
          .eq("wrike_user_id", userId);
      }
    } catch (err) {
      console.error("[FilmScan] failed:", err);
    } finally {
      scanningRef.current = false;
      setIsScanning(false);
    }
  }, [wrikeUserId, filmCodeMappings]);

  // `sync` (soft) respects the 15-min interval — cheap to call speculatively,
  // e.g. whenever a page that depends on fresh data becomes active.
  // `syncNow` forces a full refresh regardless of how recently synced.
  return { tasks, folderCampaigns, filmCodeMappings, isSyncing, isScanning, lastSynced, syncError, sync, syncNow, scanFilmMappings };
}
