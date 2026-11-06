// Reading the uploads sheet and Wrike for it, and making the tasks
// (enterpriseUploads.js has the rules). Same rule as wrikeCampaign.js:
// reading says exactly what would be made; making happens when someone asks.

import { gfetch, applyCellChanges, googleCanWrite } from "./googleApi";
import { a1, cellRange } from "./cells";
import {
  fetchAllFolders, fetchTasksUnderFolder, discoverCustomStatus, createTaskIn, fetchCustomFields, fetchFolderPermalink,
} from "../wrikeCampaign";
import { savedFolders } from "./wrikeMarketFolder";
import { resolveFields, fieldUse, fieldValue } from "./wrikeFields";
import { UPLOAD_FIELDS, UPLOAD_SHEETS, findUploadsFolder, isDomestic, planUploads, readUploads, taskKey, codeOf } from "./enterpriseUploads";
import { sameFilmName } from "./extras";

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

// The sheet's first tab, unformatted: dates as day numbers, so "4/11/2026"
// can't be read the American way. Also the tab's name, for writing back.
async function readSheet(sheetId) {
  const params = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" });
  const data = await (await gfetch(`${SHEETS}/${sheetId}/values/${encodeURIComponent("A1:Z2000")}?${params}`)).json();
  const tab = (/^'?(.*?)'?!/.exec(data.range || "")?.[1] || "").replace(/''/g, "'");
  return { tab, values: data.values || [] };
}

// The rows of a studio's sheet alone, without Wrike: what the film cards count.
// Held for a few minutes, so opening and closing a studio reads it once.
const ROWS_FOR_MS = 3 * 60 * 1000;
const rowsRead = new Map(); // studioId → { at, read }
export function uploadRowsFor(studioId) {
  const sheet = UPLOAD_SHEETS[studioId];
  if (!sheet) return Promise.resolve([]);
  const held = rowsRead.get(studioId);
  if (held && Date.now() - held.at < ROWS_FOR_MS) return held.read;
  const read = readSheet(sheet.id).then((s) => readUploads(s.values).uploads || []);
  rowsRead.set(studioId, { at: Date.now(), read });
  read.catch(() => rowsRead.delete(studioId));
  return read;
}

// A film's rows: those whose code names it.
export const uploadsOfFilm = (uploads, codes, film) => uploads.filter((u) => sameFilmName(codes[codeOf(u.name)], film));

// Everything a film's page shows: its rows in the sheet, each with where it
// goes and whether it's there already, and what making the rest needs (status,
// fields). The saved folder tree is tried first; Wrike itself is asked when a
// row's folder isn't in it, so a folder made today is still found.
export async function readUploadsSheet(sheetId, codes, film) {
  const sheet = await readSheet(sheetId);
  const all = readUploads(sheet.values);
  if (!all.ok) return { ...all, tab: sheet.tab };
  const read = { ...all, uploads: uploadsOfFilm(all.uploads, codes, film) };

  const wanted = [...new Map(read.uploads.map((u) => [`${codes[codeOf(u.name)] || ""}|${isDomestic(u.name)}`, u])).values()]
    .filter((u) => codes[codeOf(u.name)]);
  const placesFrom = (byId) => new Map(wanted.map((u) => {
    const film = codes[codeOf(u.name)];
    return [`${film}|${isDomestic(u.name)}`, findUploadsFolder(byId, film, { domestic: isDomestic(u.name) })];
  }));
  const saved = await savedFolders();
  let places = saved ? placesFrom(saved) : null;
  if (!places || [...places.values()].some((p) => !p.ok)) places = placesFrom(await fetchAllFolders());

  const folders = [...new Map([...places.values()].filter((p) => p.ok).map((p) => [p.folder.id, p.folder])).values()];
  const [tasksByFolder, links, status, accountFields] = await Promise.all([
    Promise.all(folders.map((f) => fetchTasksUnderFolder(f.id).catch(() => []))),
    Promise.all(folders.map((f) => fetchFolderPermalink(f.id).catch(() => ""))),
    discoverCustomStatus("Studio", "Backlog").catch(() => null),
    fetchCustomFields().catch(() => []),
  ]);
  const existing = new Map(folders.map((f, i) => [f.id, new Map(tasksByFolder[i].map((t) => [taskKey(t.title), { id: t.id, title: t.title, permalink: t.permalink || "" }]))]));
  const permalinks = Object.fromEntries(folders.map((f, i) => [f.id, links[i]]));

  const uploads = planUploads(read.uploads, {
    codes,
    placeOf: (film, domestic) => places.get(`${film}|${domestic}`),
    existing: (id) => existing.get(id) || new Map(),
  });
  return {
    ok: true,
    tab: sheet.tab,
    columns: read.columns,
    uploads,
    permalinks,
    status,
    fields: resolveFields(accountFields, fieldUse(tasksByFolder.flat()), UPLOAD_FIELDS.map((f) => f.title)),
  };
}

// The custom fields one upload's task is given, and any value a field refused.
export function uploadFields(upload, fields) {
  const set = [];
  const refused = [];
  for (const spec of UPLOAD_FIELDS) {
    const field = fields[spec.title];
    if (!field) continue;
    const got = fieldValue(field, spec.from(upload, upload.place));
    if (!got) continue;
    if (got.refused) refused.push(`${spec.title}: ${got.refused}`);
    else set.push({ id: field.id, value: got.value });
  }
  return { set, refused };
}

// Makes a task for each upload, one at a time, in its folder, due on its date.
// A failure part-way leaves the ones made, and says which weren't.
// Returns { made: [{ row, id, permalink }], failed: [{ row, name, reason }] }.
export async function createUploadTasks(uploads, { status, fields, onProgress }) {
  const made = [];
  const failed = [];
  for (const u of uploads) {
    try {
      const custom = uploadFields(u, fields).set;
      const task = await createTaskIn(u.place.folder.id, {
        title: u.name,
        ...(u.date ? { dates: { type: "Milestone", due: u.date } } : {}),
        ...(status ? { customStatus: status.id } : {}),
        ...(custom.length ? { customFields: custom } : {}),
      });
      if (!task.id) throw new Error("Wrike didn't return the task.");
      made.push({ row: u.row, id: task.id, title: task.title, permalink: task.permalink });
    } catch (err) {
      failed.push({ row: u.row, name: u.name, reason: err?.message || "Wrike refused it." });
    }
    onProgress?.(made.length + failed.length, uploads.length);
  }
  return { made, failed };
}

// The job number (XY026214) into the sheet's Job Number column, for rows that
// have a folder and nothing there yet. Only cells still empty are written, so
// anything typed since the read stays. { written, skipped } or null when the
// sheet has no such column or Google hasn't allowed editing.
export async function writeJobNumbers(sheetId, { tab, columns, uploads }) {
  if (columns.jobNumber == null || !googleCanWrite()) return null;
  const changes = uploads
    .filter((u) => u.place?.jobCode && !u.jobNumber)
    .map((u) => ({ range: cellRange(tab, a1(u.row - 1, columns.jobNumber)), from: "", to: u.place.jobCode }));
  if (!changes.length) return { written: 0, skipped: 0 };
  const done = await applyCellChanges(sheetId, changes);
  return { written: done.written, skipped: done.changed };
}
