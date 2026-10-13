// Working out what to write to order sheets: a correction made across several
// of them, or the edits typed against one market's orders. Which cells would
// change, and to what. Pure; the reads and the writes are in googleApi.js.
//
// A correction is found per cell and shown before anything is written, and the
// write is only ever those cells. Nothing here guesses: a header or a value
// must match in full (ignoring case and spacing) to be changed.

import { findHeaderRow, isMarketTab } from "./parseWorkbook";
import { columnLetter, a1, cellRange } from "./cells";

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();

export { columnLetter, a1, cellRange };

// `kind: "header"` renames the column headed `column` to `to`.
// `kind: "value"` changes cells reading `find` to `to` in the column headed
// `column`, below the header row.
// What's missing from one, as a sentence for the page, or "" when it can run.
export function correctionProblem({ kind, column, find, to }) {
  if (!norm(column)) return "Say which column, by its header.";
  if (!String(to ?? "").trim()) return "Say what it should read instead.";
  if (kind === "value" && !norm(find)) return "Say which value to change.";
  if (norm(kind === "header" ? column : find) === norm(to) && String(kind === "header" ? column : find).trim() === String(to).trim()) {
    return "That would change nothing.";
  }
  return "";
}

// What to write over a cell: a number stays a number and a tick box a tick box
// when the new text can be one, so the sheet's formulas still see them as such.
function sameKind(value, to) {
  if (typeof value === "number" && to.trim() !== "" && Number.isFinite(Number(to))) return Number(to);
  if (typeof value === "boolean" && /^(true|false)$/i.test(to.trim())) return /^true$/i.test(to.trim());
  return to;
}

// Each sheet's changes turned round, to put back what an apply wrote. Written
// with the same only-if-unchanged check, so a cell edited since is left alone.
export const reversed = (changes) => changes.map((c) => ({ ...c, from: String(c.to), to: c.undo ?? c.from }));

// `grids` is { tabName: { rows, origin } } (see gridsFromBuffer): rows as read,
// and where the first of them sits on the sheet, so a cell's address is right
// when the sheet doesn't start at A1. Only order tabs are looked at, and only
// ones whose header row can be found.
export function findChanges(grids, correction) {
  const { kind, column, find, to } = correction;
  const changes = [];
  for (const [tab, { rows, origin }] of Object.entries(grids)) {
    if (!isMarketTab(tab)) continue;
    const headerAt = findHeaderRow(rows);
    if (headerAt === -1) continue;
    const header = rows[headerAt] || [];
    const address = (r, c) => a1(r + origin.r, c + origin.c);
    header.forEach((cell, c) => {
      if (norm(cell) !== norm(column)) return;
      if (kind === "header") {
        if (String(cell) !== to) changes.push({ tab, cell: address(headerAt, c), from: String(cell), to });
        return;
      }
      for (let r = headerAt + 1; r < rows.length; r++) {
        const value = rows[r]?.[c];
        if (value == null || value === "" || norm(value) !== norm(find)) continue;
        const next = sameKind(value, to);
        // `undo` is the cell's own value, kept so undoing a number writes a number back.
        if (next !== value) changes.push({ tab, cell: address(r, c), from: String(value), to: next, undo: value });
      }
    });
  }
  return changes;
}

// Every order sheet in one market's folder, across a client's films.
export function docsForMarket(films, marketName) {
  return (films || []).flatMap((film) =>
    film.markets.filter((m) => m.name === marketName).map((m) => ({ film: film.label, label: film.label, sheet: m.sheet })));
}

// The sheets a correction can reach, by how wide it is asked to go: one
// market's folder ("market"), one film across its markets ("film"), or
// everything the client has ("client"). Each has a label for its tick box.
export function docsForScope(films, scope, { market, filmKey } = {}) {
  if (scope === "market") return docsForMarket(films, market);
  const chosen = scope === "film" ? (films || []).filter((f) => f.key === filmKey) : films || [];
  return chosen
    .flatMap((film) => film.markets.map((m) => ({ film: film.label, label: scope === "film" ? m.name : `${m.name} · ${film.label}`, sheet: m.sheet })))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export const marketNames = (films) =>
  [...new Set((films || []).flatMap((f) => f.markets.map((m) => m.name)))].sort((a, b) => a.localeCompare(b));

// The cells to write for edits typed against a market's orders. `edits` is
// { "orderIndex:field": text }. Only fields the parser recorded a cell for can
// be edited, and an edit that leaves the cell as it was is dropped.
export function editChanges(orders, edits) {
  const changes = [];
  for (const [key, to] of Object.entries(edits || {})) {
    const [index, field] = key.split(":");
    const order = orders[Number(index)];
    const cell = order?.cells?.[field];
    if (!cell || !order.tab || to === cell.was) continue;
    changes.push({ tab: order.tab, cell: cell.at, from: cell.was, to });
  }
  return changes;
}
