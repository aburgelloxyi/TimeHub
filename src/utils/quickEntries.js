// The timesheet's quick additions: entries someone keeps making, offered
// beside Add row so one click adds them again. An entry is a job, category
// and market together; its description is the latest one written for it.
//
// `recent` is the latest distinct entries, `frequent` the ones made most
// over the period `rows` cover, leaving out any already in `recent`. Neither
// offers what is already on the day being filled in (`onDay`), nor rows with
// no job.

import { toIsoDate } from "./dates";

const norm = (s) => String(s || "").trim().toLowerCase();
export const entryKey = (r) => `${norm(r.jobNumber)}|${norm(r.category)}|${norm(r.territory)}`;
const dayOf = (r) => r.workDate || toIsoDate(r.date) || "";

export function quickEntries(rows, onDay = [], limit = 3) {
  const taken = new Set(onDay.map(entryKey));
  const byKey = new Map();
  for (const r of rows || []) {
    if (!norm(r.jobNumber)) continue;
    const key = entryKey(r);
    if (taken.has(key)) continue;
    const day = dayOf(r);
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, { key, row: r, last: day, uses: 1 });
    } else {
      seen.uses++;
      if (day > seen.last) { seen.last = day; seen.row = r; }
    }
  }
  const all = [...byKey.values()].map(({ key, row, last, uses }) => ({
    key, last, uses,
    jobNumber: row.jobNumber, client: row.client || "", filmTitle: row.filmTitle || "",
    projectDescription: row.projectDescription || "", territory: row.territory || "", category: row.category || "",
  }));
  const recent = [...all].sort((a, b) => b.last.localeCompare(a.last) || b.uses - a.uses).slice(0, limit);
  const shown = new Set(recent.map((e) => e.key));
  const frequent = all
    .filter((e) => !shown.has(e.key) && e.uses > 1)
    .sort((a, b) => b.uses - a.uses || b.last.localeCompare(a.last))
    .slice(0, limit);
  return { recent, frequent };
}
