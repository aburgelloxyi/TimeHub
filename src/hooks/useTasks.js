import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

// Supabase uses snake_case columns; your app uses camelCase.
// These two functions translate between them so nothing else has to change.

const toDb = (task) => ({
  id: task.id,
  job_number: task.jobNumber,
  territory: task.territory,
  category: task.category,
  notes: task.notes,
  day_of_week: task.dayOfWeek,
  raw_seconds: task.rawSeconds ?? 0,
  additional_seconds: task.additionalSeconds ?? 0,
  date: task.date,
  time_logged: task.timeLogged,
  wrike_timelog_id: task.wrikeTimelogId ?? null,
});

const fromDb = (row) => ({
  id: row.id,
  jobNumber: row.job_number,
  territory: row.territory,
  category: row.category,
  notes: row.notes,
  dayOfWeek: row.day_of_week,
  rawSeconds: row.raw_seconds ?? 0,
  additionalSeconds: row.additional_seconds ?? 0,
  date: row.date,
  timeLogged: row.time_logged,
  wrikeTimelogId: row.wrike_timelog_id,
});

export function useTasks(triggerToast) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- Load all tasks on mount ---
  useEffect(() => {
    const fetchTasks = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("id", { ascending: false });

      if (error) {
        console.error("Failed to load tasks:", error);
        triggerToast?.("Failed to load tasks from database.");
      } else {
        setTasks((data ?? []).map(fromDb));
      }
      setLoading(false);
    };

    fetchTasks();
  }, []);

  // --- Add a single task ---
  const addTask = useCallback(async (task) => {
    // Optimistic update — show it instantly, sync in background
    setTasks((prev) => [task, ...prev]);

    const { error } = await supabase.from("tasks").insert(toDb(task));

    if (error) {
      console.error("Failed to save task:", error);
      triggerToast?.("Saved locally but failed to sync. Try again.");
      // Roll back the optimistic update
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    }
  }, []);

  // --- Add multiple tasks at once (Wrike pull) ---
  const addTasks = useCallback(async (newTasks) => {
    setTasks((prev) => [...newTasks, ...prev]);

    const { error } = await supabase.from("tasks").insert(newTasks.map(toDb));

    if (error) {
      console.error("Failed to save tasks:", error);
      triggerToast?.("Some tasks failed to sync. Try pulling again.");
      setTasks((prev) =>
        prev.filter((t) => !newTasks.some((nt) => nt.id === t.id))
      );
    }
  }, []);

  // --- Update one or more fields on a task ---
  const updateTask = useCallback(async (id, changes) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...changes } : t))
    );

    // Translate only the changed fields to snake_case
    const dbChanges = {};
    if ("jobNumber" in changes) dbChanges.job_number = changes.jobNumber;
    if ("territory" in changes) dbChanges.territory = changes.territory;
    if ("category" in changes) dbChanges.category = changes.category;
    if ("notes" in changes) dbChanges.notes = changes.notes;
    if ("dayOfWeek" in changes) dbChanges.day_of_week = changes.dayOfWeek;
    if ("rawSeconds" in changes) dbChanges.raw_seconds = changes.rawSeconds;
    if ("additionalSeconds" in changes) dbChanges.additional_seconds = changes.additionalSeconds;

    const { error } = await supabase.from("tasks").update(dbChanges).eq("id", id);

    if (error) {
      console.error("Failed to update task:", error);
      triggerToast?.("Update failed to sync.");
    }
  }, []);

  // --- Update multiple tasks at once (batch group edit) ---
  const updateTasks = useCallback(async (ids, changes) => {
    setTasks((prev) =>
      prev.map((t) => (ids.includes(t.id) ? { ...t, ...changes } : t))
    );

    const dbChanges = {};
    if ("jobNumber" in changes) dbChanges.job_number = changes.jobNumber;
    if ("territory" in changes) dbChanges.territory = changes.territory;
    if ("category" in changes) dbChanges.category = changes.category;

    // Supabase doesn't batch-update multiple rows by ID list in one call cleanly,
    // so we do them in parallel — still fast, just a few simultaneous requests
    const results = await Promise.all(
      ids.map((id) =>
        supabase.from("tasks").update(dbChanges).eq("id", id)
      )
    );

    const failed = results.some((r) => r.error);
    if (failed) {
      triggerToast?.("Some updates failed to sync.");
    }
  }, []);

  // --- Delete one or more tasks ---
  const deleteTasks = useCallback(async (ids) => {
    setTasks((prev) => prev.filter((t) => !ids.includes(t.id)));

    const { error } = await supabase.from("tasks").delete().in("id", ids);

    if (error) {
      console.error("Failed to delete tasks:", error);
      triggerToast?.("Delete failed to sync.");
    }
  }, []);

  // --- Import/merge a batch (from JSON paste) ---
  const importTasks = useCallback(async (incoming) => {
    const existingIds = new Set(tasks.map((t) => t.id));
    const newTasks = incoming.filter((t) => !existingIds.has(t.id));

    if (newTasks.length === 0) {
      triggerToast?.("No new tasks found in the pasted data.");
      return 0;
    }

    setTasks((prev) => [...newTasks, ...prev]);

    const { error } = await supabase.from("tasks").insert(newTasks.map(toDb));

    if (error) {
      console.error("Import failed:", error);
      triggerToast?.("Import failed to sync.");
      setTasks((prev) =>
        prev.filter((t) => !newTasks.some((nt) => nt.id === t.id))
      );
      return 0;
    }

    return newTasks.length;
  }, [tasks]);

  return {
    tasks,
    setTasks, // escape hatch — used by triage/timer increments that update locally
    loading,
    addTask,
    addTasks,
    updateTask,
    updateTasks,
    deleteTasks,
    importTasks,
  };
}
