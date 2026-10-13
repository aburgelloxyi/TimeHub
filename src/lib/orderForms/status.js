// What the Order Forms screens show about a market, worked out from its orders.
// Derived on display rather than stored, so changing a rule here doesn't mean
// re-loading anyone's files.

import { orderKey, taskKey } from "./wrikeMatch";

const DUE_SOON_DAYS = 7;

// A file as the screens show it: each market's orders without the ones a PM
// has set aside (file.ignored, by market), which are kept on `setAside` so the
// market's page can list them underneath. The sheet is untouched; this only
// decides what counts here.
export function applySetAside(file) {
  if (!file?.ignored) return file;
  return {
    ...file,
    markets: file.markets.map((m) => {
      const keys = new Set(file.ignored[m.name] || []);
      if (!keys.size || m.unreadable) return m;
      return {
        ...m,
        orders: m.orders.filter((o) => !keys.has(orderKey(o))),
        setAside: m.orders.filter((o) => keys.has(orderKey(o))),
      };
    }),
  };
}

const addDays = (iso, days) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

// A confirmed order is settled, so only the others can be late.
export function orderUrgency(order, todayIso) {
  if (order.status === "confirmed" || !order.deliveryDeadline) return null;
  if (order.deliveryDeadline < todayIso) return "overdue";
  return order.deliveryDeadline <= addDays(todayIso, DUE_SOON_DAYS) ? "dueSoon" : null;
}

const isApproved = (value) => /^(y|yes|approved)/i.test(String(value || "").trim());

const earliest = (orders) =>
  orders.map((o) => o.deliveryDeadline).filter(Boolean).sort()[0] || "";

export function marketSummary(market, todayIso) {
  const orders = market.orders;
  const count = (status) => orders.filter((o) => o.status === status).length;
  const confirmed = count("confirmed");
  const pending = count("pending");
  const unanswered = count("unanswered");
  const requested = count("requested");

  let status;
  if (market.unreadable) status = "unreadable";
  else if (orders.length === 0) status = "notStarted";
  // Confirmed means all of them.
  else if (confirmed === orders.length) status = "confirmed";
  // Requests are in that XYi hasn't ticked as received yet.
  else if (requested > 0) status = "requested";
  // Orders are in but the confirmation column was never answered: the market
  // has done the work, and a PM needs to chase the answer.
  else if (confirmed + pending === 0) status = "unconfirmed";
  // Some confirmed and some unanswered is still open, the same as an order
  // marked pending.
  else status = "pending";

  const urgencies = orders.map((o) => orderUrgency(o, todayIso));
  const urgency = urgencies.includes("overdue") ? "overdue" : urgencies.includes("dueSoon") ? "dueSoon" : null;

  const open = orders.filter((o) => o.status !== "confirmed");
  return {
    name: market.name,
    code: market.code,
    unreadable: market.unreadable,
    status,
    total: orders.length,
    confirmed,
    pending,
    unanswered,
    requested,
    undated: market.undated || 0,
    mediaApproved: orders.filter((o) => isApproved(o.mediaApproved)).length,
    nextDeadline: earliest(open) || earliest(orders),
    urgency,
  };
}

export function fileTotals(file, todayIso) {
  const summaries = file.markets.map((m) => marketSummary(m, todayIso));
  const count = (test) => summaries.filter(test).length;
  return {
    markets: summaries.length,
    orders: summaries.reduce((n, m) => n + m.total, 0),
    confirmed: count((m) => m.status === "confirmed"),
    requested: count((m) => m.status === "requested"),
    pending: count((m) => m.status === "pending"),
    unconfirmed: count((m) => m.status === "unconfirmed"),
    due: count((m) => m.urgency),
    notStarted: count((m) => m.status === "notStarted"),
  };
}

// The order a PM needs to read them in: what's late or nearly due, then
// requests waiting on XYi, then what's still open or unanswered, then what's
// settled, then markets that haven't begun.
const rank = (m) => {
  if (m.status === "unreadable") return 6;
  if (m.urgency === "overdue") return 0;
  if (m.urgency === "dueSoon") return 1;
  return { requested: 2, pending: 2.5, unconfirmed: 3, confirmed: 4, notStarted: 5 }[m.status];
};

export function sortMarkets(summaries) {
  return [...summaries].sort((a, b) =>
    rank(a) - rank(b) ||
    (a.nextDeadline || "9999").localeCompare(b.nextDeadline || "9999") ||
    a.name.localeCompare(b.name));
}

// What needs a PM across every film loaded, for the profile's Orders Today:
// orders past their deadline, due within the week, requests XYi hasn't ticked
// as received, and rows a market has marked pending. An order is in the first
// of those it fits, so the four lists don't repeat each other. Each entry says
// where it is ({ fileId, film, market }) and carries the order; lists are
// soonest deadline first. `films` is one line per file for the summary.
export function ordersNeedingAttention(files, todayIso) {
  const lists = { overdue: [], dueSoon: [], requested: [], pending: [] };
  const films = [];
  for (const raw of files || []) {
    const file = applySetAside(raw);
    const counts = { overdue: 0, dueSoon: 0, requested: 0, pending: 0, orders: 0 };
    for (const market of file.markets) {
      if (market.unreadable) continue;
      for (const order of market.orders) {
        counts.orders++;
        const urgency = orderUrgency(order, todayIso);
        const list = urgency || (order.status === "requested" ? "requested" : order.status === "pending" ? "pending" : null);
        if (!list) continue;
        counts[list]++;
        lists[list].push({ fileId: file.id, film: file.name, market: market.name, order });
      }
    }
    films.push({ fileId: file.id, film: file.name, kind: file.kind, loadedAt: file.loadedAt, ...counts });
  }
  const byDeadline = (a, b) => (a.order.deliveryDeadline || "9999").localeCompare(b.order.deliveryDeadline || "9999");
  for (const list of Object.values(lists)) list.sort(byDeadline);
  return { ...lists, films };
}

// ── What changed between two reads ────────────────────────────────────────────
// Refresh replaces a film's orders wholesale, so without this a PM has to spot
// for themselves what a market did since they last looked.

// One key per order that survives rows moving: its tab and name, numbered
// where a market has the same order more than once. Aligned with `orders`.
export function changeKeys(orders) {
  const seen = new Map();
  return orders.map((o) => {
    const base = `${o.tab || ""}|${taskKey(o.xyi?.title || o.deliveryName) || `row${o.row}`}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  });
}

// What a market's newer read has that the older didn't: orders added, orders
// now confirmed, deadlines moved (each a list of changeKeys), and how many
// orders are gone. null when nothing did.
export function marketChanges(before, after) {
  const was = new Map(changeKeys(before?.orders || []).map((key, i) => [key, before.orders[i]]));
  const keys = changeKeys(after.orders);
  const found = { added: [], confirmed: [], moved: [], removed: 0 };
  keys.forEach((key, i) => {
    const old = was.get(key);
    const now = after.orders[i];
    if (!old) return found.added.push(key);
    if (old.status !== "confirmed" && now.status === "confirmed") found.confirmed.push(key);
    if (old.deliveryDeadline !== now.deliveryDeadline) found.moved.push(key);
  });
  const still = new Set(keys);
  found.removed = [...was.keys()].filter((key) => !still.has(key)).length;
  return found.added.length || found.confirmed.length || found.moved.length || found.removed ? found : null;
}

// Changes not yet looked at, joined with newer ones for the same market.
export function mergeChanges(unseen, newer) {
  if (!unseen) return newer;
  if (!newer) return unseen;
  const join = (a, b) => [...new Set([...a, ...b])];
  return {
    added: join(unseen.added, newer.added),
    confirmed: join(unseen.confirmed, newer.confirmed),
    moved: join(unseen.moved, newer.moved),
    removed: unseen.removed + newer.removed,
  };
}

// A whole film read again: every market's changes against the older read, on
// top of whatever hadn't been looked at yet. A market that wasn't there before
// has all its orders as added. { marketName: changes }, only for markets with some.
export function fileChanges(before, after) {
  const old = new Map((before?.markets || []).map((m) => [m.name, m]));
  const changes = {};
  for (const market of after.markets) {
    if (market.unreadable) continue;
    const merged = mergeChanges(before?.changes?.[market.name], marketChanges(old.get(market.name), market));
    if (merged) changes[market.name] = merged;
  }
  return changes;
}

// "2 new · 1 confirmed · 1 date moved · 1 gone".
export function changesNote(c) {
  if (!c) return "";
  return [
    c.added.length && `${c.added.length} new`,
    c.confirmed.length && `${c.confirmed.length} confirmed`,
    c.moved.length && `${c.moved.length} ${c.moved.length === 1 ? "date" : "dates"} moved`,
    c.removed && `${c.removed} gone`,
  ].filter(Boolean).join(" · ");
}
