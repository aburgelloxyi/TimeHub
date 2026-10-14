// Briefing a market's orders into Wrike the way the PMs do by hand: one batch
// task in the market's folder ("EBZR_Batch1_HU"), and under it one subtask per
// order, named as the sheet names it.
//
// Same rule as wrikeCampaign.js: planning only reads and says exactly what
// would be made; creating happens after someone confirms that.

import {
  fetchTasksUnderFolder, discoverCustomStatus, createTaskIn, removeTaskFromFolder,
} from "../wrikeCampaign";
import { planMarketFolderLive } from "./wrikeMarketFolder";
import { orderKey } from "./wrikeMatch";

const titleOf = (order) => String(order.xyi?.title || order.deliveryName || "").trim();

// The task name as a PM would type it from the sheet's: the sheet's formula
// leaves a doubled underscore where a field is empty (no site name gives
// "EBZR_INTL__DFOH__1920x1080px_10s_ZA"), and a site name can have spaces.
// Spaces become underscores, runs of them become one, and none is left at
// either end. Matching ignores the same differences (taskKey), so a task
// named either way is still found.
export const tidyTaskName = (name) =>
  String(name || "").trim().replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");

// An order goes to Wrike with its artwork chosen: the artwork is part of the
// task's name and of what the studio works from, and an order without one
// isn't ready to brief.
export const hasArtwork = (order) => !!String(order.artwork || "").trim();

// The film and market codes an order's name starts and ends with.
export function batchCodes(orders) {
  const parts = titleOf(orders.find(titleOf) || {}).split(/[\s_]+/).filter(Boolean);
  return parts.length >= 2 ? { film: parts[0], market: parts[parts.length - 1] } : { film: "", market: "" };
}

// The next batch name for a market, given the names already in its folder.
// The PMs' own vary ("EBZR_Batch1_HU", "FIL_DINTH_TH_B3"), so this is only an
// opening suggestion: one past the highest batch number found, in the plainest
// form. The PM can type over it.
export function suggestBatchName(existingTitles, orders) {
  const { film, market } = batchCodes(orders);
  const numbers = (existingTitles || [])
    .map((t) => /(?:^|[\s_])(?:batch\s?|b)(\d+)(?=[\s_]|$)/i.exec(t || "")?.[1])
    .filter(Boolean)
    .map(Number);
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return [film, `Batch${next}`, market].filter(Boolean).join("_");
}

// The earliest of the dates XYi works to (the sheet's End date), or failing
// that the earliest delivery deadline: a first guess at the batch's due date.
export function suggestDue(orders) {
  const pick = (get) => orders.map(get).filter(Boolean).sort()[0] || "";
  return pick((o) => o.xyi?.endDate) || pick((o) => o.deliveryDeadline);
}

// Pure. What would be created, or why not. An order needs a name to become a
// task, and two orders with one name would make two tasks nobody could tell
// apart, so both are reported instead of guessed at.
export function planBatch({ name, due, orders }) {
  const problems = [];
  if (!String(name || "").trim()) problems.push("Give the batch a name.");
  if (!due) problems.push("Give the batch a due date.");
  if (!orders.length) problems.push("Tick the orders to brief.");
  const rowsOf = (list) => `${list.length === 1 ? "Row" : "Rows"} ${list.map((o) => o.row).join(", ")}`;
  const noArtwork = orders.filter((o) => !hasArtwork(o));
  if (noArtwork.length) problems.push(`${rowsOf(noArtwork)} ${noArtwork.length === 1 ? "has" : "have"} no artwork selected. Choose it in the sheet first.`);
  const unnamed = orders.filter((o) => !titleOf(o));
  if (unnamed.length) problems.push(`${rowsOf(unnamed)} ${unnamed.length === 1 ? "has" : "have"} no task name in the sheet.`);
  const seen = new Map();
  for (const o of orders) if (titleOf(o)) seen.set(tidyTaskName(titleOf(o)), [...(seen.get(tidyTaskName(titleOf(o))) || []), o.row]);
  for (const [title, rows] of seen) if (rows.length > 1) problems.push(`Rows ${rows.join(" and ")} would both become "${title}".`);
  return {
    ok: problems.length === 0,
    problems,
    name: String(name || "").trim(),
    due,
    tasks: orders.filter(titleOf).map((o) => ({ key: orderKey(o), row: o.row, title: tidyTaskName(titleOf(o)) })),
  };
}

// Reads Wrike for what briefing a market needs: its folder (which must exist;
// "Add folder to Wrike" makes it), the batch names already in it, and the
// status new tasks start in. { ok: false, reason } when there is no folder.
export async function readMarketForBriefing(request) {
  const place = await planMarketFolderLive(request);
  if (!place.ok) return { ok: false, reason: place.reason };
  if (!place.existing) return { ok: false, reason: `${place.title} has no folder in Wrike yet. Add the folder first, then brief its orders.`, needsFolder: true };
  const [tasks, status] = await Promise.all([
    fetchTasksUnderFolder(place.existing.id).catch(() => []),
    discoverCustomStatus("Studio", "Backlog").catch(() => null),
  ]);
  return {
    ok: true,
    folder: place.existing,
    film: place.film,
    parentFolder: place.parent,
    existingTitles: tasks.map((t) => t.title),
    status,
  };
}

// Creates the planned batch in the market's folder. The batch task first; if
// that fails nothing is made. Then each order as a subtask, one at a time, so
// a failure part-way leaves a batch that says exactly which orders are in it.
// Returns { batch, made: [{ key, id, title, permalink }], failed: [{ row, title }] }.
export async function createBatch({ folder, status, plan, onProgress }) {
  const dates = { type: "Milestone", due: plan.due };
  const common = { dates, ...(status ? { customStatus: status.id } : {}) };
  const batch = await createTaskIn(folder.id, { title: plan.name, ...common });
  if (!batch.id) throw new Error("Wrike didn't return the batch task.");
  const made = [];
  const failed = [];
  for (const task of plan.tasks) {
    try {
      const sub = await createTaskIn(folder.id, { title: task.title, ...common, superTasks: [batch.id] });
      // Filed under the batch only, like the PMs' own. If this step is
      // refused the subtask still exists, in the folder as well.
      await removeTaskFromFolder(sub.id, folder.id).catch(() => {});
      made.push({ key: task.key, ...sub });
    } catch {
      failed.push({ row: task.row, title: task.title });
    }
    onProgress?.(made.length + failed.length, plan.tasks.length);
  }
  return { batch, made, failed };
}
