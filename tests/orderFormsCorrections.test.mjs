import { columnLetter, a1, cellRange, findChanges, correctionProblem, docsForMarket, marketNames, editChanges, docsForScope, reversed } from "../src/lib/orderForms/corrections.js";

check("column letters", [0, 3, 25, 26, 27].map(columnLetter), ["A", "D", "Z", "AA", "AB"]);
check("cell address", [a1(0, 0), a1(2, 26)], ["A1", "AA3"]);
check("range quotes the tab", cellRange("Croatia's (HRV)", "B3"), "'Croatia''s (HRV)'!B3");

const grid = (rows, origin = { r: 0, c: 0 }) => ({ rows, origin });
const sheet = {
  _StandardSizes: grid([["MARKET", "x"]]),
  "Croatia (HRV)": grid([
    ["CROATIA - [MOTION] - ORDER FORM"],
    [],
    ["MARKET", "Are your orders confirmed?", "MEDIA SITE NAME"],
    ["HR", "Pending", "Foyer"],
    ["HR", "pending ", "Market"],
    ["HR", "Confirmed", "Lobby"],
  ]),
};

check("rename a header: only the header cell, on order tabs only",
  findChanges(sheet, { kind: "header", column: "Market", to: "COUNTRY" }),
  [{ tab: "Croatia (HRV)", cell: "A3", from: "MARKET", to: "COUNTRY" }]);
check("a header already reading that is left alone", findChanges(sheet, { kind: "header", column: "market", to: "MARKET" }), []);
check("a header that only starts with the words isn't matched", findChanges(sheet, { kind: "header", column: "Are your orders", to: "X" }), []);
check("change a value: every match in that column, below the header",
  findChanges(sheet, { kind: "value", column: "Are your orders confirmed?", find: "Pending", to: "Confirmed" }).map((c) => [c.cell, c.from]),
  [["B4", "Pending"], ["B5", "pending "]]);
check("the same text in another column is untouched",
  findChanges(sheet, { kind: "value", column: "Market", find: "Market", to: "X" }), []);
check("a sheet that doesn't start at A1 gives real addresses",
  findChanges({ T: grid([["MARKET", "WIDTH"], ["HR", 10]], { r: 2, c: 1 }) }, { kind: "header", column: "Width", to: "W" }),
  [{ tab: "T", cell: "C3", from: "WIDTH", to: "W" }]);
check("a tab with no header row is skipped", findChanges({ Notes: grid([["hello"]]) }, { kind: "header", column: "hello", to: "x" }), []);

check("problems", [
  correctionProblem({ kind: "header", column: "", to: "x" }),
  correctionProblem({ kind: "header", column: "Market", to: " " }),
  correctionProblem({ kind: "value", column: "Market", find: "", to: "x" }),
  correctionProblem({ kind: "header", column: "Market", to: "Market" }),
  correctionProblem({ kind: "header", column: "Market", to: "MARKET" }),
  correctionProblem({ kind: "value", column: "Market", find: "a", to: "b" }),
], ["Say which column, by its header.", "Say what it should read instead.", "Say which value to change.", "That would change nothing.", "", ""]);

const films = [
  { label: "A · Motion", markets: [{ name: "Bulgaria (BG)", sheet: { id: "1" } }, { name: "Austria (AT)", sheet: { id: "2" } }] },
  { label: "A · Print", markets: [{ name: "Bulgaria (BG)", sheet: { id: "3" } }] },
];
check("markets across films", marketNames(films), ["Austria (AT)", "Bulgaria (BG)"]);
check("a market's sheets across films", docsForMarket(films, "Bulgaria (BG)").map((d) => [d.film, d.sheet.id]), [["A · Motion", "1"], ["A · Print", "3"]]);

// A sheet whose market header has been renamed is still an order form.
{
  const { parseMarket } = await import("../src/lib/orderForms/parseWorkbook.js");
  const m = parseMarket("X", [["X - [PRINT] - ORDER FORM"], ["COUNTRY", "Are your orders confirmed?", "DELIVERY DEADLINE", "WIDTH", "HEIGHT"], ["HR", "Y", "01/11/2026", 1, 2]]);
  check("a form whose Market header reads Country is still read", [m.unreadable, m.orders.length, m.orders[0]?.marketCode], [null, 1, "HR"]);
}

// ── Edits typed against a market's orders ─────────────────────────────────────
{
  const { marketFromSheets } = await import("../src/lib/orderForms/parseWorkbook.js");
  const rows = [
    ["X - [PRINT] - ORDER FORM"],
    ["MARKET", "Are your orders confirmed?", "MEDIA SITE NAME", "DELIVERY DEADLINE", "WIDTH", "HEIGHT", "NOTES"],
    ["HR", "Pending", "Foyer", "01/11/2026", 1, 2, "Please update"],
    ["HR", "", "", "", "", "", ""],
    ["HR", "Confirmed", "Lobby", "02/11/2026", 3, 4, ""],
  ];
  rows.origin = { r: 1, c: 0 };
  const market = marketFromSheets({ "Croatia (HRV)": rows }, "Croatia");
  check("an order knows where its editable cells are, and what they hold",
    [market.orders[0].cells.confirmed, market.orders[0].cells.notes, market.orders[1].cells.siteName],
    [{ at: "B4", was: "Pending" }, { at: "G4", was: "Please update" }, { at: "C6", was: "Lobby" }]);
  check("a date knows how the sheet holds it, and a size is a number",
    [market.orders[0].cells.deliveryDeadline, market.orders[0].cells.width], [{ at: "D4", was: "01/11/2026", as: "text" }, { at: "E4", was: "1", as: "number" }]);
  check("edits become cell changes; an edit back to the same text is dropped",
    editChanges(market.orders, { "0:confirmed": "Confirmed", "0:siteName": "Foyer", "1:notes": "Rush" }),
    [
      { tab: "Croatia (HRV)", cell: "B4", from: "Pending", to: "Confirmed", show: { from: "Pending", to: "Confirmed" }, undo: "Pending" },
      { tab: "Croatia (HRV)", cell: "G6", from: "", to: "Rush", show: { from: "", to: "Rush" }, undo: "" },
    ]);
  check("an edit to a field with no cell is ignored", editChanges(market.orders, { "0:duration": "5", "9:notes": "x" }), []);
  check("a size is written as a number", editChanges(market.orders, { "0:width": "1090", "0:height": "2" }).map((c) => [c.cell, c.to, c.undo]), [["E4", 1090, 1]]);
  check("a date kept as text is written as text", editChanges(market.orders, { "0:deliveryDeadline": "2026-11-09" }).map((c) => [c.to, c.show]),
    [["09/11/2026", { from: "2026-11-01", to: "2026-11-09", date: true }]]);
  check("the same day again is no change", editChanges(market.orders, { "0:deliveryDeadline": "2026-11-01" }), []);

  const real = marketFromSheets({ T: [["MARKET", "Are your orders confirmed?", "DELIVERY DEADLINE", "LIVE DATE", "WIDTH", "HEIGHT"], ["HR", "Y", 46327, "", 1, 2], ["HR", "Y", 46328, 46330, 1, 2]] }, "X");
  check("a real date is written as the sheet's day number, and undone as one",
    editChanges(real.orders, { "0:deliveryDeadline": "2026-11-09" }).map((c) => [c.from, c.to, c.undo]), [["46327", 46335, 46327]]);
  check("an empty date cell takes after the rest of its column", real.orders[0].cells.liveDate.as, "serial");
  check("clearing a date empties the cell", editChanges(real.orders, { "1:liveDate": "" }).map((c) => c.to), [""]);
}

// ── Numbers and tick boxes ────────────────────────────────────────────────────
{
  const g = { T: { origin: { r: 0, c: 0 }, rows: [["MARKET", "WIDTH", "XYi Received", "DURATION"], ["HR", 1080, false, "15"], ["HR", 1920, true, 15]] } };
  check("a number in a cell is found, and stays a number",
    findChanges(g, { kind: "value", column: "Width", find: "1080", to: "1090" }),
    [{ tab: "T", cell: "B2", from: "1080", to: 1090, undo: 1080 }]);
  check("a number changed to words becomes text", findChanges(g, { kind: "value", column: "Width", find: "1920", to: "TBC" })[0].to, "TBC");
  check("a tick box", findChanges(g, { kind: "value", column: "XYi Received", find: "false", to: "TRUE" })[0].to, true);
  check("text and number spellings of the same value are both found",
    findChanges(g, { kind: "value", column: "Duration", find: "15", to: "20" }).map((c) => [c.cell, c.to]), [["D2", "20"], ["D3", 20]]);
  check("undo puts back what was there, as what it was",
    reversed(findChanges(g, { kind: "value", column: "Width", find: "1080", to: "1090" })),
    [{ tab: "T", cell: "B2", from: "1090", to: 1080, undo: 1080 }]);
}

// ── How wide a correction goes ────────────────────────────────────────────────
{
  const fs = [
    { key: "a|motion", label: "A · Motion", markets: [{ name: "Bulgaria (BG)", sheet: { id: "1" } }, { name: "Austria (AT)", sheet: { id: "2" } }] },
    { key: "b|print", label: "B · Print", markets: [{ name: "Bulgaria (BG)", sheet: { id: "3" } }] },
  ];
  check("one market, every film", docsForScope(fs, "market", { market: "Bulgaria (BG)" }).map((d) => d.sheet.id), ["1", "3"]);
  check("one film, every market, by market name", docsForScope(fs, "film", { filmKey: "a|motion" }).map((d) => [d.label, d.sheet.id]), [["Austria (AT)", "2"], ["Bulgaria (BG)", "1"]]);
  check("the whole client", docsForScope(fs, "client").map((d) => d.label), ["Austria (AT) · A · Motion", "Bulgaria (BG) · A · Motion", "Bulgaria (BG) · B · Print"]);
}
