import { columnLetter, a1, cellRange, findChanges, correctionProblem, docsForMarket, marketNames, editChanges } from "../src/lib/orderForms/corrections.js";

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
  check("dates and sizes aren't editable", ["deliveryDeadline", "width"].map((f) => f in market.orders[0].cells), [false, false]);
  check("edits become cell changes; an edit back to the same text is dropped",
    editChanges(market.orders, { "0:confirmed": "Confirmed", "0:siteName": "Foyer", "1:notes": "Rush" }),
    [{ tab: "Croatia (HRV)", cell: "B4", from: "Pending", to: "Confirmed" }, { tab: "Croatia (HRV)", cell: "G6", from: "", to: "Rush" }]);
  check("an edit to a field with no cell is ignored", editChanges(market.orders, { "0:width": "5", "9:notes": "x" }), []);
}
