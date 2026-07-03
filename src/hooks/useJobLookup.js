import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Shared job_number -> Job Book record lookup.
 *
 * Tracker and Legacy both guess job/film/client info from raw Wrike data
 * (folder tree-climbing, title parsing) — fragile by nature. The `jobs`
 * table is the authoritative, admin-curated source once a job has been
 * seen: any correction made in Management > Job Book should be trusted
 * over a fresh Wrike guess everywhere else.
 *
 * This hook also self-populates `jobs` the first time a job number is
 * encountered, so Job Book fills in from real usage instead of requiring
 * manual entry, while never overwriting a row that's already there.
 */
export function useJobLookup() {
  const [jobMap, setJobMap] = useState({});

  const load = useCallback(async () => {
    const { data } = await supabase.from("jobs").select("*");
    const map = {};
    (data || []).forEach((j) => { if (j.job_number) map[j.job_number] = j; });
    setJobMap(map);
  }, []);

  useEffect(() => { load(); }, [load]);

  const getJob = useCallback((jobNumber) => jobMap[jobNumber] || null, [jobMap]);

  // Register a job number the first time it's seen, or fill in blank fields on an
  // existing row (e.g. one backfilled without a client). Never overwrites a field
  // that's already set — once Job Book has a value, that's the source of truth.
  const ensureJob = useCallback(async (jobNumber, guess = {}) => {
    if (!jobNumber || jobNumber === "⚠️ Unassigned") return;
    const existing = jobMap[jobNumber];

    if (!existing) {
      const payload = {
        job_number: jobNumber,
        film_title: guess.filmTitle || null,
        client: guess.client || null,
      };
      // Optimistic local add so repeated calls this session don't re-insert
      setJobMap((prev) => (prev[jobNumber] ? prev : { ...prev, [jobNumber]: payload }));
      const { error } = await supabase.from("jobs").insert(payload);
      // 23505 = unique_violation — another tab/component already registered it, fine to ignore
      if (error && error.code !== "23505") {
        console.warn("Failed to register job in Job Book:", error.message);
      }
      return;
    }

    // Fill gaps only — build a patch of just the blank fields we can now fill
    const patch = {};
    if (!existing.film_title && guess.filmTitle) patch.film_title = guess.filmTitle;
    if (!existing.client && guess.client) patch.client = guess.client;
    if (Object.keys(patch).length === 0) return;

    setJobMap((prev) => ({ ...prev, [jobNumber]: { ...prev[jobNumber], ...patch } }));
    const { error } = await supabase.from("jobs").update(patch).eq("job_number", jobNumber);
    if (error) console.warn("Failed to fill in Job Book gaps:", error.message);
  }, [jobMap]);

  return { getJob, ensureJob };
}
