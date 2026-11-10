// Has Wrike got jobs the Job Book hasn't? Runs the Studio Scan over the saved
// copy of Wrike's folder tree (wrike_sync_meta, refreshed daily and patched by
// the webhook), so it makes no Wrike calls and can run whenever the Job Book
// opens.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, selectAll } from "../lib/supabaseClient";
import { scanStudioJobNumbers } from "../lib/wrikeCampaign";
import { copyHealth, pending, reconcile } from "../lib/jobSync";

// Walking ~9,700 folders takes a moment, so one scan serves every tab switch
// for a few minutes.
const FRESH_MS = 5 * 60 * 1000;
let saved = null; // { at, candidates, treeAt, lastEventAt }

export async function scanSavedTree({ force = false } = {}) {
  if (!force && saved && Date.now() - saved.at < FRESH_MS) return saved;
  const [{ data, error }, event] = await Promise.all([
    supabase
      .from("wrike_sync_meta")
      .select("folder_dictionary, dictionaries_refreshed_at")
      .eq("wrike_user_id", "shared")
      .maybeSingle(),
    // When Wrike's webhook last said anything: its silence is the sign that
    // the copy has stopped being patched.
    supabase.from("wrike_webhook_events").select("occurred_at")
      .order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  const tree = data?.folder_dictionary;
  // A handful of folders is a copy that never finished downloading.
  if (!tree || Object.keys(tree).length < 100) throw new Error("TimeHub hasn't saved Wrike's folder list yet");
  const candidates = await scanStudioJobNumbers({ byId: tree, createdDates: false });
  saved = {
    at: Date.now(),
    candidates,
    treeAt: data.dictionaries_refreshed_at || null,
    lastEventAt: event.error ? undefined : (event.data?.occurred_at ?? null),
  };
  return saved;
}

export const loadKeptCodes = async () =>
  new Set((await selectAll("job_sync_kept", "code", undefined, "code")).map((k) => k.code));

// `jobs` is the book as the page already holds it; the comparison reruns when a
// job is edited, without scanning again.
export function useWrikeJobCheck(jobs, ready) {
  const [scan, setScan] = useState(null);
  const [kept, setKept] = useState(() => new Set());
  const [state, setState] = useState("checking"); // checking | ready | unavailable

  const run = useCallback(async () => {
    try {
      const [s, k] = await Promise.all([scanSavedTree(), loadKeptCodes()]);
      setScan(s); setKept(k); setState("ready");
    } catch (e) {
      console.warn("[JobBook] Wrike check unavailable:", e.message || e);
      setState("unavailable");
    }
  }, []);

  // After the table has painted: the scan is a burst of synchronous work.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(run, 300);
    return () => clearTimeout(t);
  }, [ready, run]);

  const waiting = useMemo(
    () => (scan ? pending(reconcile(scan.candidates, jobs), kept) : null),
    [scan, jobs, kept]
  );

  return {
    state, waiting, recheck: run,
    treeAt: scan?.treeAt || null,
    lastEventAt: scan?.lastEventAt,
    health: scan ? copyHealth(scan) : "ok",
  };
}
