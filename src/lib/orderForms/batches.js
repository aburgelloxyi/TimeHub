// Batches a PM prepares on a market before briefing them into Wrike: rows
// grouped under a name and a due date, saved with the film for every PM
// (file.batches[market]), each briefed as one Wrike batch task when it's ready.
// A batch holds orders by orderKey, so, as with every decision kept about an
// order, a row that moves in the sheet drops out of its batch rather than
// taking another row's place.
//
// And rows that look like the same order twice: same artwork, same country,
// same size (and same length, when both have one: a 10s and a 15s are two
// files).

import { orderKey } from "./wrikeMatch";
import { artworkChosen } from "./artwork";

// Each batch's colour, in order. Deep enough to carry white text (4.5:1 or better).
export const BATCH_COLOURS = ["#4338ca", "#0f766e", "#b45309", "#be123c", "#7c3aed", "#0369a1", "#15803d", "#be185d"];
export const batchColour = (index) => BATCH_COLOURS[index % BATCH_COLOURS.length];

const newId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// The batches with the given orders taken out of all of them; a batch left empty goes.
export function takeOut(batches, keys) {
  const out = new Set(keys);
  return (batches || [])
    .map((b) => ({ ...b, keys: b.keys.filter((k) => !out.has(k)) }))
    .filter((b) => b.keys.length > 0);
}

// A new batch of these orders, taken out of any they were in.
export function groupInto(batches, keys, { name, due = "" } = {}) {
  return [...takeOut(batches, keys), { id: newId(), name: String(name || "").trim(), due, keys: [...keys] }];
}

// These orders moved into an existing batch.
export function addTo(batches, id, keys) {
  const moved = takeOut(batches, keys);
  const target = moved.find((b) => b.id === id) || (batches || []).find((b) => b.id === id);
  if (!target) return moved;
  const rest = moved.filter((b) => b.id !== id);
  const at = (batches || []).findIndex((b) => b.id === id);
  const merged = { ...target, keys: [...target.keys.filter((k) => !keys.includes(k)), ...keys] };
  rest.splice(Math.min(at, rest.length), 0, merged);
  return rest;
}

export const renameBatch = (batches, id, changes) => (batches || []).map((b) => (b.id === id ? { ...b, ...changes } : b));
export const disband = (batches, id) => (batches || []).filter((b) => b.id !== id);

// The batches against the market's orders as they are now: each with the row
// indices it still holds (in sheet order), and which batch each row is in.
export function placeBatches(batches, orders) {
  const indexOf = new Map(orders.map((o, i) => [orderKey(o), i]));
  const byRow = new Map();
  const live = (batches || []).map((b, n) => {
    const rows = b.keys.map((k) => indexOf.get(k)).filter((i) => i != null).sort((x, y) => x - y);
    const placed = { ...b, number: n + 1, colour: batchColour(n), rows };
    rows.forEach((i) => byRow.set(i, placed));
    return placed;
  });
  return { batches: live, byRow };
}

// What a batch holds at a glance: its sizes, most first ("4 × 1080x1920").
export function batchSizes(orders, rows) {
  const by = new Map();
  for (const i of rows) {
    const o = orders[i];
    const size = o?.width && o?.height ? `${o.width}x${o.height}${o.unit && !/^px$/i.test(o.unit) ? ` ${o.unit}` : ""}` : "no size";
    by.set(size, (by.get(size) || 0) + 1);
  }
  return [...by].sort((a, b) => b[1] - a[1]).map(([size, n]) => ({ size, n }));
}

const norm = (v) => String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();

// Rows that look like one order twice: index → the other rows' indices.
// Only rows with an artwork chosen (not "TBC", artwork.js) and a size are
// compared; without those there is nothing to say they're the same. The country is the row's own code, falling
// back to the market, since one tab can hold several countries.
export function findDuplicates(orders, marketName = "") {
  const groups = new Map();
  orders.forEach((o, i) => {
    if (!artworkChosen(o.artwork) || !o.width || !o.height) return;
    const key = [
      norm(o.marketCode) || norm(marketName),
      norm(o.artwork),
      `${norm(o.width)}x${norm(o.height)}${norm(o.unit)}`,
    ].join("|");
    groups.set(key, [...(groups.get(key) || []), i]);
  });
  const twins = new Map();
  for (const rows of groups.values()) {
    for (const i of rows) {
      // Two lengths given and different: two files, not a duplicate.
      const same = rows.filter((j) => j !== i && (!orders[i].duration || !orders[j].duration || norm(orders[i].duration) === norm(orders[j].duration)));
      if (same.length) twins.set(i, same);
    }
  }
  return twins;
}
