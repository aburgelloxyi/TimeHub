// Google sign-in and the Drive and Sheets reads behind Client Orders.
//
// Read-only by scope: drive.readonly lets the signed-in person's own access be
// used to read files, and nothing else. The access token goes to googleapis.com
// and nowhere else, so the Worker and Supabase never see it or anything it
// reads.
//
// The token is kept in sessionStorage so a reload doesn't sign the PM out. It
// lasts an hour at most and goes when the tab closes. After that, the next
// click that needs Google asks again without the account or consent screens,
// because Google remembers the grant.

// Public by design, like the Supabase anon key: it names the app to Google and
// only works from the origins registered for it in Google Cloud.
export const CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  "1047837005704-h04jm219u2mm5rojhpv1vo797rei5v3a.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const GSI_SRC = "https://accounts.google.com/gsi/client";
const DRIVE = "https://www.googleapis.com/drive/v3";

const FOLDER = "application/vnd.google-apps.folder";
const GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";
const SHORTCUT = "application/vnd.google-apps.shortcut";
const XLSX_FILE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const googleConfigured = () => !!CLIENT_ID;

let token = null;
let expiresAt = 0;
let gsiLoading = null;

const TOKEN_KEY = "xyi_google_token";
// Set once Google has granted access in this browser. It only decides whether
// to ask Google quietly next time; it is not a credential.
const GRANTED_KEY = "xyi_google_granted";

function remember() {
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt }));
    localStorage.setItem(GRANTED_KEY, "1");
  } catch {
    // Storage off: the sign-in still works for this page view.
  }
}

function forget() {
  token = null;
  expiresAt = 0;
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* nothing stored */ }
}

try {
  const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null");
  if (saved?.token && saved.expiresAt > Date.now()) ({ token, expiresAt } = saved);
  else sessionStorage.removeItem(TOKEN_KEY);
} catch {
  // Unreadable or no storage: start signed out.
}

export const googleConnected = () => !!token && Date.now() < expiresAt;

// Drops this tab's sign-in. Google still remembers the grant; removing that is
// done from the person's Google account.
export function disconnectGoogle() {
  forget();
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

// `reason` is what the page shows a message for; nothing read from a sheet is
// ever put in one of these.
export class GoogleError extends Error {
  constructor(reason, status) {
    super(reason);
    this.reason = reason;
    this.status = status;
  }
}

// Opens Google's own sign-in window. Must be called from a click, or the
// browser blocks the popup.
//
// Once access has been granted in this browser the request is made with an
// empty prompt, which Google answers without showing the account chooser or
// the consent screen when it can. If that quiet request fails, the next one
// asks in full.
export async function connectGoogle() {
  if (!CLIENT_ID) throw new GoogleError("not-configured");
  await loadGsi();
  const quiet = localStorage.getItem(GRANTED_KEY) === "1";
  const failed = (reason) => {
    if (quiet) localStorage.removeItem(GRANTED_KEY);
    return new GoogleError(reason);
  };
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (res) => {
        if (res.error || !res.access_token) return reject(failed("denied"));
        token = res.access_token;
        // A minute early, so a load never starts on a token about to lapse.
        expiresAt = Date.now() + (Number(res.expires_in) - 60) * 1000;
        remember();
        resolve();
      },
      error_callback: (err) => reject(failed(err?.type === "popup_closed" ? "cancelled" : "popup")),
    });
    client.requestAccessToken(quiet ? { prompt: "" } : {});
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gfetch(url, tries = 4) {
  if (!googleConnected()) throw new GoogleError("signed-out");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.ok) return res;
  if (res.status === 401) { forget(); throw new GoogleError("signed-out", 401); }
  // Google answers 429, or 403 with a rate reason, when reads come too fast.
  const limited = res.status === 429 || (res.status === 403 && /rateLimit|quota/i.test(await res.clone().text()));
  if ((limited || res.status >= 500) && tries > 1) {
    await sleep((5 - tries) * 1500 + Math.random() * 500);
    return gfetch(url, tries - 1);
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
export async function listSheetsIn(folderIds) {
  const sheets = [];
  for (let i = 0; i < folderIds.length; i += PARENTS_PER_QUERY) {
    const anyOf = folderIds.slice(i, i + PARENTS_PER_QUERY).map((id) => `'${id}' in parents`).join(" or ");
    sheets.push(...(await listAll(anyOf)).filter(isSheet));
  }
  return sheets;
}

// A spreadsheet's bytes as .xlsx. Through Drive, not the Sheets API: one call
// a file, and Drive's limit is far higher than Sheets' 60 reads a minute.
export async function downloadSheet(file) {
  const url = file.mimeType === GOOGLE_SHEET
    ? `${DRIVE}/files/${file.id}/export?${query({ mimeType: XLSX_FILE })}`
    : `${DRIVE}/files/${file.id}?${query({ alt: "media", supportsAllDrives: "true" })}`;
  return (await gfetch(url)).arrayBuffer();
}
