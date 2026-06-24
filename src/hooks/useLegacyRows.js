import { useCallback, useMemo } from "react";
import { useTasks } from "./useTasks";

// Legacy time values are decimal hours in 0.5h steps (0.5 = 30min, 1.5 = 1h30m)
const toSeconds = (val) => {
  if (!val || val === "none") return 0;
  return Math.round(parseFloat(val) * 3600);
};

// Round seconds to nearest 0.5h step and return as decimal string
const secondsToDecimalRounded = (s) => {
  const halfHours = Math.round(s / 1800); // 1800s = 30min
  return (halfHours / 2).toString();
};

// Normalise a legacy row so it stores seconds like tracker rows do
const normaliseLegacyRow = (row) => ({
  ...row,
  // Keep territory and country in sync regardless of which page wrote the row
  territory: row.territory || row.country || "",
  country: row.country || row.territory || "",
  // Convert HH.MM → seconds (Legacy path)
  rawSeconds: row.rawSeconds || toSeconds(row.timeSpent),
  additionalSeconds: row.additionalSeconds || toSeconds(row.additionalTime),
  // Derive rounded decimal-hour values for Tracker rows that only have seconds
  timeSpent: row.timeSpent || (row.rawSeconds ? secondsToDecimalRounded(row.rawSeconds) : ""),
  additionalTime: row.additionalTime || (row.additionalSeconds ? secondsToDecimalRounded(row.additionalSeconds) : ""),
  // Auto-derive project description from job number (same logic as handleUpdateRow)
  projectDescription: row.projectDescription ||
    (row.jobNumber?.includes(",") ? row.jobNumber.substring(row.jobNumber.indexOf(",") + 1).trim() : ""),
});

/**
 * Wraps useTasks scoped to source="legacy".
 * Exposes the same API that LegacyTimesheets.js already uses
 * (rows, setRows, addRow, updateRow, deleteRow, addRows)
 * so the component needs minimal changes.
 */
export function useLegacyRows(triggerToast, wrikeUserId = null) {
  const {
    tasks: rows,
    setTasks: setRows,
    loading,
    addTask,
    addTasks,
    updateTask,
    deleteTasks,
  } = useTasks(triggerToast, null, wrikeUserId);

  // Add a single blank row (from the + button)
  const addRow = useCallback(async (row) => {
    await addTask({ ...normaliseLegacyRow(row), source: "legacy" });
  }, [addTask]);

  // Add multiple rows at once (from Wrike pull)
  const addRows = useCallback(async (newRows) => {
    await addTasks(newRows.map((r) => ({ ...normaliseLegacyRow(r), source: "legacy" })));
  }, [addTasks]);

  // Update a single field on a row (called as updateRow(id, field, value))
  const updateRow = useCallback(async (id, field, value) => {
    // Keep territory and country in sync
    if (field === "country") {
      await updateTask(id, { country: value, territory: value });
    // Convert timeSpent decimal hours to rawSeconds on save
    } else if (field === "timeSpent") {
      await updateTask(id, { timeSpent: value, rawSeconds: toSeconds(value) });
    } else if (field === "additionalTime") {
      await updateTask(id, { additionalTime: value, additionalSeconds: toSeconds(value) });
    } else {
      await updateTask(id, { [field]: value });
    }
  }, [updateTask]);

  // Delete a single row
  const deleteRow = useCallback(async (id) => {
    await deleteTasks([id]);
  }, [deleteTasks]);

  // Normalise on read so Tracker rows get country/timeSpent derived correctly
  const normalisedRows = useMemo(() => rows.map(normaliseLegacyRow), [rows]);

  return {
    rows: normalisedRows,
    setRows,
    loading,
    addRow,
    addRows,
    updateRow,
    deleteRow,
  };
}
