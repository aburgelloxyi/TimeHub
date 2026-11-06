// Digital Enterprise Uploads: the AMs' sheet of upload names and dates, each row
// to become a plain task in its film's "…_Enterprise_Daily_Uploads" folder in
// Wrike. No brief and no parent task: the name and date make the task, and the
// sheet's other columns (Market Deadline, Department…) fill its fields.
//
// The film is the code the name starts with (FIL_…, EBZR_…), looked up in the
// film codes. A row whose name says _DOM_ goes to the domestic side's folder.
// Pure; wrikeUploads.js does the reading and writing.

import { collectSubtreeIds } from "../wrikeCampaign";
import { findFilm } from "./wrikeMarketFolder";
import { sheetDate, sheetText } from "./domestic";
import { tidyTaskName } from "./wrikeBatch";

// The studios that have a sheet, and where it is.
export const UPLOAD_SHEETS = {
  paramount: { id: "1vZMlcRV4Z6M5X0RRfelN-ldeZeNnHsGLOI0biU8Djck", label: "Digital Enterprise Uploads" },
};

// Each column by its header, wherever it sits in the first rows.
const COLUMNS = [
  ["name", /^(enterprise )?upload name$/],
  ["date", /^date$/],
  ["marketDeadline", /^market deadline$/],
  ["department", /^department$/],
  ["reporting", /^reporting$/],
  ["market", /^market$/],
  ["quote", /^quote$/],
  ["jobNumber", /^job (number|no\.?)$/],
];
const HEADER_ROWS = 6;

// The Wrike fields a task is given, by title as the account names them, and
// what fills each. Job Number holds the folder's title, as briefed tasks' do.
export const UPLOAD_FIELDS = [
  { title: "Job Number", from: (_, place) => place.jobNumber },
  { title: "Market Deadline", from: (u) => u.marketDeadline },
  { title: "Department", from: (u) => u.department },
  { title: "Reporting", from: (u) => u.reporting },
  { title: "Market", from: (u) => u.market },
  { title: "Quote", from: (u) => u.quote },
];

// A date the way the sheet may hold it: a day number, "2026-11-04", or
// "4/11/2026" written day first. "" for anything else.
export function dayOf(v) {
  const text = sheetDate(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (!m || Number(m[2]) > 12 || Number(m[1]) > 31) return "";
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const headerText = (v) => sheetText(v).toLowerCase().replace(/\s+/g, " ");

// The sheet's rows as uploads. `values` is the tab as the Sheets API gives it,
// unformatted. { ok, columns: { key: index }, uploads: [{ row, name, date, … }] }
// or { ok: false, reason }. `row` is the sheet's own row number.
export function readUploads(values) {
  const rows = values || [];
  const columns = {};
  let headerEnd = -1;
  rows.slice(0, HEADER_ROWS).forEach((r, i) => (r || []).forEach((cell, c) => {
    const text = headerText(cell);
    for (const [key, re] of COLUMNS) {
      if (columns[key] == null && re.test(text)) { columns[key] = c; headerEnd = Math.max(headerEnd, i); }
    }
  }));
  if (columns.name == null) return { ok: false, reason: 'The sheet has no "Enterprise Upload Name" column.' };

  const uploads = [];
  for (let i = headerEnd + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = tidyTaskName(sheetText(r[columns.name]));
    if (!name) continue;
    const text = (key) => (columns[key] == null ? "" : sheetText(r[columns[key]]));
    const day = (key) => (columns[key] == null ? "" : dayOf(r[columns[key]]));
    uploads.push({
      row: i + 1,
      name,
      date: day("date"),
      dateText: columns.date == null ? "" : sheetDate(r[columns.date]),
      marketDeadline: day("marketDeadline") || text("marketDeadline"),
      department: text("department"),
      reporting: text("reporting"),
      market: text("market"),
      quote: text("quote"),
      jobNumber: text("jobNumber"),
    });
  }
  return { ok: true, columns, uploads };
}

// The film code a name starts with, and whether it's for the domestic side.
export const codeOf = (name) => String(name || "").split("_")[0].toUpperCase();
export const isDomestic = (name) => /(^|_)DOM(_|$)/i.test(String(name || ""));

// Matching a task by name: case and runs of underscores or spaces don't count.
export const taskKey = (title) => tidyTaskName(title).toLowerCase();

const UPLOADS_FOLDER = /_Enterprise_Daily_Uploads$/i;

// A film's uploads folder in the Wrike tree. Its INT and DOM sides are told
// apart by the folder above (INT_Digital, DOM_Digital) or the folder's own
// name; one on neither counts as INT. { ok, film, folder, jobNumber, jobCode }
// or { ok: false, reason } when there isn't exactly one.
export function findUploadsFolder(byId, filmTitle, { domestic = false } = {}) {
  const location = findFilm(byId, filmTitle);
  if (!location) return { ok: false, reason: `No film called "${filmTitle}" was found in Wrike.` };
  const film = location.filmProject;
  const ids = collectSubtreeIds(byId, film.id);
  const parentOf = {};
  for (const id of ids) for (const child of byId[id]?.childIds || []) parentOf[child] = byId[id];
  const side = (f) => (/(^|_)DOM(_|$)/i.test(f.title) || /^DOM/i.test(parentOf[f.id]?.title || "") ? "dom" : "int");
  const found = [...ids].map((id) => byId[id]).filter((f) => f && UPLOADS_FOLDER.test(String(f.title || "").trim()));
  const wanted = found.filter((f) => side(f) === (domestic ? "dom" : "int"));
  const kind = domestic ? "domestic " : "";
  if (!wanted.length) return { ok: false, reason: `${film.title} has no ${kind}Enterprise_Daily_Uploads folder in Wrike.` };
  if (wanted.length > 1) {
    return { ok: false, reason: `${film.title} has ${wanted.length} ${kind}Enterprise_Daily_Uploads folders (${wanted.map((f) => f.title).join(", ")}), so it isn't clear which.` };
  }
  const folder = wanted[0];
  return {
    ok: true,
    film: film.title,
    folder: { id: folder.id, title: folder.title },
    jobNumber: folder.title,
    jobCode: (/^XY\d+/i.exec(folder.title)?.[0] || "").toUpperCase(),
  };
}

// Where each row would go, and whether it can. `codes` is the film-code map,
// `placeOf(film, domestic)` findUploadsFolder's answer, `existing(folderId)`
// the tasks already in a folder as Map(taskKey → task). Each upload comes back
// with { code, film, place, state, reason, task }: state is "in-wrike" (with
// the task), "ready", or "blocked" (with the reason).
export function planUploads(uploads, { codes = {}, placeOf, existing = () => new Map() }) {
  const seen = new Map(); // taskKey → first row
  return uploads.map((u) => {
    const code = codeOf(u.name);
    const film = codes[code] || "";
    const base = { ...u, code, film, place: null, task: null };
    const twin = seen.get(taskKey(u.name));
    if (twin) return { ...base, state: "blocked", reason: `Same name as row ${twin}.` };
    seen.set(taskKey(u.name), u.row);
    if (!film) return { ...base, state: "blocked", reason: `"${code}" isn't a known film code. Add it in Film Codes.` };
    const place = placeOf(film, isDomestic(u.name));
    if (!place?.ok) return { ...base, state: "blocked", reason: place?.reason || "Its folder couldn't be found." };
    const task = existing(place.folder.id).get(taskKey(u.name)) || null;
    if (task) return { ...base, place, task, state: "in-wrike" };
    return { ...base, place, state: "ready", reason: u.dateText && !u.date ? `"${u.dateText}" isn't a date, so it has no due date.` : "" };
  });
}
