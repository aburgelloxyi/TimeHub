// Consolidating a week of logged rows into billable blocks.
//
// The Billable view in Project/Time shows the lines a timesheet would bill as
// one: same person, job, item category and territory in the same week. Each
// block bills through a running pot over the week (billCycle): minutes too few
// to bill are banked and counted with the next entry, until Sunday.
//
// Nothing here writes. The raw rows stay the record of what happened; this is
// a second, derived view of them.
import { parseTimeToSeconds } from "../utils/timeHelpers";

export const DEFAULT_INCREMENT_MINUTES = 30;

// A missing or broken increment must not become 0 (a zero step would take the
// whole total) or a fraction.
export function incrementFor(minutes) {
  const n = Number(minutes);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_INCREMENT_MINUTES;
}

// Monday of the week an ISO date falls in, as "YYYY-MM-DD". UTC throughout so
// the browser's timezone can't move a date into the neighbouring week.
export function weekStartIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// Both duration columns count: a row can carry logged time and an addition.
export function rowSeconds(row) {
  return parseTimeToSeconds(row.time_spent) + parseTimeToSeconds(row.additional_time);
}

// What makes two rows one block. Exported so a single raw row can ask which
// block it belongs to, and whether that block was banked.
export function blockKey(row, { jobOf = (row) => row.job_number } = {}) {
  const week = weekStartIso(row._iso || row.work_date);
  const person = row.wrike_user_id || row._name || "";
  const job = jobOf(row) || "";
  // \u0000 cannot occur in these fields, so it can't make two keys collide.
  return [person, job, row.category || "", row.territory || "", week].join("\u0000");
}

// The week's cycle, per block: walk the entries in the order they were worked, adding each to a pot. The pot is
// rounded to the increment with the half going up, so the banking line is half the client's increment: on 30,
// 14 minutes bills nothing and 15 bills 30; on 15, under 7.5 minutes is banked. What is billed
// leaves the pot; what is left (37 minutes billed 30 keeps 7, 74 keeps 14) stays and meets the next entry. A pot
// that rounds up to more than it holds (a 22-minute entry billed 30) has nothing left to keep.
//
// This bills each time the pot crosses the half, so a block can bill more than once in a week: 0:22 on Tuesday
// and 0:15 on Wednesday bill 30 each, where one round of the week's 0:37 would bill 30 once.
export function billCycle(rows, incrementMinutes) {
  const step = incrementFor(incrementMinutes) * 60;
  const sorted = [...(rows || [])].sort((a, b) =>
    String(a._iso || a.work_date || a.date || "").localeCompare(String(b._iso || b.work_date || b.date || "")) ||
    (a.id ?? 0) - (b.id ?? 0));
  const byId = new Map();
  let carry = 0;
  let billed = 0;
  for (const row of sorted) {
    const logged = rowSeconds(row);
    const absorbed = carry;
    const total = carry + logged;
    const bill = total > 0 ? Math.round(total / step) * step : 0;
    carry = Math.max(0, total - bill);
    billed += bill;
    byId.set(row.id, { logged, billed: bill, bankedAfter: carry, absorbed });
  }
  return { byId, billed, banked: carry };
}

// Rows are the feed's enriched entries: `_iso` for the work date and
// `_increment` for the client's increment, both added in JobsFeedSection.
// jobOf lets the caller group by the job code inside the label, so a rename
// mid-week doesn't split one job into two groups.
export function consolidateRows(rows, { jobOf = (row) => row.job_number } = {}) {
  const groups = new Map();

  for (const row of rows || []) {
    const seconds = rowSeconds(row);
    // A row with no time has nothing to bill, and would otherwise appear as an
    // empty block in the view.
    if (!(seconds > 0)) continue;

    const key = blockKey(row, { jobOf });
    const week = weekStartIso(row._iso || row.work_date);
    const person = row.wrike_user_id || row._name || "";
    const job = jobOf(row) || "";

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        week,
        person,
        name: row._name || "",
        job,
        client: row.client || "",
        category: row.category || "",
        territory: row.territory || "",
        incrementMinutes: incrementFor(row._increment),
        rows: [],
        seconds: 0,
      };
      groups.set(key, group);
    }
    group.rows.push(row);
    group.seconds += seconds;
  }

  return [...groups.values()]
    .map((group) => {
      // The week's own cycle decides both: what it bills, and what it is still holding. Never carried past Sunday.
      const cycle = billCycle(group.rows, group.incrementMinutes);
      return {
        ...group,
        billedSeconds: cycle.billed,
        upliftSeconds: cycle.billed - group.seconds,
        banked: cycle.billed === 0,
        bankedSeconds: cycle.banked,
        cycle,
      };
    })
    // Newest week first, then the order the raw table reads in.
    .sort((a, b) =>
      b.week.localeCompare(a.week) ||
      a.name.localeCompare(b.name) ||
      a.job.localeCompare(b.job) ||
      a.category.localeCompare(b.category) ||
      a.territory.localeCompare(b.territory)
    );
}
