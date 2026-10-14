// Google sign-in and the Drive and Sheets reads behind Client Orders.
//
// The sign-in is kept by the Worker (worker/googleAuth.js), as Wrike's is: a
// member approves TimeHub once on Google's page, and the Worker holds the
// refresh token and hands this page an access token whenever it asks. One
// approval covers reading Drive and editing sheets (Corrections, Fill links),
// and it lasts until it is disconnected or revoked in Google. The page calls
// Google itself with the token, so what it reads goes from Google to the
// browser and nowhere else.
//
// The access token is kept in sessionStorage so a reload has it at once, and
// the Worker is asked for the next one shortly before it lapses.

import { cellRange } from "./cells";

// Public by design, like the Supabase anon key: it names the app to Google and
// only works from the origins registered for it in Google Cloud. The Calendar
// sign-in (googleCalendar.js) still uses it with Google's in-browser library.
export const CLIENT_ID =
  // Optional: the tests run this file outside Vite, where there is no env.
  import.meta.env?.VITE_GOOGLE_CLIENT_ID ||
  "1047837005704-h04jm219u2mm5rojhpv1vo797rei5v3a.apps.googleusercontent.com";
const GSI_SRC = "https://accounts.google.com/gsi/client";
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DRIVE = "https://www.googleapis.com/drive/v3";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

const FOLDER = "application/vnd.google-apps.folder";
export const GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";
const SHORTCUT = "application/vnd.google-apps.shortcut";
const XLSX_FILE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const googleConfigured = () => !!CLIENT_ID;

let token = null;
let expiresAt = 0;
let scopes = "";
let email = "";
let gsiLoading = null;

const TOKEN_KEY = "xyi_google_token";

// Whoever shows whether this page is connected asks to be told when that
// changes: it can change from several places on the page.
const listeners = new Set();
const changed = () => listeners.forEach((fn) => fn());
export function onGoogleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function remember() {
  scheduleRenewal();
  changed();
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt, scopes, email }));
  } catch {
    // Storage off: the token still works for this page view.
  }
}

function forget() {
  token = null;
  expiresAt = 0;
  clearTimeout(renewTimer);
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* nothing stored */ }
  changed();
}

try {
  const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null");
  if (saved?.token && saved.expiresAt > Date.now()) ({ token, expiresAt, scopes = "", email = "" } = saved);
  else sessionStorage.removeItem(TOKEN_KEY);
} catch {
  // Unreadable or no storage: ask the Worker below.
}

export const googleConnected = () => !!token && Date.now() < expiresAt;
// The Google account connected, while it is.
export const googleAccount = () => (googleConnected() ? email : "");

// `reason` is what the page shows a message for; nothing read from a sheet is
// ever put in one of these.
export class GoogleError extends Error {
  constructor(reason, status) {
    super(reason);
    this.reason = reason;
    this.status = status;
  }
}

// Asks the Worker for an access token. true when it gave one; false when this
// person hasn't connected Google, or isn't signed in to TimeHub. Throws when
// the Worker couldn't answer, which is not the same as signed out. Callers at
// the same moment share one request.
let asking = null;
export function refreshGoogle() {
  asking ||= (async () => {
    try {
      const res = await fetch("/api/google/token", { cache: "no-store" });
      if (res.status === 401 || res.status === 404) {
        if (token) forget();
        return false;
      }
      if (!res.ok) throw new GoogleError("failed", res.status);
      const body = await res.json();
      token = body.accessToken;
      // A minute early, so a read never starts on a token about to lapse.
      expiresAt = Date.parse(body.expiresAt) - 60 * 1000;
      scopes = body.scopes || "";
      email = body.email || "";
      remember();
      return true;
    } catch (err) {
      throw err instanceof GoogleError ? err : new GoogleError("failed");
    } finally {
      asking = null;
    }
  })();
  return asking;
}

// The next token is asked for 30 seconds before this one counts as lapsed,
// which is inside the two minutes in which the Worker renews rather than
// handing back the same one. A page left open stays connected.
let renewTimer = null;
function scheduleRenewal() {
  clearTimeout(renewTimer);
  if (!token) return;
  renewTimer = setTimeout(() => refreshGoogle().catch(() => {}), Math.max(expiresAt - Date.now() - 30 * 1000, 5000));
}

// Google's page sends people back here with google_connected=1 or
// google_error=…, read once and taken out of the address.
let returned = null;
export const googleReturn = () => returned;
if (typeof window !== "undefined") {
  try {
    const u = new URL(window.location.href);
    const ok = u.searchParams.get("google_connected");
    const error = u.searchParams.get("google_error");
    if (ok || error) {
      returned = { connected: !!ok, error: error || "" };
      u.searchParams.delete("google_connected");
      u.searchParams.delete("google_error");
      window.history.replaceState(window.history.state, "", `${u.pathname}${u.search}${u.hash}`);
    }
  } catch { /* an address we can't read is left alone */ }
  // Whether this person is connected, asked quietly when the page loads.
  if (googleConnected()) scheduleRenewal();
  else refreshGoogle().catch(() => {});
}

// Drops the connection everywhere: the Worker deletes it and revokes it at
// Google.
export function disconnectGoogle() {
  forget();
  fetch("/api/google/oauth/disconnect", { method: "POST" }).catch(() => {});
}

export function loadGsi() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gsiLoading) {
    gsiLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GSI_SRC;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => { gsiLoading = null; reject(new GoogleError("offline")); };
      document.head.appendChild(script);
    });
  }
  return gsiLoading;
}

// Off to Google's approval page through the Worker, and back to this page.
// The page is left, so the promise is never settled.
function goApprove() {
  const back = `${window.location.pathname}${window.location.hash}`;
  window.location.assign(`/api/google/oauth/start?return=${encodeURIComponent(back)}`);
  return new Promise(() => {});
}

// Connects this person's Google. Connected already (on another browser, or
// with a token that had lapsed): straight back. Otherwise Google's page, once.
export async function connectGoogle() {
  if (!CLIENT_ID) throw new GoogleError("not-configured");
  if (googleConnected()) return;
  if (await refreshGoogle()) return;
  return goApprove();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A token to call Google with: this page's, or the next one from the Worker.
async function bearer() {
  if (googleConnected() || (await refreshGoogle())) return token;
  throw new GoogleError("signed-out");
}

async function gfetch(url, tries = 4, renewed = false) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await bearer()}` } });
  if (res.ok) return res;
  // Google turned the token down: one more try with a fresh one first.
  if (res.status === 401) {
    forget();
    if (!renewed && (await refreshGoogle().catch(() => false))) return gfetch(url, tries, true);
    throw new GoogleError("signed-out", 401);
  }
  // Google answers 429, or 403 with a rate reason, when reads come too fast.
  const limited = res.status === 429 || (res.status === 403 && /rateLimit|quota/i.test(await res.clone().text()));
  if ((limited || res.status >= 500) && tries > 1) {
    await sleep((5 - tries) * 1500 + Math.random() * 500);
    return gfetch(url, tries - 1, renewed);
  }
  throw new GoogleError(res.status === 404 ? "not-found" : res.status === 403 ? "no-access" : "failed", res.status);
}

const query = (params) => new URLSearchParams(params).toString();
const ALL_DRIVES = { supportsAllDrives: "true", includeItemsFromAllDrives: "true" };

// ── A client's folders ────────────────────────────────────────────────────────

const isSheet = (f) => f.mimeType === GOOGLE_SHEET || f.mimeType === XLSX_FILE;
const FILE_FIELDS = "id,name,mimeType,modifiedTime,webViewLink,parents,shortcutDetails";

const followShortcut = (f) =>
  f.mimeType === SHORTCUT && f.shortcutDetails
    ? { ...f, id: f.shortcutDetails.targetId, mimeType: f.shortcutDetails.targetMimeType }
    : f;

async function listAll(q) {
  const files = [];
  let pageToken = "";
  do {
    const page = await (await gfetch(`${DRIVE}/files?${query({
      q: `(${q}) and trashed = false`,
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      pageSize: "1000",
      ...ALL_DRIVES,
      ...(pageToken ? { pageToken } : {}),
    })}`)).json();
    files.push(...(page.files || []).map(followShortcut));
    pageToken = page.nextPageToken || "";
  } while (pageToken);
  return files;
}

// The folders directly inside a client's folder: one per market, plus a few
// that aren't markets, which hold no order sheets and so drop out later.
export async function listFolders(parentId) {
  return (await listAll(`'${parentId}' in parents`)).filter((f) => f.mimeType === FOLDER);
}

// Folders asked about in one query. A client has around 80 market folders, so
// this is a handful of calls instead of one a market.
const PARENTS_PER_QUERY = 20;

// The spreadsheets directly inside any of these folders, each with `parents`.
// The queries go at once, not one after another.
export async function listSheetsIn(folderIds) {
  const groups = [];
  for (let i = 0; i < folderIds.length; i += PARENTS_PER_QUERY) groups.push(folderIds.slice(i, i + PARENTS_PER_QUERY));
  const found = await Promise.all(groups.map((ids) => listAll(ids.map((id) => `'${id}' in parents`).join(" or "))));
  return found.flat().filter(isSheet);
}

// A spreadsheet's bytes as .xlsx. Through Drive, not the Sheets API: one call
// a file, and Drive's limit is far higher than Sheets' 60 reads a minute.
export async function downloadSheet(file) {
  const url = file.mimeType === GOOGLE_SHEET
    ? `${DRIVE}/files/${file.id}/export?${query({ mimeType: XLSX_FILE })}`
    : `${DRIVE}/files/${file.id}?${query({ alt: "media", supportsAllDrives: "true" })}`;
  return (await gfetch(url)).arrayBuffer();
}

// ── A cell's dropdown ─────────────────────────────────────────────────────────

// The choices each of these cells offers in the sheet, from its data
// validation: { cell: [options] }, with no entry for a cell that is free text.
// A list typed into the rule is read from it; a list kept on another tab (the
// artwork names) is read from that range. Read-only, with the reading sign-in.
export async function readCellChoices(spreadsheetId, tab, cells) {
  if (!cells.length) return {};
  const ranges = cells.map((c) => `ranges=${encodeURIComponent(cellRange(tab, c))}`).join("&");
  const fields = encodeURIComponent("sheets(data(rowData(values(dataValidation))))");
  const meta = await (await gfetch(`${SHEETS}/${spreadsheetId}?${ranges}&fields=${fields}`)).json();
  const rules = cells.map((_, i) => meta.sheets?.[0]?.data?.[i]?.rowData?.[0]?.values?.[0]?.dataValidation?.condition);

  const choices = {};
  const fromRange = []; // [cell, range]
  rules.forEach((rule, i) => {
    const values = (rule?.values || []).map((v) => v.userEnteredValue).filter((v) => v != null);
    if (rule?.type === "ONE_OF_LIST" && values.length) choices[cells[i]] = values;
    else if (rule?.type === "ONE_OF_RANGE" && values[0]) fromRange.push([cells[i], values[0].replace(/^=/, "")]);
  });

  if (fromRange.length) {
    const wanted = [...new Set(fromRange.map(([, range]) => range))];
    const query = wanted.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
    const data = await (await gfetch(`${SHEETS}/${spreadsheetId}/values:batchGet?${query}`)).json();
    const lists = new Map(wanted.map((range, i) => [
      range,
      [...new Set((data.valueRanges?.[i]?.values || []).flat().map((v) => String(v).trim()).filter(Boolean))],
    ]));
    for (const [cell, range] of fromRange) if (lists.get(range)?.length) choices[cell] = lists.get(range);
  }
  return choices;
}

// ── Writing a correction ──────────────────────────────────────────────────────

// Editing sheets is part of the one approval. A connection made without it
// goes back through Google's page to add it.
export const googleCanWrite = () => googleConnected() && scopes.includes(WRITE_SCOPE);

export async function connectGoogleForWriting() {
  if (googleCanWrite()) return;
  if ((await refreshGoogle()) && googleCanWrite()) return;
  return goApprove();
}

async function wfetch(url, init) {
  if (!googleCanWrite() && !((await refreshGoogle()) && googleCanWrite())) throw new GoogleError("signed-out");
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  if (res.ok) return res.json();
  if (res.status === 401) { forget(); throw new GoogleError("signed-out", 401); }
  throw new GoogleError(res.status === 404 ? "not-found" : res.status === 403 ? "no-access" : "failed", res.status);
}

// Writes `changes` ({ range, from, to }) to one spreadsheet. Each cell is read
// again first and written only if it still holds `from`, so an edit someone
// made since the preview is never overwritten. Returns how many were written
// and how many were left because they had changed.
export async function applyCellChanges(spreadsheetId, changes) {
  if (!changes.length) return { written: 0, changed: 0 };
  const ranges = changes.map((c) => `ranges=${encodeURIComponent(c.range)}`).join("&");
  const now = await wfetch(`${SHEETS}/${spreadsheetId}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE`);
  const still = changes.filter((c, i) => String(now.valueRanges?.[i]?.values?.[0]?.[0] ?? "") === c.from);
  if (still.length) {
    await wfetch(`${SHEETS}/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      // RAW: the text as typed, never read as a formula or a date.
      body: JSON.stringify({ valueInputOption: "RAW", data: still.map((c) => ({ range: c.range, values: [[c.to]] })) }),
    });
  }
  return { written: still.length, changed: changes.length - still.length };
}
