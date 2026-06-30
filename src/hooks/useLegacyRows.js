import { useCallback, useMemo, useRef } from "react";
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
// Returns "YYYY-MM-DD" for Monday of the current week
export function getCurrentWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
}

const isoDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function useLegacyRows(triggerToast, wrikeUserId = null) {
  const weekStart = useRef(getCurrentWeekStart()).current;

  const {
    tasks: rows,
    setTasks: setRows,
    loading,
    addTask,
    addTasks,
    updateTask,
    deleteTasks,
  } = useTasks(triggerToast, null, wrikeUserId, weekStart);

  // Add a single blank row (from the + button) — always stamp today's ISO date
  const addRow = useCallback(async (row) => {
    await addTask({ ...normaliseLegacyRow(row), source: "legacy", date: row.date || isoDate() });
  }, [addTask]);

  // Add multiple rows at once (from Wrike pull) — ensure ISO date on each
  const addRows = useCallback(async (newRows) => {
    await addTasks(newRows.map((r) => ({
      ...normaliseLegacyRow(r),
      source: "legacy",
      date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : isoDate(),
    })));
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

  // Normalise on read — week filtering is already applied inside useTasks
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
