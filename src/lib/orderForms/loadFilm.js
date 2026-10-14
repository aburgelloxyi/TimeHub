// One film's orders, read live from Google: the client's Drive folder lists
// the markets, each market folder holds that film's order sheet, and each
// sheet is parsed the same way a dropped workbook is.

import { mapPool } from "../fetchPool";
import { FILM_MAPPINGS } from "../../constants";
import { listFolders, listSheetsIn, downloadSheet, GoogleError, GOOGLE_SHEET } from "./googleApi";
import { clientFor, filmsIn, isTestFolder } from "./driveTree";
import { sheetsFromBuffer } from "./readXlsx";
import { marketFromSheets, READ_VERSION } from "./parseWorkbook";

// Sheets read at once. Drive allows thousands of requests a minute a person;
// turning a sheet into .xlsx is heavier, and a "slow down" from Google is
// waited out and retried (gfetch), so this is well inside what it takes.
const IN_FLIGHT = 8;

const REASONS = {
  "not-found": "The sheet is no longer in this market's folder",
  "no-access": "Your Google account can't open this market's sheet",
  failed: "Google couldn't be reached for this market",
};

const missing = (name, reason) => ({ name, code: "", kind: null, unreadable: reason, orders: [], undated: 0 });

// The films a client has order sheets for, each with its markets.
export async function listFilms(clientId) {
  const client = clientFor(clientId);
  if (!client) return [];
  const folders = (await listFolders(client.folderId)).filter((f) => !isTestFolder(f.name));
  return filmsIn(folders, await listSheetsIn(folders.map((f) => f.id)), FILM_MAPPINGS);
}

// A saved market stands in for reading its sheet again when it is provably
// the same: the same file, unchanged in Drive since (modifiedTime), read by
// this version of the reader, and read fine. Drive's modifiedTime misses
// values a sheet pulls from elsewhere (IMPORTRANGE) or works out from the
// date (TODAY), so a sheet is still read at least once a day whatever it
// says.
const READ_AT_LEAST = 24 * 60 * 60 * 1000;
export function stillCurrent(saved, row, now = Date.now()) {
  return !!saved && !saved.unreadable
    && saved.readVersion === READ_VERSION
    && saved.sheetId === row.sheet?.id
    && !!saved.sheetModified && saved.sheetModified === row.sheet?.modifiedTime
    && !!saved.readAt && now - Date.parse(saved.readAt) < READ_AT_LEAST;
}

async function loadMarket({ name, folderId, sheet }, now = new Date()) {
  const from = {
    // What stillCurrent compares against next time.
    sheetModified: sheet.modifiedTime || "",
    readVersion: READ_VERSION,
    readAt: now.toISOString(),
    sheetName: sheet.name,
    sheetUrl: sheet.webViewLink || "",
    sheetId: sheet.id,
    // An uploaded Excel file can be read but has no cells Google can write to.
    sheetNative: sheet.mimeType === GOOGLE_SHEET,
    folderUrl: folderId ? `https://drive.google.com/drive/folders/${folderId}` : "",
  };
  try {
    return { ...marketFromSheets(await sheetsFromBuffer(await downloadSheet(sheet)), name), ...from };
  } catch (err) {
    // Signed out part-way: stop the whole load rather than mark 60 markets unreadable.
    if (err instanceof GoogleError && err.reason === "signed-out") throw err;
    return { ...missing(name, REASONS[err.reason] || "This market's sheet couldn't be read"), ...from };
  }
}

// The folder a saved market was read from, from its folderUrl.
export const folderIdOf = (market) => /\/folders\/([^/?#]+)/.exec(market?.folderUrl || "")?.[1] || "";

// The film's sheet in one market folder, as filmsIn would find it in the
// whole tree: the newest sheet there for that film. null when there is none.
export function marketRowIn(folderId, name, sheets, filmKey) {
  const film = filmsIn([{ id: folderId, name }], sheets, FILM_MAPPINGS).find((f) => f.key === filmKey);
  return film?.markets[0] ? { ...film.markets[0], name } : null;
}

// One market of a film, read again. `market` is the saved one: its own folder
// is listed, not the client's whole tree, so a sheet the market has replaced
// is still the one read, in one request instead of several. The whole tree is
// listed only when the folder isn't known or no longer holds the film's
// sheet (moved or renamed). null when the market has no sheet for the film.
// `loadedAt` is set because the film it goes back into was read at another
// time.
export async function loadMarketOf({ clientId, filmKey }, market, now = new Date()) {
  const name = market?.name;
  const folderId = folderIdOf(market);
  let row = folderId ? marketRowIn(folderId, name, await listSheetsIn([folderId]), filmKey) : null;
  if (!row) {
    const film = (await listFilms(clientId)).find((f) => f.key === filmKey);
    row = film?.markets.find((m) => m.name === name) || null;
  }
  if (!row) return null;
  return { ...(await loadMarket(row, now)), loadedAt: now.toISOString() };
}

// Returns an OrderFile whose `source` is what Refresh needs to read it again,
// or null when the client's folders no longer hold a sheet for the film. The
// folders are listed afresh each time, so a market added since shows up.
// `onMarket` is told about each market as its sheet is read, in the order
// they finish, so the page can show them arriving instead of a counter.
// `previous` is the film as last read: a market whose sheet is still current
// (stillCurrent) is kept from it instead of read again. `tally`, when given,
// is filled with how many sheets were read and how many kept.
export async function loadFilm({ clientId, filmKey, onProgress, onMarket, previous, tally }, now = new Date()) {
  const film = (await listFilms(clientId)).find((f) => f.key === filmKey);
  if (!film) return null;

  const before = new Map((previous?.markets || []).map((m) => [m.name, m]));
  let done = 0;
  let kept = 0;
  onProgress?.(0, film.markets.length);
  const markets = await mapPool(film.markets, IN_FLIGHT, async (row) => {
    const saved = before.get(row.name);
    const fresh = stillCurrent(saved, row, now.getTime());
    if (fresh) kept++;
    const market = fresh ? saved : await loadMarket(row, now);
    onProgress?.(++done, film.markets.length);
    onMarket?.(market);
    return market;
  });
  if (tally) Object.assign(tally, { read: markets.length - kept, kept });

  return {
    id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: `${clientFor(clientId).label} · ${film.label}`,
    kind: film.medium,
    film: film.title,
    loadedAt: now.toISOString(),
    source: { clientId, filmKey },
    markets,
  };
}
