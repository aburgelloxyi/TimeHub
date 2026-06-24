import { useCallback, useMemo } from "react";
import { useTasks } from "./useTasks";

// Round to nearest 0.5h step — minimum 0.5h for any logged time (never round to 0)
const roundHalf = (val) => {
  if (!val || val === "none") return val;
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) return val;
  const rounded = Math.round(n * 2) / 2;
  return (rounded > 0 ? rounded : 0.5).toString();
};

// Normalise a legacy row on add/read — useTasks.fromDb already handles seconds↔hours
const normaliseLegacyRow = (row) => ({
  ...row,
  territory: row.territory || "",
  // Round to 0.5h steps for Legacy timesheet display
  timeSpent: roundHalf(row.timeSpent) || row.timeSpent || "none",
  additionalTime: row.additionalTime && row.additionalTime !== "none"
    ? (roundHalf(row.additionalTime) || "none")
    : (row.additionalTime || "none"),
  // Derive rawSeconds from the rounded timeSpent for in-memory use
  rawSeconds: row.rawSeconds || (row.timeSpent && row.timeSpent !== "none"
    ? Math.round(parseFloat(roundHalf(row.timeSpent) || row.timeSpent) * 3600)
    : 0),
  // Auto-derive project description from job number
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
    // "country" was merged into "territory" — treat them as the same field
    if (field === "country") {
      await updateTask(id, { territory: value });
    } else {
      await updateTask(id, { [field]: value });
    }
  }, [updateTask]);

  // Delete a single row
  const deleteRow = useCallback(async (id) => {
    await deleteTasks([id]);
  }, [deleteTasks]);

  // Normalise on read (projectDescription auto-derive)
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
