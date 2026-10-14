// Is this order already a task in Wrike? Read-only: it compares the name the
// sheet builds for an order with the titles of the Wrike tasks TimeHub has
// already loaded. Nothing is sent anywhere and nothing in Wrike changes.
// makeMatcher (below) is what the screens use.
//
// It can only say yes: a task TimeHub hasn't loaded finds no match. The shared
// cache keeps what teams are assigned to and everything filed in a market's
// folder (see keepForCache), and a market's page also reads its own folder.
// The screens show "In Wrike" for a match and stay silent otherwise.

import { wrikeLink } from "../wrikeLink.js";

// A PM tidies the name when making the task: the sheet leaves a doubled
// underscore where a market gave no site name, and spaces become underscores.
// Compared case-blind with those differences ironed out.
export function taskKey(title) {
  return String(title ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Short or unstructured names would match by accident ("ov", "banner").
const specific = (key) => key.length >= 12 && key.split("_").length >= 4;

const newer = (a, b) => String(b.updatedDate || "") > String(a.updatedDate || "");

// title key → the task, for every task with a title worth matching on. When two
// tasks share a name, the most recently updated one is kept.
export function indexTasks(tasks) {
  const byKey = new Map();
  for (const task of tasks || []) {
    const key = taskKey(task?.title);
    if (!specific(key)) continue;
    const seen = byKey.get(key);
    if (!seen || newer(seen, task)) byKey.set(key, task);
  }
  return byKey;
}

// The Wrike task for an order, or null. The XYi block's title is what becomes
// the task name; the delivery name is the same text and covers sheets where
// the XYi block couldn't be read.
export function findTask(index, order) {
  if (!index?.size) return null;
  for (const name of [order.xyi?.title, order.deliveryName]) {
    const key = taskKey(name);
    if (specific(key) && index.has(key)) return index.get(key);
  }
  return null;
}

// subtask id → its parent task. The cache keeps a parent whenever one of its
// subtasks is kept, and Wrike lists the link on the parent only (subTaskIds).
export function indexParents(tasks) {
  const byChild = new Map();
  for (const task of tasks || []) {
    for (const childId of task?.subTaskIds || []) byChild.set(childId, task);
  }
  return byChild;
}

const dueDay = (task) => String(task?.dates?.due || "").slice(0, 10);

// Who has the order and when it's due. PMs usually assign and reschedule the
// parent task and leave the per-size subtask bare, so a subtask with nobody on
// it takes the parent's people, and a parent due date that differs from the
// subtask's is reported alongside it instead of being hidden.
export function taskSummary(task, parent) {
  const own = task.assignees || "";
  const due = dueDay(task);
  const parentDue = dueDay(parent);
  return {
    assignees: own || parent?.assignees || "",
    assigneesFromParent: !own && !!parent?.assignees,
    due: due || parentDue,
    dueFromParent: !due && !!parentDue,
    parentDue: due && parentDue && parentDue !== due ? parentDue : "",
  };
}


// Wrike strips nothing from this; the cached copy of a task just doesn't carry it.
export const taskLink = (task) => wrikeLink(task);

// ── Close matches ─────────────────────────────────────────────────────────────
// A task is rarely named exactly as the sheet builds it: a size is briefed with
// a typo, a word is added, the creative changes after the order went in. So
// when no task has the order's exact name, the nearest one for the same film
// and market is offered as a close match, and labelled as one.

const parts = (title) => taskKey(title).split("_").filter(Boolean);

// "118,5x175cm" and "118.5 x 175 CM" are the same size.
const sizeOf = (token) => {
  const found = /^(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)/.exec(token);
  return found ? `${found[1].replace(",", ".")}x${found[2].replace(",", ".")}` : "";
};

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

// The same word, allowing for a slip: one wrong character in a word of four or
// more, two in one of eight or more. Short codes (OOH, RGB, HU) must be exact.
function sameToken(a, b) {
  if (a === b) return true;
  const size = sizeOf(a);
  if (size && size === sizeOf(b)) return true;
  const allowed = Math.min(a.length, b.length) >= 8 ? 2 : Math.min(a.length, b.length) >= 4 ? 1 : 0;
  return allowed > 0 && editDistance(a, b, allowed) <= allowed;
}

// 0 to 1: how much of two names is the same words, wherever they sit.
export function titleSimilarity(a, b) {
  const left = parts(a);
  const right = [...parts(b)];
  if (!left.length || !right.length) return 0;
  let shared = 0;
  for (const token of left) {
    const at = right.findIndex((other) => sameToken(token, other));
    if (at === -1) continue;
    right.splice(at, 1);
    shared++;
  }
  return (2 * shared) / (left.length + parts(b).length);
}

// Close enough to offer: one word of a typical name changed or added still
// passes, two changed does not.
const CLOSE = 0.75;

// A name's film code and market code, its first and last words. Close matches
// are only looked for among tasks that share both.
const bucketOf = (title) => {
  const tokens = parts(title);
  return tokens.length >= 4 ? `${tokens[0]}|${tokens[tokens.length - 1]}` : "";
};

const orderTitle = (order) => order.xyi?.title || order.deliveryName || "";

// Whether a name is for a motion or a print piece, from the words it is
// built from: a duration or a digital placement means motion, a print colour
// space or a print placement means print. "" when it says neither. Close
// matches and the hand-picked list only offer tasks of the order's own kind:
// a motion order is never matched to a print banner because the market and
// film agree.
const MOTION_WORDS = new Set(["dooh", "dinth", "dfoh", "motion", "video"]);
const PRINT_WORDS = new Set(["cmyk", "ooh", "inth", "foh", "print"]);
export function mediumOf(title) {
  const tokens = parts(title);
  if (tokens.some((t) => MOTION_WORDS.has(t) || /^\d+(s|secs?)$/.test(t))) return "motion";
  if (tokens.some((t) => PRINT_WORDS.has(t))) return "print";
  return "";
}
const sameKind = (task, kind) => !kind || !mediumOf(task.title) || mediumOf(task.title) === kind;

// What identifies an order between reads of its sheet, for the things a PM
// decides about it here (set aside, matched by hand). The row is part of it
// because a market can order the same thing twice; if rows move, the decision
// lapses and the order shows as undecided again, which is the safe way round.
export const orderKey = (order) => `${order.tab || ""}|${order.row}|${taskKey(orderTitle(order))}`;

// Everything the screens need to match orders to the Wrike tasks TimeHub has
// loaded. `match(orders, links, briefed)` returns, per order, { task, how } or
// null, where `how` is "exact", "close", "chosen" or "created". `links` is what
// a PM has set by hand: { orderKey: taskId }, or "none" for "this isn't in
// Wrike". `briefed` is the tasks made from this page: { orderKey: { id, title,
// permalink } }. Those are known even while TimeHub hasn't loaded them, which
// it won't until someone on a team is assigned.
// A task is given to one order only, exact names first, then the closest.
export function makeMatcher(tasks) {
  const exact = indexTasks(tasks);
  const byId = new Map((tasks || []).map((t) => [t.id, t]));
  const buckets = new Map();
  for (const task of tasks || []) {
    const bucket = bucketOf(task?.title);
    if (!bucket) continue;
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(task);
  }

  // Tasks for the same film and market, of the same kind (`kind`, the film's
  // medium) where a name says, nearest name first.
  const candidates = (order, kind) =>
    (buckets.get(bucketOf(orderTitle(order))) || [])
      .filter((task) => sameKind(task, kind))
      .map((task) => ({ task, score: titleSimilarity(orderTitle(order), task.title) }))
      .sort((a, b) => b.score - a.score);

  const match = (orders, links = {}, briefed = {}, kind = "") => {
    const result = orders.map(() => null);
    const taken = new Set();
    const give = (i, task, how) => { result[i] = { task, how }; taken.add(task.id); };
    const decided = new Set();

    orders.forEach((order, i) => {
      const link = links[orderKey(order)];
      if (!link) return;
      decided.add(i);
      const task = link === "none" ? null : byId.get(link);
      if (task) give(i, task, "chosen");
    });
    orders.forEach((order, i) => {
      if (decided.has(i)) return;
      const task = findTask(exact, order);
      if (task && !taken.has(task.id)) give(i, task, "exact");
    });

    // Made from here: the loaded copy if TimeHub has it by now, else what was
    // recorded when it was made.
    orders.forEach((order, i) => {
      if (decided.has(i) || result[i]) return;
      const made = briefed?.[orderKey(order)];
      if (made) give(i, byId.get(made.id) || made, "created");
    });

    const offers = [];
    orders.forEach((order, i) => {
      if (decided.has(i) || result[i]) return;
      for (const { task, score } of candidates(order, kind)) {
        if (score < CLOSE) break;
        if (!taken.has(task.id)) offers.push({ i, task, score });
      }
    });
    offers.sort((a, b) => b.score - a.score);
    for (const { i, task } of offers) {
      if (!result[i] && !taken.has(task.id)) give(i, task, "close");
    }
    return result;
  };

  return { match, candidates, size: exact.size };
}
