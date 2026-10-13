// The clients' order-form workbooks → the Order Forms page's data. Pure: takes the
// sheets as arrays of rows (see readXlsx.js) and never touches the network.
//
// Columns are found by header text, not position, so the Motion and Print
// layouts share one parser and an inserted column doesn't shift anything.
// Paramount's and Universal's forms word some headers differently; where they
// do, a field lists both.

import { a1 } from "./cells";

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();

// What an untouched template cell says. They read as empty everywhere.
const PLACEHOLDERS = new Set([
  "please update",
  "double click to update",
  "please confirm unit",
  "confirm orientation",
  "please confirm orientation",
  "confirm if rgb or cmyk",
]);

// #VALUE!, #REF!, #DIV/0!, #NAME?, #N/A: a formula with nothing to work on yet.
const ERROR_VALUE = /^#[A-Z0-9/]+[!?]$|^#N\/A$/;

export function cleanCell(value) {
  if (value == null) return "";
  if (value instanceof Date) return toDeadline(value);
  const text = String(value).trim();
  if (PLACEHOLDERS.has(norm(text)) || ERROR_VALUE.test(text)) return "";
  return text;
}

// Markets merge a cell down several rows to say "same for all of these" (one
// size shared by a run of sites). A spreadsheet keeps a merged cell's value in
// its top row only, so every other row would read as having no size. This
// copies the value down the merge. `merges` are { s: { r, c }, e: { r, c } },
// zero-based. Only downwards: a cell merged across columns is a heading.
export function fillMergedDown(rows, merges) {
  for (const { s, e } of merges || []) {
    const value = rows[s.r]?.[s.c];
    if (value == null || value === "") continue;
    for (let r = s.r + 1; r <= e.r; r++) {
      if (!rows[r]) rows[r] = [];
      while (rows[r].length < s.c) rows[r].push("");
      rows[r][s.c] = value;
    }
  }
  return rows;
}

const pad = (n) => String(n).padStart(2, "0");
const utcIso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// Spreadsheet day numbers count from 30 Dec 1899. The range keeps a duration or
// a pixel width in a date column from being read as a date.
const SERIAL_MIN = 20000; // 1954
const SERIAL_MAX = 80000; // 2119
const SERIAL_EPOCH = Date.UTC(1899, 11, 30);

export function toDeadline(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : utcIso(value);
  if (typeof value === "number") {
    if (value < SERIAL_MIN || value > SERIAL_MAX) return "";
    return utcIso(new Date(SERIAL_EPOCH + Math.floor(value) * 86400000));
  }
  const text = cleanCell(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const uk = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  return uk ? `${uk[3]}-${pad(uk[2])}-${pad(uk[1])}` : "";
}

// Where an order has got to. `received` is the form's XYi Received tick box,
// or null on a form without one.
//
// With the tick box, the order is XYi's to call: ticked is confirmed, and
// until then it is a request that has come in, unless the market itself has
// marked the row pending (not ready to be actioned). Without it, the market's
// own answer is all there is to go on.
export function orderStatus(confirmedCell, received = null) {
  const v = norm(cleanCell(confirmedCell));
  const pending = v.startsWith("pending") || v === "n" || v === "no";
  if (received != null) return received ? "confirmed" : pending ? "pending" : "requested";
  if (v.startsWith("confirmed") || v === "y" || v === "yes") return "confirmed";
  return pending ? "pending" : "unanswered";
}

export const isMarketTab = (name) => !name.startsWith("_") && name !== "AA_Test_Market";

// The header of the column that says which market a row is for. Finding it is
// how the header row itself is found.
const MARKET_HEADERS = ["market", "territory code", "country"];

// The index of a tab's header row, or -1.
export const findHeaderRow = (rows) =>
  rows.findIndex((row) => (row || []).some((cell) => MARKET_HEADERS.includes(norm(cell))));

// field → the header it sits under. A string matches the start of the header;
// { is } matches the whole header, for words that also start other headers.
const COLUMNS = [
  ["marketCode", MARKET_HEADERS.map((is) => ({ is }))],
  ["confirmed", ["are your orders confirmed"]],
  ["deliveryDeadline", ["delivery deadline"]],
  ["liveDate", ["live date", "go live date"]],
  ["mediaApproved", ["media approved"]],
  ["placement", ["inth / foh / ooh", "dinth / dfoh / dooh", "dinth / foh / dooh"]],
  ["artwork", ["artwork selection"]],
  ["translations", ["translations"]],
  ["siteName", ["media site name", "media / location site name"]],
  ["width", [{ is: "width" }, { is: "pixel width" }]],
  ["height", [{ is: "height" }, { is: "pixel height" }]],
  ["unit", ["unit of measurement"]],
  ["orientation", ["orientation"]],
  ["notes", [{ is: "notes" }, { is: "additional notes" }]],
  ["received", ["xyi received"]],
  ["deliveryName", ["enterprise delivery name", "puma delivery name"]],
  // Motion
  ["format", ["format / animation", "los / mos / static"]],
  ["duration", ["duration"]],
  ["fileSize", ["file size"]],
  ["bitRate", ["bit rate"]],
  ["videoFormat", ["video format", "specific video requirements"]],
  ["sound", ["sound req"]],
  ["rotation", ["canvas rotation"]],
  ["specSheet", ["spec sheet", "upload specifications"]],
  // Print
  ["type", [{ is: "type" }]],
  ["colourMode", ["rgb"]],
  ["specs", ["written detailed specifications"]],
];

// The XYi block. On Paramount's forms its headers sit one row above the header
// row, and in the header row those columns hold default values. On Universal's
// they are in the header row with everything else.
const XYI_COLUMNS = [
  ["title", "title"],
  ["workflow", "workflow"],
  ["customStatus", "custom status"],
  ["endDate", "end date"],
  ["marketDeadline", "market deadline"],
  ["pm", "pm"],
  ["department", "department"],
  ["aspectRatio", "aspect ratio"],
  ["art", "art"],
  ["xyiFormat", "format"],
  ["quote", "quote"],
  // Where the PMs keep the link an order was delivered at.
  ["deliveryLink", "delivery link"],
];

// Fields the page can edit in the sheet. Most are plain text, where what is
// typed is what the cell should hold. Dates and sizes are written as what the
// sheet holds them as (a cell's `as`), or they would stop being dates and
// numbers to the sheet's own formulas:
//   "serial"  a real date, held as a day number
//   "text"    a date someone typed that the sheet kept as text ("17/08/2026")
//   "number"  a size
export const EDITABLE_FIELDS = [
  "confirmed", "deliveryDeadline", "liveDate", "placement", "siteName", "width", "height",
  "artwork", "translations", "notes", "specs",
];
const NUMBER_FIELDS = new Set(["width", "height"]);

// A day as the sheet's day number, and as the text markets type.
export const toSerial = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - SERIAL_EPOCH) / 86400000);
};
export const toUkDate = (iso) => iso.split("-").reverse().join("/");

const REQUIRED = [["confirmed", "Confirmed"], ["width", "Width"], ["height", "Height"], ["deliveryDeadline", "Delivery deadline"]];
const DATE_FIELDS = new Set(["deliveryDeadline", "liveDate"]);
const XYI_DATE_FIELDS = new Set(["endDate", "marketDeadline"]);

const matches = (header, want) => (typeof want === "string" ? header.startsWith(want) : header === want.is);

function mapColumns(headerRow) {
  const headers = headerRow.map(norm);
  const cols = {};
  for (const [field, wants] of COLUMNS) {
    const at = headers.findIndex((h) => h && wants.some((w) => matches(h, w)));
    if (at !== -1) cols[field] = at;
  }
  return cols;
}

function mapXyiColumns(xyiRow, from) {
  const headers = (xyiRow || []).map(norm);
  const cols = {};
  for (const [field, want] of XYI_COLUMNS) {
    const at = headers.findIndex((h, i) => i > from && h === want);
    if (at !== -1) cols[field] = at;
  }
  return cols;
}

function kindOf(rows, headerAt, cols) {
  for (const row of rows.slice(0, headerAt)) {
    for (const cell of row || []) {
      const text = norm(cell);
      if (text.includes("[motion")) return "motion";
      if (text.includes("[print")) return "print";
    }
  }
  return "duration" in cols ? "motion" : "print";
}

const codeFromTab = (name) => /\(([^)]+)\)\s*$/.exec(name)?.[1] || "";

const unreadable = (name, reason) => ({ name, code: codeFromTab(name), kind: null, unreadable: reason, orders: [], undated: 0 });

// What a market types on a row, as opposed to what the template ships with
// (size, placement, duration). Used to notice a row someone started but gave no
// deadline.
const MARKET_TYPED = ["siteName", "liveDate", "artwork", "translations", "notes", "mediaApproved"];

// A row is an order when it has a delivery deadline: that is how the PMs tell a
// row the market wants from the pre-filled rows the template leaves for them.
// Returns the order, "undated" for a row with the market's typing on it but no
// deadline, or null for a row to ignore.
function readOrder(row, rowNumber, cols, xyiCols) {
  const order = { row: rowNumber };
  for (const [field] of COLUMNS) {
    const raw = field in cols ? row[cols[field]] : "";
    order[field] = DATE_FIELDS.has(field) ? toDeadline(raw) : cleanCell(raw);
  }
  // A tick box: true once XYi has the order, null on a form with no such column.
  order.received = "received" in cols ? /^(true|y|yes)$/.test(norm(order.received)) : null;
  order.status = orderStatus(order.confirmed, order.received);
  if (!order.deliveryDeadline) {
    // The market's own answer, not the status: an untouched template row has
    // an empty tick box too, and that isn't someone starting an order.
    return orderStatus(order.confirmed) !== "unanswered" || MARKET_TYPED.some((f) => order[f]) ? "undated" : null;
  }

  order.xyi = {};
  for (const [field] of XYI_COLUMNS) {
    const raw = field in xyiCols ? row[xyiCols[field]] : "";
    order.xyi[field] = XYI_DATE_FIELDS.has(field) ? toDeadline(raw) : cleanCell(raw);
  }
  const ratio = Number(order.xyi.aspectRatio);
  if (order.xyi.aspectRatio && Number.isFinite(ratio)) order.xyi.aspectRatio = ratio.toFixed(2);
  return order;
}

export function parseMarket(name, rows) {
  const headerAt = findHeaderRow(rows);
  if (headerAt === -1) return unreadable(name, "No header row found");

  const cols = mapColumns(rows[headerAt]);
  const missing = REQUIRED.find(([field]) => !(field in cols));
  if (missing) return unreadable(name, `Missing column: ${missing[1]}`);

  // Only look for XYi headers to the right of the market's own columns: "Format"
  // and "Art" would otherwise be ambiguous with anything a market adds.
  const marketEnd = cols.deliveryName ?? Math.max(...Object.values(cols));
  const above = mapXyiColumns(rows[headerAt - 1], marketEnd);
  const xyiCols = "title" in above ? above : mapXyiColumns(rows[headerAt], marketEnd);

  // Rows start at the sheet's first used cell (see readXlsx.js).
  const origin = rows.origin || { r: 0, c: 0 };
  const orders = [];
  let undated = 0;
  for (let i = headerAt + 1; i < rows.length; i++) {
    const order = readOrder(rows[i] || [], i + 1, cols, xyiCols);
    if (order === "undated") undated++;
    else if (order) {
      // Where each editable field sits and what the cell holds, uncleaned: an
      // edit is written to that cell only if it still holds this.
      order.cells = {};
      for (const field of EDITABLE_FIELDS) {
        if (!(field in cols)) continue;
        const raw = rows[i]?.[cols[field]];
        const cell = { at: a1(i + origin.r, cols[field] + origin.c), was: raw == null ? "" : String(raw) };
        if (NUMBER_FIELDS.has(field)) cell.as = "number";
        // An empty date cell is decided below, by what the rest of its column holds.
        else if (DATE_FIELDS.has(field)) cell.as = typeof raw === "number" ? "serial" : cell.was.trim() ? "text" : "";
        order.cells[field] = cell;
      }
      // Not typed into from the table: filled from Wrike (see deliveryLinks.js).
      if ("deliveryLink" in xyiCols) {
        const raw = rows[i]?.[xyiCols.deliveryLink];
        order.cells.deliveryLink = { at: a1(i + origin.r, xyiCols.deliveryLink + origin.c), was: raw == null ? "" : String(raw) };
      }
      orders.push(order);
    }
  }
  // A date typed into an empty cell is written the way the column's other
  // dates are held: as a real date unless this market's are all text.
  for (const field of DATE_FIELDS) {
    const held = orders.map((o) => o.cells[field]?.as).filter(Boolean);
    const usual = held.length && held.every((as) => as === "text") ? "text" : "serial";
    for (const o of orders) if (o.cells[field] && !o.cells[field].as) o.cells[field].as = usual;
  }
  return { name, code: codeFromTab(name), kind: kindOf(rows, headerAt, cols), unreadable: null, orders, undated };
}

// One market from that market's own workbook (the per-film sheet in its Drive
// folder), named after that folder. Usually one order tab beside the
// helper tabs; if a market has split its orders over several, they are read
// together and each order says which tab it came from.
export function marketFromSheets(sheets, marketName) {
  const tabs = Object.keys(sheets).filter(isMarketTab).map((name) => parseMarket(name, sheets[name] || []));
  if (!tabs.length) return { ...unreadable(marketName, "No order form tab in this sheet"), code: "" };
  const readable = tabs.filter((t) => !t.unreadable);
  if (!readable.length) return { ...unreadable(marketName, tabs[0].unreadable), code: "" };
  return {
    name: marketName,
    code: readable[0].code,
    kind: readable[0].kind,
    unreadable: null,
    orders: readable.flatMap((t) => t.orders.map((o) => ({ ...o, tab: t.name }))),
    undated: readable.reduce((n, t) => n + t.undated, 0),
  };
}

// null when the workbook holds no readable market tab: it isn't an order form.
export function parseWorkbook(sheets, fileName, now = new Date()) {
  const markets = Object.keys(sheets)
    .filter(isMarketTab)
    .map((name) => parseMarket(name, sheets[name] || []));
  const readable = markets.find((m) => !m.unreadable);
  if (!readable) return null;
  return {
    id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: fileName,
    kind: readable.kind,
    loadedAt: now.toISOString(),
    markets,
  };
}
