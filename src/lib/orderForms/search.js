// The Control Centre's search: every order in every film loaded, found by
// any of the words a PM would use for it. It runs over what the page already
// holds, so it asks nothing of Google or Wrike.

import { applySetAside, orderUrgency } from "./status";

const lower = (s) => String(s || "").toLowerCase();
const filmTitle = (name) => String(name || "").replace(/\.xlsx$/i, "");

// Words that stand for a list rather than for text, so "overdue" or
// "croatia to brief" find what the sections would. Longer phrases first, so
// "not in wrike" isn't read as "in wrike".
const SHORTCUTS = [
  { re: /\bnot in wrike\b/, label: "not in Wrike", test: (h) => !h.task },
  { re: /\bin wrike\b/, label: "in Wrike", test: (h) => !!h.task },
  { re: /\b(waiting for artwork|no artwork)\b/, label: "waiting for artwork", test: (h) => !h.task && !h.hasArtwork },
  { re: /\bto brief\b/, label: "to brief", test: (h) => !h.task && h.hasArtwork },
  { re: /\bto pick up\b/, label: "to pick up", test: (h) => !h.task && h.order.status === "requested" },
  { re: /\boverdue\b/, label: "overdue", test: (h) => h.urgency === "overdue" },
  { re: /\bdue (this week|soon)\b/, label: "due this week", test: (h) => h.urgency === "dueSoon" },
  { re: /\bpending\b/, label: "pending", test: (h) => h.order.status === "pending" },
  { re: /\bconfirmed\b/, label: "confirmed", test: (h) => h.order.status === "confirmed" },
];

// One entry per order. `matchFor(file, market)` is the Control Centre's own
// matching, aligned with the market's orders.
export function searchIndex(files, todayIso, matchFor = () => []) {
  const out = [];
  for (const raw of files || []) {
    const file = applySetAside(raw);
    for (const market of file.markets || []) {
      if (market.unreadable) continue;
      const matches = matchFor(file, market) || [];
      market.orders.forEach((order, i) => {
        const task = matches[i]?.task || null;
        const wrikeStatus = task?.customStatusName || task?.status || "";
        const size = order.width && order.height ? `${order.width}x${order.height}` : "";
        const text = lower([
          filmTitle(file.name), market.name, order.xyi?.title, order.deliveryName, order.placement, order.siteName,
          order.artwork, order.type, size, size.replace("x", " x "), order.duration ? `${order.duration}s` : "",
          order.status, wrikeStatus, task?.title, `row ${order.row}`,
        ].filter(Boolean).join(" | "));
        out.push({
          fileId: file.id, film: file.name, kind: market.kind || file.kind, market: market.name, wrapped: !!raw.wrapped,
          order, task, wrikeStatus, urgency: orderUrgency(order, todayIso),
          hasArtwork: !!String(order.artwork || "").trim(), text,
        });
      });
    }
  }
  return out;
}

// The orders a query finds: every word must appear (in any field), and each
// shortcut must hold. "row 14" means that row. { hits, total, shortcuts }:
// at most `limit` hits, ordered by film, market and row.
export function searchOrders(index, query, limit = 150) {
  let q = lower(query).trim();
  if (!q) return { hits: [], total: 0, shortcuts: [] };
  const tests = [];
  const shortcuts = [];
  for (const s of SHORTCUTS) {
    if (s.re.test(q)) {
      q = q.replace(s.re, " ");
      tests.push(s.test);
      shortcuts.push(s.label);
    }
  }
  const row = /\brow\s*(\d+)\b/.exec(q);
  if (row) {
    q = q.replace(row[0], " ");
    tests.push((h) => String(h.order.row) === row[1]);
    shortcuts.push(`row ${row[1]}`);
  }
  const words = q.split(/\s+/).filter(Boolean).map((w) => w.replace(/×/g, "x"));
  const found = index.filter((h) => tests.every((t) => t(h)) && words.every((w) => h.text.includes(w)));
  found.sort((a, b) => a.film.localeCompare(b.film) || a.market.localeCompare(b.market) || a.order.row - b.order.row);
  return { hits: found.slice(0, limit), total: found.length, shortcuts };
}

// Hits grouped by film and market, keeping their order.
export function groupHits(hits) {
  const groups = [];
  for (const h of hits) {
    const last = groups[groups.length - 1];
    if (last && last.fileId === h.fileId && last.market === h.market) last.hits.push(h);
    else groups.push({ fileId: h.fileId, film: h.film, kind: h.kind, market: h.market, hits: [h] });
  }
  return groups;
}
