// The Billable view's grouping and rounding.
//
// Rows for one person, job, item category and territory in one week are one
// block, billed through the week's running pot: each entry is added and the pot
// rounded to the client's increment, the half going up, and what is too few
// minutes to bill is banked for the next entry. These cases pin the grouping
// key, the week boundary, the rounding either side of a half step, and the bank.
import {
  consolidateRows,
  weekStartIso,
  billCycle,
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

// The rounding boundary: under the half bills the step below it, from the half
// up bills the step above.
check("exactly 30 bills 30", one({ time_spent: "0:30" }).billedSeconds, 30 * 60);
check("44 minutes bills 30", one({ time_spent: "0:44" }).billedSeconds, 30 * 60);
check("45 minutes bills 60", one({ time_spent: "0:45" }).billedSeconds, 60 * 60);
check("74 minutes bills 60", one({ time_spent: "1:14" }).billedSeconds, 60 * 60);
check("75 minutes bills 90", one({ time_spent: "1:15" }).billedSeconds, 90 * 60);
check("a 2-minute entry bills nothing", one({ time_spent: "0:02" }).billedSeconds, 0);
check("no time bills nothing", billCycle([row({ time_spent: "0:00" })], 30).billed, 0);

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
check("missing increment falls back to 30", one({ time_spent: "0:20", _increment: undefined }).billedSeconds, 30 * 60);
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

// On a 30-minute increment, under fifteen minutes a block is banked: kept on the
// timesheet, left out of the Billable view, and billed once the week adds up to something.
check("under 15 minutes is banked", one({ time_spent: "0:14" }).banked, true);
check("15 minutes is not banked", one({ time_spent: "0:15" }).banked, false);
check("a banked block holds only what it logged", [one({ time_spent: "0:02" }).bankedSeconds, one({ time_spent: "0:02" }).billedSeconds], [2 * 60, 0]);
check("banking counts the addition too", one({ time_spent: "0:10", additional_time: "0:05" }).banked, false);

// What a block keeps when rounding leaves time under the bill. In the week, not carried into the next.
check("a 37-minute block banks the 7 minutes it cannot bill", one({ time_spent: "0:37" }).bankedSeconds, 7 * 60);
check("a 74-minute block bills the hour and banks 14", [one({ time_spent: "1:14" }).billedSeconds, one({ time_spent: "1:14" }).bankedSeconds], [60 * 60, 14 * 60]);
check("a block that rounds up banks nothing", one({ time_spent: "0:53" }).bankedSeconds, 0);
check("a block under the line banks all of it", one({ time_spent: "0:10" }).bankedSeconds, 10 * 60);

// The week's cycle, across days. Minutes banked on one day are spent by the next entry, and the entry that crosses
// the half bills; when it bills, what is left over stays in the pot.
const monday = row({ _iso: "2026-10-26", time_spent: "0:07" });
const tuesday = row({ _iso: "2026-10-27", time_spent: "0:08" });
const cross = consolidateRows([monday, tuesday]);
const steps = cross[0].cycle.byId;
check("first day under the half bills nothing and banks its 7", [steps.get(monday.id).billed, steps.get(monday.id).bankedAfter], [0, 7 * 60]);
check("the next day's 8 spends the bank and bills 30", [steps.get(tuesday.id).billed, steps.get(tuesday.id).absorbed], [30 * 60, 7 * 60]);
check("the block bills once across the two days", cross[0].billedSeconds, 30 * 60);
check("nothing is left in the pot after it bills", cross[0].bankedSeconds, 0);

// Overbilled entries leave nothing to keep; over-rounded ones keep the remainder.
check("a 22-minute entry bills 30 and keeps nothing", [one({ time_spent: "0:22" }).billedSeconds, one({ time_spent: "0:22" }).bankedSeconds], [30 * 60, 0]);
check("a 37-minute entry bills 30 and keeps 7", [one({ time_spent: "0:37" }).billedSeconds, one({ time_spent: "0:37" }).bankedSeconds], [30 * 60, 7 * 60]);

// Each crossing bills, so two full entries in one week bill twice. Pinned because it is the consequence of a
// running cycle rather than one round of the week's total.
const late = row({ _iso: "2026-10-28", time_spent: "0:22" });
const later = row({ _iso: "2026-10-29", time_spent: "0:15" });
const twice = consolidateRows([late, later]);
check("two entries that each cross bill 30 each", twice[0].billedSeconds, 60 * 60);
