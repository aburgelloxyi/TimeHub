// The delivery link a PM puts on an order's Wrike task, in the "File Path"
// custom field. The shared task cache drops that field (see wrikeEnrich.js),
// and links are added late, so they are read from Wrike when a market is
// opened and kept only in memory.

import { fetchCustomFields, fetchTasksById } from "../wrikeCampaign";

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// The field, found by title so it survives being recreated. null when the
// account has none.
export function pickFilePathField(fields) {
  const field =
    (fields || []).find((f) => norm(f.title) === "filepath") ||
    (fields || []).find((f) => /^(delivery)?(file)?(path|link)s?$/.test(norm(f.title)) && norm(f.title) !== "link") ||
    null;
  return field ? { id: field.id, title: field.title } : null;
}

// The same field holds server paths on other tasks, so only a web address
// counts as a delivery link. Wrike can hand a text field back with markup
// round the address.
export function deliveryLinkOf(value) {
  const found = /https?:\/\/[^\s"'<>]+/i.exec(String(value || ""));
  return found ? found[0].replace(/[).,;]+$/, "") : "";
}

// { taskId: link } for the tasks that carry one.
export function linksFromTasks(tasks, fieldId) {
  const links = {};
  for (const task of tasks || []) {
    const link = deliveryLinkOf((task.customFields || []).find((c) => c.id === fieldId)?.value);
    if (link) links[task.id] = link;
  }
  return links;
}

// What filling the sheet's Delivery Link column from Wrike would write: one
// change per order whose task has a link and whose cell is empty. `tasks` runs
// alongside `orders`. A cell that already holds something else is counted in
// `kept` and left for a person to settle; `column` is false when the sheet has
// no such column to fill.
export function planDeliveryFill(orders, tasks, links) {
  const changes = [];
  let kept = 0;
  let column = false;
  orders.forEach((order, i) => {
    const cell = order.cells?.deliveryLink;
    if (!cell || !order.tab) return;
    column = true;
    const link = links?.[tasks[i]?.id];
    if (!link || cell.was.trim() === link) return;
    if (cell.was.trim()) { kept++; return; }
    changes.push({ tab: order.tab, cell: cell.at, row: order.row, from: cell.was, to: link });
  });
  return { changes, kept, column };
}

// One lookup of the field per page load: its id doesn't change under us.
let fieldOnce = null;
const filePathField = () => (fieldOnce ||= fetchCustomFields().then(pickFilePathField).catch(() => { fieldOnce = null; return null; }));

// Reads the delivery links on `taskIds` from Wrike. { field, links }, where
// field is null when the account has no such custom field.
export async function readDeliveryLinks(taskIds) {
  const field = await filePathField();
  if (!field || !taskIds.length) return { field, links: {} };
  return { field, links: linksFromTasks(await fetchTasksById(taskIds), field.id) };
}
