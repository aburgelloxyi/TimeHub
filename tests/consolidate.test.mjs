// The Billable view's grouping and rounding.
//
// The rule the studio agreed: rows for one person, job, item category and
// territory in one week bill as a single block, rounded up to the client's
// increment. These cases pin the grouping key, the week boundary and the
// rounding, including the totals either side of an exact increment.
import {
  consolidateRows,
  weekStartIso,
  billSeconds,
  incrementFor,
  DEFAULT_INCREMENT_MINUTES,
} from "../src/lib/consolidate.js";

const job = "Forgotten Island : XY025164, Titles";
const base = {
  wrike_user_id: "U1",
  _name: "Alice",
  job_number: job,
  category: "Design",
  territory: "UK",
  _iso: "2026-10-27",
  _increment: 30,
  time_spent: "none",
  additional_time: "none",
};

let n = 0;
const row = (extra) => ({ ...base, id: `r${++n}`, ...extra });
const one = (extra) => consolidateRows([row(extra)])[0];

// The example from the brief: 10 + 2 + 12 minutes across three days is 24
// minutes, which bills as one 30-minute block.
const brief = consolidateRows([
  row({ _iso: "2026-10-26", time_spent: "0:10" }),
  row({ _iso: "2026-10-28", time_spent: "0:02" }),
  row({ _iso: "2026-10-29", time_spent: "0:12" }),
]);
check("10 + 2 + 12 minutes is one block", brief.length, 1);
check("...totalling 24 minutes", brief[0].seconds, 24 * 60);
check("...billed as 30", brief[0].billedSeconds, 30 * 60);
check("...with 6 minutes uplift", brief[0].upliftSeconds, 6 * 60);
check("...holding its three rows", brief[0].rows.length, 3);

// The rounding boundary. Exactly one increment is unchanged; a second over
// starts the next block.
check("exactly 30 bills 30", one({ time_spent: "0:30" }).billedSeconds, 30 * 60);
check("31 minutes bills 60", one({ time_spent: "0:31" }).billedSeconds, 60 * 60);
check("61 minutes bills 90", one({ time_spent: "1:01" }).billedSeconds, 90 * 60);
check("a single 2-minute entry still bills one block", one({ time_spent: "0:02" }).billedSeconds, 30 * 60);
check("no time bills nothing", billSeconds(0, 30), 0);

// Grouping key: each of these must split the rows into two blocks.
check("different people stay apart", consolidateRows([
  row({ _iso: "2026-10-26", time_spent: "0:10" }),
  row({ _iso: "2026-10-26", time_spent: "0:10", wrike_user_id: "U2", _name: "Bob" }),
]).length, 2);
check("different item categories stay apart", consolidateRows([
  row({ _iso: "2026-10-26", time_spent: "0:10" }),
  row({ _iso: "2026-10-26", time_spent: "0:10", category: "Proofreading" }),
]).length, 2);
check("different territories stay apart", consolidateRows([
  row({ _iso: "2026-10-26", time_spent: "0:10" }),
  row({ _iso: "2026-10-26", time_spent: "0:10", territory: "Germany" }),
]).length, 2);
check("different jobs stay apart", consolidateRows([
  row({ _iso: "2026-10-26", time_spent: "0:10" }),
  row({ _iso: "2026-10-26", time_spent: "0:10", job_number: "Other : XY025165, Print" }),
]).length, 2);

// The week boundary. Sunday and the Monday after it are different weeks even
// when the job, category and territory all match.
check("Monday of a week", weekStartIso("2026-10-27"), "2026-10-26");
check("Sunday belongs to the week before", weekStartIso("2026-10-25"), "2026-10-19");
check("Monday is its own week start", weekStartIso("2026-10-26"), "2026-10-26");
check("no date gives no week", weekStartIso(""), "");
check("Sunday and Monday do not merge", consolidateRows([
  row({ _iso: "2026-10-25", time_spent: "0:20" }),
  row({ _iso: "2026-10-26", time_spent: "0:20" }),
]).length, 2);

// The same job, grouped by code inside the label, so a film rename mid-week
// doesn't split the block.
check("label rename still groups by job code", consolidateRows([
  row({ _iso: "2026-10-26", time_spent: "0:10" }),
  row({ _iso: "2026-10-27", time_spent: "0:10", job_number: "Forgotten Island (renamed) : XY025164, Titles" }),
], { jobOf: (r) => (r.job_number.match(/XY\d+/) || [""])[0] }).length, 1);

// Increments come from the client, and a missing one falls back to 30.
check("client increment is used", one({ time_spent: "0:10", _increment: 15 }).billedSeconds, 15 * 60);
check("missing increment falls back to 30", one({ time_spent: "0:10", _increment: undefined }).billedSeconds, 30 * 60);
check("zero increment falls back too", incrementFor(0), DEFAULT_INCREMENT_MINUTES);
check("negative increment falls back too", incrementFor(-15), DEFAULT_INCREMENT_MINUTES);

// Rows with no time are dropped rather than shown as empty blocks.
check("rows with no time are skipped", consolidateRows([
  row({ _iso: "2026-10-26", time_spent: "none" }),
]).length, 0);

// The addition column bills with the logged time.
check("additional time is included", one({ time_spent: "0:10", additional_time: "0:05" }).seconds, 15 * 60);

// Newest week first.
check("weeks sort newest first", consolidateRows([
  row({ _iso: "2026-10-19", time_spent: "0:10", category: "Design" }),
  row({ _iso: "2026-10-27", time_spent: "0:10", category: "Proofreading" }),
]).map((g) => g.week), ["2026-10-26", "2026-10-19"]);
