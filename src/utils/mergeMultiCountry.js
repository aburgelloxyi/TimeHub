import { joinTerritories, splitTerritories } from "./territories";
import { secondsToHM, parseTimeToSeconds } from "./timeHelpers";

// Merge pulled rows that describe the same work in different markets into one
// entry covering every market.
//
// Wrike models a localisation campaign as one task per market, so half an hour
// spread over Denmark and Brazil arrives as two tasks, two timelogs, and — once
// the pull has grouped by task — two rows. For people who do a little work
// across many territories that is a page of near-identical rows to tidy by hand
// before submitting, which is what this exists to remove.
//
// WHAT COUNTS AS "THE SAME WORK": same job number, same day, same category.
// Territory is deliberately excluded (it is the thing being merged) and so is
// taskId (different markets ARE different tasks — that is the whole point).
// Everything else that varies between two otherwise-matching rows is a genuine
// difference and the rows are left alone.
//
// THIS IS LOSSY, WHICH IS WHY IT IS OPT-IN. 2h on Brazil and 30m on Denmark
// becomes 2.5h across "Brazil, Denmark" — the split is not recoverable from the
// merged row's own fields, and the company timesheet bills the whole block
// against both markets. The merged row does keep every constituent timelog id
// in wrikeTimelogId, so the merge can at least be traced back to the individual
// Wrike logs it came from.
// Pull-time merging now shares the manual Merge's rules (mergeCheck / mergeRows
// below), which it didn't: it keyed on the job number as TEXT, so one market
// resolved to the bare "XY026066" and another to "Street Fighter : XY026066,
// …" stayed apart though the grid shows both the same. And it only merged
// within a single pull, so pulling twice in a day, or turning the setting on
// after a pull, left one row per market. See mergeIntoSheet.
export function mergeMultiCountryRows(rows) {
  return mergeIntoSheet(rows, []).rows;
}

/**
 * Merge newly pulled rows with each other AND with rows already on the sheet
 * for the same day, job (by XY code) and category, as Merge in the selection
 * bar would. Returns { rows, replaces }: the rows to add, and the ids of sheet
 * rows they replace, to be deleted once the new rows have saved.
 *
 * A row with no country is never merged: folded into "Denmark, Colombia" its
 * market would be lost from sight. It stays on its own, reading "No country",
 * for the person to fill in.
 */
export function mergeIntoSheet(newRows, sheetRows = []) {
  const groups = new Map();
  const keyOf = (r) => [r.dayOfWeek || "", rowJob(r), r.category || ""].join("\u0000");
  const placed = (r) => splitTerritories(r.territory).length > 0;
  const rows = [];
  for (const r of newRows) {
    if (!placed(r)) {
      const { _rawHours, ...alone } = r;
      rows.push(alone);
      continue;
    }
    const k = keyOf(r);
    if (!groups.has(k)) groups.set(k, { sheet: [], pulled: [] });
    groups.get(k).pulled.push(r);
  }
  for (const r of sheetRows) if (placed(r)) groups.get(keyOf(r))?.sheet.push(r);

  const replaces = [];
  for (const { sheet, pulled } of groups.values()) {
    if (sheet.length + pulled.length === 1) {
      const { _rawHours, ...only } = pulled[0];
      rows.push(only);
      continue;
    }
    // What's on the sheet first, so the merged entry keeps its task link and
    // its notes lead.
    rows.push({ ...mergeRows([...sheet, ...pulled]), id: pulled[0].id });
    replaces.push(...sheet.map((r) => r.id));
  }
  return { rows, replaces };
}

// ── Merging rows by hand ─────────────────────────────────────────────────────
// Legacy's selection bar: tick rows already on the sheet, press Merge, get one
// entry. The same idea as the pull-time merge above, for rows that arrived
// separately (merge was off, or they were added by hand).
//
// What may merge is the same rule: one job, one day, one category. Anything
// else is two pieces of work, and merging them would bill one against the
// other's job or category.

// The job a row is on. By XY code where there is one, so a bare "XY026065" and
// the canonical "Street Fighter : XY026065, INTL PRINT…" are the same job.
const rowJob = (r) =>
  ((r.jobNumber || "").match(/XY\d{5,6}/i)?.[0] || (r.jobNumber || "").trim()).toUpperCase();

/** { ok: true } or { ok: false, reason } — the reason reads as a sentence. */
export function mergeCheck(rows) {
  if (!rows || rows.length < 2) return { ok: false, reason: "Select at least two rows to merge." };
  const differ = (key) => new Set(rows.map(key)).size > 1;
  if (differ((r) => r.dayOfWeek || "")) return { ok: false, reason: "These rows are on different days." };
  if (differ(rowJob)) return { ok: false, reason: "These rows are on different jobs." };
  if (differ((r) => r.category || "")) return { ok: false, reason: "These rows have different categories." };
  return { ok: true };
}

/**
 * The single entry `rows` become. Times are summed, per column, from the
 * stored "H:MM" values. Returns the row without an id; the caller adds one.
 *
 *   territory       every market, de-duplicated, in the order they appear
 *   wrikeTimelogId  every timelog behind any of them, so the next pull still
 *                   recognises all of it and adds nothing twice
 *   notes           the distinct notes, joined ("SF_Batch1_PT, SF_Batch1_NO")
 *   description,
 *   client, film    the first that has one
 *   clientAmends,
 *   is3D            kept if any row had it
 *   taskId          the first row's: the link back to Wrike can only be one
 */
// What a row was, kept on the entry it is merged into (`mergedFrom`), so the
// entry can be split back into exactly these rows later (unmergeRow). A row
// that was itself a merge contributes its own parts, so merging twice still
// remembers every original. A freshly pulled row's time is its unrounded one.
const PART_FIELDS = [
  "taskId", "territory", "timeSpent", "additionalTime", "notes", "wrikeTimelogId",
  "projectDescription", "clientAmends", "is3D", "filmTitle", "client",
];
const partsOf = (row) => {
  if (row.mergedFrom?.length) return row.mergedFrom;
  const part = Object.fromEntries(PART_FIELDS.map((k) => [k, row[k] ?? null]));
  // Which row it was, so something that remembers adding that row (a meeting
  // in Where did my day go?) can still find it inside the entry, and so an
  // unmerge can give it its id back.
  part.fromId = row.id ?? null;
  if (row._rawHours != null) part.timeSpent = secondsToHM(row._rawHours * 3600);
  return [part];
};

export function mergeRows(rows) {
  const [first] = rows;
  const firstOf = (key) => rows.map((r) => r[key]).find((v) => v) || "";
  // A freshly pulled row carries its unrounded hours; summing those before
  // formatting keeps two 20-second logs from adding up to nothing.
  const seconds = (key) =>
    rows.reduce(
      (s, r) => s + (key === "timeSpent" && r._rawHours != null ? r._rawHours * 3600 : parseTimeToSeconds(r[key])),
      0
    );
  const ids = [
    ...new Set(
      rows
        .map((r) => r.wrikeTimelogId)
        .filter(Boolean)
        .join(",")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];
  const notes = [...new Set(rows.map((r) => (r.notes || "").trim()).filter(Boolean))];
  // The first row's own time in seconds would ride along and be read back
  // as the merged row's time; dropped so it's derived from the new totals.
  const { id: _id, rawSeconds: _raw, additionalSeconds: _extra, _rawHours: _unrounded, ...base } = first;
  return {
    ...base,
    territory: joinTerritories(rows.flatMap((r) => splitTerritories(r.territory)).join(", ")),
    timeSpent: secondsToHM(seconds("timeSpent")),
    additionalTime: secondsToHM(seconds("additionalTime")),
    wrikeTimelogId: ids.length ? ids.join(",") : null,
    notes: notes.join(", "),
    projectDescription: firstOf("projectDescription"),
    client: firstOf("client"),
    filmTitle: firstOf("filmTitle"),
    clientAmends: rows.some((r) => r.clientAmends),
    mergedFrom: rows.flatMap(partsOf),
    is3D: rows.some((r) => r.is3D),
  };
}

// ── Countries that arrive late ───────────────────────────────────────────────
// A row pulled before its task's market could be placed has no country. A later
// pull may know it (`countryOf(taskId)`, "" while it still doesn't), and fills
// it in: on the row, or on each merged part missing one, which then joins the
// entry's markets. A country already on a row or part is never changed.
// Returns { id, territory, mergedFrom? } for each row that changed.
export function fillMissingCountries(rows, countryOf) {
  const changes = [];
  for (const row of rows || []) {
    if (row.mergedFrom?.length) {
      const found = [];
      const mergedFrom = row.mergedFrom.map((part) => {
        if (splitTerritories(part.territory).length || !part.taskId) return part;
        const country = countryOf(part.taskId);
        if (!country) return part;
        found.push(...splitTerritories(country));
        return { ...part, territory: country };
      });
      if (found.length) {
        changes.push({ id: row.id, territory: joinTerritories([...splitTerritories(row.territory), ...found]), mergedFrom });
      }
    } else if (!splitTerritories(row.territory).length && row.taskId) {
      const country = countryOf(row.taskId);
      if (country) changes.push({ id: row.id, territory: country });
    }
  }
  return changes;
}

// ── Unmerging ────────────────────────────────────────────────────────────────
// An entry merged since its parts began to be recorded can be split back into
// the rows it was made from, each with its own market, time, notes and
// timelog link, on the entry's day, job and category. Entries merged before
// that have no parts and can't be.

export const canUnmerge = (row) => (row?.mergedFrom?.length || 0) > 1;

/**
 * The rows `entry` was merged from, without ids (the caller adds them).
 * `edited` is true when the entry's time no longer adds up to its parts': it
 * was changed after merging, and unmerging puts the parts' times back.
 */
export function unmergeRow(entry) {
  if (!canUnmerge(entry)) return { rows: [], edited: false };
  const { id: _id, mergedFrom, rawSeconds: _raw, additionalSeconds: _extra, ...base } = entry;
  const rows = mergedFrom.map((part) => ({ ...base, ...part, mergedFrom: null }));
  const total = (key) => rows.reduce((s, r) => s + parseTimeToSeconds(r[key]), 0);
  const roughly = (a, b) => Math.abs(a - b) < 60;
  const edited = !roughly(total("timeSpent"), parseTimeToSeconds(entry.timeSpent))
    || !roughly(total("additionalTime"), parseTimeToSeconds(entry.additionalTime));
  return { rows, edited };
}
