// One film's orders, read live from Google: the client's Drive folder lists
// the markets, each market folder holds that film's order sheet, and each
// sheet is parsed the same way a dropped workbook is.

import { mapPool } from "../fetchPool";
import { FILM_MAPPINGS } from "../../constants";
import { listFolders, listSheetsIn, downloadSheet, GoogleError, GOOGLE_SHEET } from "./googleApi";
import { clientFor, filmsIn, isTestFolder } from "./driveTree";
import { sheetsFromBuffer } from "./readXlsx";
import { marketFromSheets } from "./parseWorkbook";

// Enough to finish a 60-market film in well under a minute without tripping
// Drive's per-user rate limit.
const IN_FLIGHT = 4;

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

async function loadMarket({ name, folderId, sheet }) {
  const from = {
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

// One market of a film, read again. The folders are still listed first, so a
// sheet the market has replaced is the one read. null when the market's folder
// no longer holds a sheet for the film. `loadedAt` is set because the film it
// goes back into was read at another time.
export async function loadMarketOf({ clientId, filmKey }, marketName, now = new Date()) {
  const film = (await listFilms(clientId)).find((f) => f.key === filmKey);
  const row = film?.markets.find((m) => m.name === marketName);
  if (!row) return null;
  return { ...(await loadMarket(row)), loadedAt: now.toISOString() };
}

// Returns an OrderFile whose `source` is what Refresh needs to read it again,
// or null when the client's folders no longer hold a sheet for the film. The
// folders are listed afresh each time, so a market added since shows up.
// `onMarket` is told about each market as its sheet is read, in the order
// they finish, so the page can show them arriving instead of a counter.
export async function loadFilm({ clientId, filmKey, onProgress, onMarket }, now = new Date()) {
  const film = (await listFilms(clientId)).find((f) => f.key === filmKey);
  if (!film) return null;

  let done = 0;
  onProgress?.(0, film.markets.length);
  const markets = await mapPool(film.markets, IN_FLIGHT, async (row) => {
    const market = await loadMarket(row);
    onProgress?.(++done, film.markets.length);
    onMarket?.(market);
    return market;
  });

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
