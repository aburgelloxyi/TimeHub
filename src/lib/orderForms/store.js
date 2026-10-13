// Where loaded order forms are kept: once, for all the PMs, behind the Worker.
//
// Order data must not sit in a table the browser can read: those are readable
// with the public key. /api/orders checks who is asking and uses a table
// nothing else can reach (see handleOrders in worker/index.js). This module is
// the only thing that knows that; the screens call listFiles, saveFile,
// saveDecisions, saveSeen and removeFile, so moving the data somewhere else is
// a change to this file.
//
// This browser's IndexedDB keeps a copy of each film as it was last seen here.
// That copy is what "changed since you last looked" is worked out against, so
// those markers are each person's own, whoever pressed Refresh. It is also
// what the page shows if the shared copy can't be reached.

import { fileChanges } from "./status";

const DB_NAME = "xyi-order-forms";
const DB_VERSION = 1;
const FILES = "files";
const API = "/api/orders";

// ── This browser's copies ─────────────────────────────────────────────────────

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(FILES)) req.result.createObjectStore(FILES, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, work) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(FILES, mode);
      const req = work(tx.objectStore(FILES));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Every local helper fails soft: without IndexedDB (private mode, quota) the
// shared copy still works, and only the change markers are lost.
const localAll = () => run("readonly", (store) => store.getAll()).then((files) => files || []).catch(() => []);
const localPut = (file) => run("readwrite", (store) => store.put(file)).then(() => true).catch(() => false);
const localDelete = (id) => run("readwrite", (store) => store.delete(id)).catch(() => {});

// ── Pure ──────────────────────────────────────────────────────────────────────

const slug = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");

// A film's one name in the shared store: the same for everyone who loads it,
// so a second load replaces the first instead of sitting beside it. It is also
// the file's id, and goes in the page's address.
export function fileKey(file) {
  return file.source?.clientId
    ? `${file.source.clientId}-${slug(file.source.filmKey)}`
    : `file-${slug(String(file.name || "").replace(/\.xlsx$/i, ""))}`;
}

// What is shared: everything but this person's change markers, and what this
// browser notes for itself (a film not shared yet, and which revision of the
// shared copy it holds).
export const shareable = ({ changes: _mine, unshared: _note, rev: _held, ...file }) => file;

const newestFirst = (a, b) => String(b.loadedAt).localeCompare(String(a.loadedAt));

// Brings this browser's copies in line with the shared ones.
//   files     what the page shows: each shared film, with this person's
//             unseen changes, which grow when the film has been read again
//             since this browser last saw it
//   seed      films to share now: ones this browser loaded before there was
//             a shared store (once: they are given their shared id here), and
//             ones it loaded while the store couldn't be reached (`unshared`)
//   forget    local ids to drop: ones removed by someone, and the old ids of
//             seeded ones
export function reconcile(local, remote) {
  const mine = new Map();
  const seed = [];
  const forget = [];
  const shared = new Map(remote.map((f) => [f.id, f]));
  for (const file of local) {
    const key = fileKey(file);
    if (file.id === key) {
      if (shared.has(key)) mine.set(key, file);
      else if (file.unshared) seed.push(shareable(file));
      else forget.push(file.id);
      continue;
    }
    forget.push(file.id);
    if (!shared.has(key) && !seed.some((f) => f.id === key)) seed.push({ ...shareable(file), id: key });
  }
  const files = [...remote, ...seed].map((file) => {
    const seen = mine.get(file.id);
    if (!seen) return file;
    const changes = seen.loadedAt === file.loadedAt ? seen.changes : fileChanges(seen, file);
    return changes && Object.keys(changes).length ? { ...file, changes } : file;
  });
  return { files: files.sort(newestFirst), seed, forget };
}

// ── The shared store ──────────────────────────────────────────────────────────

// "shared" once the last call reached it, "local" when it couldn't be and the
// page is on this browser's copies. The page says so when it is "local".
let reach = "shared";
export const storeReach = () => reach;

async function api(path, init) {
  const res = await fetch(`${API}${path}`, init ? { ...init, headers: { "Content-Type": "application/json" } } : undefined);
  if (!res.ok) throw new Error(`orders ${res.status}`);
  return res.json();
}

const at = (id) => `/${encodeURIComponent(id)}`;

// The shared list says which films exist and which revision each is at. A
// film is downloaded only when this browser doesn't hold that revision, so
// coming back to the tab costs one small request unless something changed.
export async function listFiles() {
  const local = await localAll();
  const held = new Map(local.map((f) => [f.id, f]));
  const revs = new Map();
  let remote;
  try {
    const listed = await api("");
    remote = await Promise.all(listed.map(async ({ id, rev }) => {
      revs.set(id, rev);
      const mine = held.get(id);
      return mine && mine.rev === rev ? shareable(mine) : (await api(at(id))).file;
    }));
    reach = "shared";
  } catch {
    reach = "local";
    return local.sort(newestFirst);
  }
  const { files, seed, forget } = reconcile(local, remote);
  await Promise.all(seed.map(async (file) => {
    const saved = await api(at(file.id), { method: "PUT", body: JSON.stringify(file) }).catch(() => null);
    if (saved?.rev) revs.set(file.id, saved.rev);
  }));
  const kept = files.map((file) => ({ ...file, rev: revs.get(file.id) }));
  await Promise.all(forget.map(localDelete));
  await Promise.all(kept.map(localPut));
  return kept;
}

// A film as this browser keeps it once shared: its change markers stay, the
// "not shared yet" note goes.
const shareableKeepingMine = ({ unshared: _note, ...file }) => file;

// A film read from Google or dropped in. false when it couldn't be shared; it
// is still kept in this browser.
export async function saveFile(file) {
  try {
    const { rev } = await api(at(file.id), { method: "PUT", body: JSON.stringify(shareable(file)) });
    reach = "shared";
    await localPut({ ...shareableKeepingMine(file), rev });
    return true;
  } catch {
    reach = "local";
    // Marked, so the next time the store is reached it is shared from here
    // and not mistaken for a film someone has removed.
    await localPut({ ...file, unshared: true });
    return false;
  }
}

// Rows set aside, tasks matched by hand and tasks created from here, saved on
// their own: a decision made from an older copy of a film mustn't put that
// older copy back.
export async function saveDecisions(file) {
  try {
    const { rev } = await api(at(file.id), { method: "PATCH", body: JSON.stringify({ ignored: file.ignored || {}, links: file.links || {}, briefed: file.briefed || {} }) });
    await localPut({ ...file, rev });
    return true;
  } catch {
    await localPut(file);
    return false;
  }
}

// This person's change markers, which stay in this browser.
export const saveSeen = (file) => localPut(file);

export async function removeFile(id) {
  await localDelete(id);
  try {
    await api(at(id), { method: "DELETE" });
  } catch {
    // It is gone from this browser; the shared copy is still there to remove.
  }
}
