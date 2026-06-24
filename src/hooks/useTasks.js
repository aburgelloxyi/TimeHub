import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";

// --- Translators ---

const secsToHours = (s) => (s > 0 ? (s / 3600).toFixed(2) : null);
const hoursToSecs = (h) => (h && h !== "none" ? Math.round(parseFloat(h) * 3600) : 0);

const toDb = (task) => ({
  id: task.id,
  source: task.source || "tracker",
  wrike_user_id: task.wrikeUserId ?? null,
  // Shared
  job_number: task.jobNumber ?? null,
  category: task.category ?? null,
  day_of_week: task.dayOfWeek ?? null,
  date: task.date ?? null,
  territory: task.territory ?? null,
  notes: task.notes ?? null,
  wrike_timelog_id: task.wrikeTimelogId ?? null,
  // Time: DB stores decimal hours; in-memory uses seconds
  time_spent: task.timeSpent ?? secsToHours(task.rawSeconds ?? 0),
  additional_time: task.additionalTime ?? secsToHours(task.additionalSeconds ?? 0),
  // Legacy fields
  film_title: task.filmTitle ?? null,
  client: task.client ?? null,
  project_description: task.projectDescription ?? null,
  client_amends: task.clientAmends ?? false,
  is_3d: task.is3D ?? false,
  task_id: task.taskId ?? null,
});

const fromDb = (row) => ({
  id: row.id,
  source: row.source || "tracker",
  wrikeUserId: row.wrike_user_id,
  // Shared
  jobNumber: row.job_number,
  category: row.category,
  dayOfWeek: row.day_of_week,
  date: row.date,
  territory: row.territory,
  notes: row.notes,
  wrikeTimelogId: row.wrike_timelog_id,
  // Time: decimal hours from DB, seconds derived for in-memory use
  timeSpent: row.time_spent,
  additionalTime: row.additional_time,
  rawSeconds: hoursToSecs(row.time_spent),
  additionalSeconds: hoursToSecs(row.additional_time),
  // Legacy fields
  filmTitle: row.film_title,
  client: row.client,
  projectDescription: row.project_description,
  clientAmends: row.client_amends ?? false,
  is3D: row.is_3d ?? false,
  taskId: row.task_id,
});

/**
 * Supabase-backed task store.
 *
 * @param triggerToast  Toast callback
 * @param source        "tracker" | "legacy" | null (no filter)
 * @param wrikeUserId   The Wrike user ID — used to scope reads/writes to the
 *                      current user. Falls back to localStorage on each render
 *                      so subsequent page loads are instant (no waiting for the
 *                      Wrike API call to complete before tasks appear).
 */
export function useTasks(triggerToast, source = null, wrikeUserId = null) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Prop takes priority; localStorage is the fast-path for subsequent loads
  // (already set by setWrikeUserId() on a previous visit).
  const effectiveUid = useMemo(
    () => wrikeUserId || localStorage.getItem("wrike_user_id") || null,
    [wrikeUserId]
  );

  // Stable ref so insert/update callbacks always stamp the latest user ID
  // without needing to be re-created (avoids cascading re-renders).
  const uidRef = useRef(effectiveUid);
  useEffect(() => { uidRef.current = effectiveUid; }, [effectiveUid]);

  // Re-fetch when source or user ID changes
  useEffect(() => {
    const fetchTasks = async () => {
      setLoading(true);
      let query = supabase.from("tasks").select("*").order("id", { ascending: false });
      if (source) query = query.eq("source", source);
      if (effectiveUid) query = query.eq("wrike_user_id", effectiveUid);

      const { data, error } = await query;

      if (error) {
        console.error("Failed to load tasks:", error);
        triggerToast?.("Failed to load tasks from database.");
      } else {
        setTasks((data ?? []).map(fromDb));
      }
      setLoading(false);
    };

    fetchTasks();
  }, [source, effectiveUid]);

  const addTask = useCallback(async (task) => {
    const t = { ...task, wrikeUserId: task.wrikeUserId ?? uidRef.current };
    setTasks((prev) => [t, ...prev]);
    const { error } = await supabase.from("tasks").insert(toDb(t));
    if (error) {
      console.error("Failed to save task:", error);
      triggerToast?.("Saved locally but failed to sync.");
      setTasks((prev) => prev.filter((x) => x.id !== t.id));
    }
  }, []);

  const addTasks = useCallback(async (newTasks) => {
    const stamped = newTasks.map((t) => ({ ...t, wrikeUserId: t.wrikeUserId ?? uidRef.current }));
    setTasks((prev) => [...stamped, ...prev]);
    const { error } = await supabase.from("tasks").insert(stamped.map(toDb));
    if (error) {
      console.error("Failed to save tasks:", error);
      triggerToast?.("Some tasks failed to sync.");
      setTasks((prev) => prev.filter((t) => !stamped.some((s) => s.id === t.id)));
    }
  }, []);

  const updateTask = useCallback(async (id, changes) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...changes } : t)));

    const KEY_MAP = {
      jobNumber: "job_number", territory: "territory", category: "category",
      notes: "notes", dayOfWeek: "day_of_week",
      filmTitle: "film_title", client: "client",
      projectDescription: "project_description",
      timeSpent: "time_spent", additionalTime: "additional_time",
      clientAmends: "client_amends", is3D: "is_3d",
    };

    // Convert in-memory seconds to decimal hours before persisting
    const resolved = { ...changes };
    if ("rawSeconds" in resolved) {
      resolved.timeSpent = secsToHours(resolved.rawSeconds ?? 0);
      delete resolved.rawSeconds;
    }
    if ("additionalSeconds" in resolved) {
      resolved.additionalTime = secsToHours(resolved.additionalSeconds ?? 0);
      delete resolved.additionalSeconds;
    }

    const dbChanges = {};
    for (const [key, val] of Object.entries(resolved)) {
      if (KEY_MAP[key]) dbChanges[KEY_MAP[key]] = val;
    }

    const { error } = await supabase.from("tasks").update(dbChanges).eq("id", id);
    if (error) {
      console.error("Failed to update task:", error);
      triggerToast?.("Update failed to sync.");
    }
  }, []);

  const updateTasks = useCallback(async (ids, changes) => {
    setTasks((prev) => prev.map((t) => (ids.includes(t.id) ? { ...t, ...changes } : t)));
    const KEY_MAP = {
      jobNumber: "job_number", territory: "territory", category: "category",
      filmTitle: "film_title", client: "client",
      projectDescription: "project_description",
    };
    const dbChanges = {};
    for (const [key, val] of Object.entries(changes)) {
      if (KEY_MAP[key]) dbChanges[KEY_MAP[key]] = val;
    }
    const results = await Promise.all(
      ids.map((id) => supabase.from("tasks").update(dbChanges).eq("id", id))
    );
    if (results.some((r) => r.error)) triggerToast?.("Some updates failed to sync.");
  }, []);

  const deleteTasks = useCallback(async (ids) => {
    setTasks((prev) => prev.filter((t) => !ids.includes(t.id)));
    const { error } = await supabase.from("tasks").delete().in("id", ids);
    if (error) {
      console.error("Failed to delete:", error);
      triggerToast?.("Delete failed to sync.");
    }
  }, []);

  const importTasks = useCallback(async (incoming) => {
    const existingIds = new Set(tasks.map((t) => t.id));
    const stamped = incoming
      .filter((t) => !existingIds.has(t.id))
      .map((t) => ({ ...t, wrikeUserId: t.wrikeUserId ?? uidRef.current }));
    if (stamped.length === 0) { triggerToast?.("No new tasks found."); return 0; }
    setTasks((prev) => [...stamped, ...prev]);
    const { error } = await supabase.from("tasks").insert(stamped.map(toDb));
    if (error) {
      triggerToast?.("Import failed to sync.");
      setTasks((prev) => prev.filter((t) => !stamped.some((s) => s.id === t.id)));
      return 0;
    }
    return stamped.length;
  }, [tasks]);

  return {
    tasks, setTasks, loading,
    addTask, addTasks, updateTask, updateTasks, deleteTasks, importTasks,
  };
}
