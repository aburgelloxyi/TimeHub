import { useCallback } from "react";
import { useTasks } from "./useTasks";

const toSeconds = (val) => {
  if (!val || val === "none") return 0;
  return Math.round(parseFloat(val) * 3600);
};

// Normalise a legacy row so it stores seconds like tracker rows do
const normaliseLegacyRow = (row) => ({
  ...row,
  // Map country → territory so both pages use the same field
  territory: row.territory || row.country || "",
  // Convert decimal hours → seconds
  rawSeconds: row.rawSeconds || toSeconds(row.timeSpent),
  additionalSeconds: row.additionalSeconds || toSeconds(row.additionalTime),
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
  } = useTasks(triggerToast, "legacy", wrikeUserId);

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

  return {
    rows,
    setRows,
    loading,
    addRow,
    addRows,
    updateRow,
    deleteRow,
  };
}
