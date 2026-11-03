// Consolidating a week of logged rows into billable blocks.
//
// The Billable view in Project/Time shows the lines a timesheet would bill as
// one: same person, job, item category and territory in the same week. That
// group's total is rounded to the client's increment, the half going up: 44
// minutes bills 30, 45 bills the hour.
//
// Nothing here writes. The raw rows stay the record of what happened; this is
// a second, derived view of them.
import { parseTimeToSeconds } from "../utils/timeHelpers";

export const DEFAULT_INCREMENT_MINUTES = 30;

// A block shorter than this is banked: it stays on the timesheet so the time is
// not lost, but it is not billed. Fifteen minutes is the line between "worth an
// invoice line" and "held", and the bank belongs to its own week.
export const BANK_MINUTES = 15;

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

// Round a group total to the nearest increment, the half going up: 44 minutes
// bills 30, 45 bills 60, 74 bills 60, 75 bills 90. Any positive total bills at
// least one increment; zero stays zero.
export function billSeconds(totalSeconds, incrementMinutes) {
  if (!(totalSeconds > 0)) return 0;
  const step = incrementFor(incrementMinutes) * 60;
  return Math.max(1, Math.round(totalSeconds / step)) * step;
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
      const billed = billSeconds(group.seconds, group.incrementMinutes);
      const banked = group.seconds < BANK_MINUTES * 60;
      return {
        ...group,
        billedSeconds: billed,
        // Rounding's gain: a block that bills more than it logged.
        upliftSeconds: billed - group.seconds,
        banked,
        // What the block keeps: a block under the line is held whole; a billed block that rounded down holds the
        // remainder. Nothing is carried to another week: this is the week's own bank.
        bankedSeconds: banked ? group.seconds : Math.max(0, group.seconds - billed),
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
