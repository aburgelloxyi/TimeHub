// Bulk Campaign ↔ Wrike write layer.
//
// Every call goes through the Worker proxy at /api/wrike/* (worker/index.js),
// which attaches the member's OAuth token — the browser never sees it. The
// proxy is a generic pass-through for any method, so GET/PUT/POST to any Wrike
// path work here without worker changes.
//
// Design rule for this module: **plan** functions are read-only (safe to run
// any time — they only GET) and return a preview of exactly what an **apply**
// would change; **apply** functions are the only ones that write. The UI always
// runs plan → shows the preview → and writes only on an explicit confirm. This
// is what makes the feature safe to ship without being able to test the live
// Wrike auth locally: nothing mutates Wrike until a human approves the plan.

const WRIKE = "/api/wrike";

// ── Low-level GET helpers ─────────────────────────────────────────────────────

async function wrikeGet(path) {
  const res = await fetch(`${WRIKE}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Wrike GET ${path} failed (${res.status})${body ? `: ${body}` : ""}`);
  }
  const json = await res.json();
  return json.data || [];
}

// GET that follows Wrike's nextPageToken pagination and concatenates all pages.
async function wrikeGetAll(path) {
  let out = [];
  let token = null;
  do {
    const sep = path.includes("?") ? "&" : "?";
    const url = token ? `${WRIKE}${path}${sep}nextPageToken=${token}` : `${WRIKE}${path}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Wrike GET ${path} failed (${res.status})${body ? `: ${body}` : ""}`);
    }
    const json = await res.json();
    out = out.concat(json.data || []);
    token = json.nextPageToken || null;
  } while (token);
  return out;
}

// ── Custom-field discovery ────────────────────────────────────────────────────

// Find the "Job Number" custom field by title (we don't hardcode its ID — it's
// discovered at runtime so this keeps working across workspaces / if the field
// is recreated). Matching is progressively looser so a field literally called
// "Job Number" wins, but "Job No." / "Job Code" still resolve.
export async function discoverJobNumberField() {
  const fields = await wrikeGet("/customfields");
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const exact = fields.find((f) => norm(f.title) === "jobnumber");
  const contains = fields.find((f) => norm(f.title).includes("jobnumber"));
  const loose = fields.find(
    (f) => /job/.test(norm(f.title)) && /(number|no|num|code)/.test(norm(f.title))
  );
  const field = exact || contains || loose || null;
  return field ? { id: field.id, title: field.title } : null;
}

// ── Folder / project discovery ────────────────────────────────────────────────

// Pull the whole flat folder list once (id, title, childIds) so callers can walk
// the tree locally without N round-trips.
//
// Recycle-bin filtering: the FolderTree default mode returns the workspace AND
// the recycle bin (its root + every recycled descendant) in one flat list — so
// a *deleted* copy of a film shows up here indistinguishable from the live one
// unless we filter it out. Wrike tags every tree node with a `scope`: workspace
// nodes are WsRoot/WsFolder, recycled ones are RbRoot/RbFolder/RbTask. `scope`
// comes back on its own (like `project` does on the by-id endpoint) — it just
// can't be named in `fields=` (that 400s "'scope' not allowed"; only childIds is
// requestable there). We drop every Rb* node at this single source so no
// downstream matcher (findFilmLocation, findStudioFolder, template lookup,
// planFilmSync) can ever resolve to something sitting in the recycle bin.
// Scope-less rows are kept, so if Wrike ever stops returning scope we degrade to
// the old behaviour rather than nuking the whole tree.
export async function fetchAllFolders() {
  const FF = encodeURIComponent("[childIds]");
  const rows = await wrikeGetAll(`/folders?fields=${FF}`);
  const byId = {};
  rows.forEach((f) => {
    if (/^Rb/i.test(f.scope || "")) return; // skip Recycle Bin root + contents
    byId[f.id] = {
      id: f.id,
      title: f.title || "",
      childIds: f.childIds || [],
    };
  });
  return byId;
}

// Which of the given folder ids are Wrike Projects (item type "Project"). The
// by-id folder endpoint returns full Folder objects, which carry `project` by
// DEFAULT — like `scope`, it's not requestable via fields= (that 400s
// "'project' not allowed"), it just comes back on its own. Batched into chunks
// of 100 (Wrike's per-request id cap). Returns [{ id, title }] for projects only.
export async function fetchFolderProjects(folderIds) {
  const ids = (folderIds || []).filter(Boolean);
  if (!ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const rows = await wrikeGet(`/folders/${batch.join(",")}`);
    rows.forEach((f) => { if (f.project) out.push({ id: f.id, title: f.title || "" }); });
  }
  return out;
}

const norm = (s) => (s || "").toUpperCase().replace(/[_\s]+/g, " ").trim();

// Locate a studio's root folder (e.g. "Paramount") — a sibling of Universal /
// SONY inside the STUDIO space's root, per the workspace layout. We match a
// folder whose title is exactly the studio name (normalised), preferring one
// that actually contains child projects so we don't pick an empty namesake.
export function findStudioFolder(byId, studioName) {
  const wanted = norm(studioName);
  const matches = Object.values(byId).filter((f) => norm(f.title) === wanted);
  if (!matches.length) return null;
  // Prefer the candidate with the most children (the populated studio folder).
  matches.sort((a, b) => (b.childIds?.length || 0) - (a.childIds?.length || 0));
  return matches[0];
}

// Every folder id in the subtree rooted at rootId (inclusive). Used by the
// template-write guard: we never write into any of these ids.
export function collectSubtreeIds(byId, rootId, seen = new Set()) {
  if (!rootId || seen.has(rootId)) return seen;
  seen.add(rootId);
  const node = byId[rootId];
  (node?.childIds || []).forEach((c) => collectSubtreeIds(byId, c, seen));
  return seen;
}

// Count JOBNUMBER folders anywhere beneath a node — used to score master-template
// candidates (the real, populated template has the most).
function countJobNumberFolders(byId, rootId, seen = new Set()) {
  if (seen.has(rootId)) return 0;
  seen.add(rootId);
  const node = byId[rootId];
  if (!node) return 0;
  let n = /JOBNUMBER/i.test(node.title) ? 1 : 0;
  (node.childIds || []).forEach((c) => { n += countJobNumberFolders(byId, c, seen); });
  return n;
}

// Locate a studio's master-template root (e.g. "_Paramount_MASTER_TEMPLATES").
// Same fuzzy match the fetch uses: title contains the studio AND "MASTER
// TEMPLATE"; among candidates pick the one with the most JOBNUMBER folders,
// penalising obvious duplicates (copy/archive), so we copy the real template.
export function findMasterTemplateFolder(byId, studioName) {
  const wanted = norm(studioName);
  const candidates = Object.values(byId).filter((f) => {
    const t = norm(f.title);
    return t.includes(wanted) && t.includes("MASTER TEMPLATE");
  });
  if (!candidates.length) return null;
  let best = null;
  for (const c of candidates) {
    const jobCount = countJobNumberFolders(byId, c.id);
    const isDupe = /\b(COPY|ARCHIVE|ARCHIVED|OLD|BACKUP|BAK)\b/i.test(c.title || "");
    const score = jobCount - (isDupe ? 1e6 : 0) - (c.title || "").length * 0.001;
    if (!best || score > best.score) best = { folder: c, jobCount, score };
  }
  return best ? { id: best.folder.id, title: best.folder.title, jobCount: best.jobCount } : null;
}

// Which studio does this film live under? Films sit one level inside a studio
// folder, so the film's parent IS its studio. Resolved from Wrike rather than
// stored: the films table only keeps a title, and deriving it keeps working for
// films added long before any of this existed.
//
// Matched with norm(), not raw equality — Wrike names projects with underscores
// ("Fake_Film_Tryout") while the films table stores spaces ("Fake Film Tryout").
//
// The subtle part: a film pushed before job folders were renamed in place has a
// folder named after the film INSIDE the film project, so the title matches
// twice — the project under Paramount, and the wrapper under that project.
// Picking the wrapper makes its parent (the project) look like the studio, and
// we'd go hunting for a "Fake_Film_Tryout" master template. So prefer the match
// whose parent is NOT itself the same film: the outermost one, sitting in its
// real studio folder.
export function findFilmLocation(byId, filmTitle) {
  if (!(filmTitle || "").trim()) return null;

  // childIds is the only link Wrike gives us, so invert it to walk upwards.
  const parentOf = {};
  Object.values(byId).forEach((f) =>
    (f.childIds || []).forEach((c) => { if (!parentOf[c]) parentOf[c] = f.id; })
  );

  const isSameFilm = (t) => norm(t) === norm(filmTitle);
  const matches = Object.values(byId).filter((f) => isSameFilm(f.title));
  const film =
    matches.find((f) => {
      const p = byId[parentOf[f.id]];
      return p && !isSameFilm(p.title);
    }) ||
    matches.find((f) => parentOf[f.id]) ||
    matches[0];
  if (!film) return null;

  const studioFolder = byId[parentOf[film.id]] || null;
  return {
    filmProject: { id: film.id, title: film.title },
    studioFolder: studioFolder ? { id: studioFolder.id, title: studioFolder.title } : null,
    studio: studioFolder ? studioFolder.title : null,
  };
}

// Build a display tree of a film's OWN Wrike subtree — NOT the studio template.
// This is the truthful view: an old campaign's folders have already been renamed
// in place (JOBNUMBER_French_Canada_Assets → XY025623_French_Canada_Launch) and
// have drifted from the template's slot set entirely, so the template can't be
// reconciled against them — only the film itself tells you what exists.
//
// Every job-slot folder is tagged from its LIVE name, which is the source of
// truth for allocation: a title starting "XY#####_" already carries a real job
// number (allocated); one still "JOBNUMBER_" is a genuine pending slot. This is
// what stops an already-numbered film from reading as "0 activated" and inviting
// a duplicate re-number.
//
// Returns { filmProject, tree, hasSlots } — hasSlots:false means the film has no
// job-slot folders yet (never pushed), so the caller should fall back to the
// studio template to show what COULD be created. null means the film project
// wasn't found in Wrike at all.
export function buildFilmView(byId, filmTitle) {
  const loc = findFilmLocation(byId, filmTitle);
  if (!loc?.filmProject) return null;

  let slotCount = 0;
  const codeOf = (t) => (String(t).match(/^XY\d+/i) || [null])[0];
  const build = (id, seen = new Set()) => {
    if (seen.has(id)) return null;
    seen.add(id);
    const node = byId[id];
    if (!node) return null;
    const out = { id, label: node.title || "" };
    if (/^(JOBNUMBER|XY\d+)_/i.test(node.title || "")) {
      const code = codeOf(node.title);
      out.jobNumber = true;
      out.allocated = !!code;
      out.code = code;
      out.description = slotSuffix(node.title).replace(/_/g, " ").trim() || "General";
      slotCount += 1;
    }
    const children = (node.childIds || []).map((c) => build(c, seen)).filter(Boolean);
    if (children.length) out.children = children;
    return out;
  };

  return { filmProject: loc.filmProject, tree: build(loc.filmProject.id), hasSlots: slotCount > 0 };
}

// ── Req 6: Film DB sync ───────────────────────────────────────────────────────

// Read-only plan: which Wrike film projects are missing from the films table.
// `existingTitles` is the set already in Supabase. We never delete films that
// exist locally but not in Wrike — this is additive only, so a hand-added film
// is never clobbered by the sync.
export async function planFilmSync(studioName, existingTitles) {
  const byId = await fetchAllFolders();
  const studioFolder = findStudioFolder(byId, studioName);
  if (!studioFolder) {
    return { error: `No “${studioName}” folder found in Wrike.`, studioFolder: null, toAdd: [] };
  }
  // Wrike project folders are named with underscores (Angry_Birds_3_Movie) —
  // present them as clean, spaced film titles.
  const clean = (t) => (t || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const have = new Set([...existingTitles].map((t) => clean(t).toLowerCase()));
  const projects = await fetchFolderProjects(studioFolder.childIds);
  const toAdd = projects
    .map((p) => clean(p.title))
    .filter((t) => t && !have.has(t.toLowerCase()))
    // de-dupe titles that differ only by case/spacing within Wrike itself
    .filter((t, i, arr) => arr.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i)
    .sort((a, b) => a.localeCompare(b));
  return {
    error: null,
    studioFolder: { id: studioFolder.id, title: studioFolder.title },
    projectCount: projects.length,
    toAdd,
  };
}

// ── Tasks beneath a folder + custom-field writes (reqs 1 & 2) ─────────────────

// Every task AND subtask anywhere beneath a folder. Wrike's folder-tasks
// endpoint recurses into descendant folders by default; subTasks=true pulls the
// subtasks in too. We only request customFields (the field we compare/write) —
// other optional fields (subTaskIds etc.) are deliberately omitted because
// Wrike 400s when some of them are passed explicitly on list queries.
export async function fetchTasksUnderFolder(folderId) {
  const FF = encodeURIComponent("[customFields]");
  return wrikeGetAll(`/folders/${folderId}/tasks?fields=${FF}&subTasks=true&pageSize=1000`);
}

// Write the Job Number custom field on a single task. Wrike takes params in the
// query string (like every other call this app makes), with the customFields
// array JSON-encoded.
async function putTaskJobNumber(taskId, fieldId, value) {
  const cf = encodeURIComponent(JSON.stringify([{ id: fieldId, value: String(value) }]));
  const res = await fetch(`${WRIKE}/tasks/${taskId}?customFields=${cf}`, { method: "PUT" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`set field on ${taskId} (${res.status})${body ? `: ${body}` : ""}`);
  }
}

// Read-only plan for req 1/2: which tasks under `folderId` don't yet carry
// `jobNumber` in the field. Splitting already-set vs needs-set is what makes the
// same call serve both the first propagation (req 1) and the later top-up of
// newly-added items (req 2) — re-running only ever touches what's missing.
export async function planPropagate(folderId, fieldId, jobNumber) {
  const tasks = await fetchTasksUnderFolder(folderId);
  const willSet = [];
  let alreadySet = 0;
  for (const t of tasks) {
    const cur = (t.customFields || []).find((c) => c.id === fieldId)?.value || "";
    if (cur === jobNumber) alreadySet += 1;
    else willSet.push({ id: t.id, title: t.title, current: cur });
  }
  return { total: tasks.length, alreadySet, willSet };
}

// Apply the field to every task in `willSet`. Sequential (Wrike rate-limits
// bursts), collecting per-task failures rather than aborting on the first —
// callers surface the count so a couple of permission failures don't hide the
// dozens that succeeded. onProgress(done, total) drives the progress bar.
export async function applyPropagate(willSet, fieldId, jobNumber, onProgress) {
  const ok = [];
  const failed = [];
  for (let i = 0; i < willSet.length; i++) {
    try {
      await putTaskJobNumber(willSet[i].id, fieldId, jobNumber);
      ok.push(willSet[i].id);
    } catch (e) {
      failed.push({ id: willSet[i].id, title: willSet[i].title, error: e.message });
    }
    onProgress?.(i + 1, willSet.length);
  }
  return { ok, failed };
}

// Set the Job Number custom field on a single FOLDER. Folders take customFields
// exactly like tasks (PUT with the JSON-encoded array) — renaming only stamps
// the title, so this is what actually fills the folder's own "Job Number" field.
export async function setFolderJobNumber(folderId, fieldId, value) {
  const cf = encodeURIComponent(JSON.stringify([{ id: fieldId, value: String(value) }]));
  const res = await fetch(`${WRIKE}/folders/${folderId}?customFields=${cf}`, { method: "PUT" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`set field on folder ${folderId} (${res.status})${body ? `: ${body}` : ""}`);
  }
}

// Turn on Wrike-native field cascading for one field on a folder: Wrike then
// pushes the folder's CURRENT value down to every subitem — nested folders AND
// tasks, current AND any created later. This is exactly the UI's "Apply value to
// all current and future subitems" button, so we set the folder value first
// (setFolderJobNumber) and then call this.
//
// Contract verified live against the account (the published reference is wrong):
// the param is a SINGULAR `fieldId` plain-string query param, NOT a `fieldIds`
// array — Wrike 400s "Parameter 'fieldIds' is not allowed" otherwise, and 200s
// with { kind: "cascadingFieldSettings", data:[{ fieldId, … }] } on this shape.
export async function triggerFieldCascade(folderId, fieldId) {
  const res = await fetch(`${WRIKE}/folders/${folderId}/cascading_field_settings?fieldId=${encodeURIComponent(fieldId)}`, { method: "POST" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`cascade field on folder ${folderId} (${res.status})${body ? `: ${body}` : ""}`);
  }
}

// ── Req 5: duplicate the whole studio template into Wrike ─────────────────────

// Copy a folder (and its entire subtree — folders, tasks, subtasks) to a new
// parent. copyDescriptions/copyCustomFields keep the template's content;
// copyResponsibles is off so a duplicated template isn't auto-assigned to
// whoever is on the template. Returns the new root folder's id.
export async function copyTemplateFolder({ sourceFolderId, parentId, title }) {
  // Only the documented, accepted copy_folder params — Wrike 400s on anything
  // else (copyAttachments / copyCustomStatuses are NOT valid params). We keep
  // descriptions and custom-field VALUES, and deliberately don't copy
  // responsibles so a duplicated template isn't auto-assigned to the template's
  // people. No rescheduleMode/Date (must be paired; we're not shifting dates).
  const params = new URLSearchParams({
    parent: parentId,
    title,
    copyDescriptions: "true",
    copyCustomFields: "true",
    copyResponsibles: "false",
    // entryLimit is hard-capped at 250 by Wrike (values >250 are rejected). A
    // tree bigger than this 403s "affected entry limit exceeded" — copyTemplateDeep
    // catches that and splits the copy so the whole template still comes across.
    entryLimit: "250",
  });
  const res = await fetch(`${WRIKE}/copy_folder/${sourceFolderId}?${params}`, { method: "POST" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`copy_folder (${res.status})${body ? `: ${body}` : ""}`);
  }
  const json = await res.json();
  return json.data?.[0]?.id || null;
}

// Create an empty folder under a parent. Used by the split copier to rebuild a
// too-big folder's shell before copying its children in separately.
async function createFolder(parentId, title) {
  const res = await fetch(`${WRIKE}/folders/${parentId}/folders?title=${encodeURIComponent(title)}`, { method: "POST" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`create folder (${res.status})${body ? `: ${body}` : ""}`);
  }
  const json = await res.json();
  return json.data?.[0]?.id || null;
}

// Count tasks sitting DIRECTLY in a folder (not in its subfolders). When we have
// to split a too-big folder we rebuild it empty and copy its child folders in —
// which carries every subfolder's tasks, but not tasks pinned to the container
// folder itself. We surface those so nothing is ever lost silently.
async function fetchDirectTaskCount(folderId) {
  const rows = await wrikeGet(`/folders/${folderId}/tasks?descendants=false`);
  return rows.length;
}

// Copy a folder subtree of ANY size into `parentId`, working around Wrike's
// 250-entry copy cap. Tries a whole-subtree copy first (fast, fully faithful);
// only when that hits the entry limit does it rebuild the folder shell and
// recurse into each child. `report` accumulates the new root id, how many copy
// calls ran, and any container folders whose direct tasks couldn't be carried.
export async function copyTemplateDeep({ byId, sourceId, parentId, title, onProgress, report }) {
  report = report || { rootId: null, copies: 0, droppedTaskFolders: [] };
  onProgress?.(`Copying “${title}”…`);
  try {
    const id = await copyTemplateFolder({ sourceFolderId: sourceId, parentId, title });
    report.copies += 1;
    if (!report.rootId) report.rootId = id;
    return report;
  } catch (e) {
    // Only the size limit is recoverable by splitting — anything else is a real
    // failure and must propagate.
    if (!/entry limit/i.test(e.message)) throw e;
  }
  // Too big for one copy — rebuild this folder empty, then copy its children.
  const newId = await createFolder(parentId, title);
  if (!newId) throw new Error(`Could not create folder “${title}”.`);
  if (!report.rootId) report.rootId = newId;
  const directCount = await fetchDirectTaskCount(sourceId);
  if (directCount > 0) report.droppedTaskFolders.push({ title, count: directCount });
  const node = byId[sourceId];
  for (const childId of node?.childIds || []) {
    const child = byId[childId];
    if (!child) continue;
    await copyTemplateDeep({ byId, sourceId: childId, parentId: newId, title: child.title, onProgress, report });
  }
  return report;
}

// Strip a JOBNUMBER_ or XY#####_ prefix off a folder title, leaving the slot's
// stable suffix (e.g. "French_Canada_Assets") that identifies it across renames.
export function slotSuffix(title) {
  return (title || "").replace(/^(JOBNUMBER|XY\d+)_?/i, "");
}

// Map every job-slot folder under a root by its suffix. Rename-resilient: it
// matches a folder whether it's still "JOBNUMBER_…" or already renamed to
// "XY#####_…", so re-pushing/reconciling finds the same folder every time.
export async function mapSlotFoldersUnder(rootId) {
  const byId = await fetchAllFolders();
  const out = {};
  const walk = (id) => {
    const node = byId[id];
    if (!node) return;
    if (/^(JOBNUMBER|XY\d+)_/i.test(node.title)) {
      out[slotSuffix(node.title)] = { id: node.id, title: node.title };
    }
    (node.childIds || []).forEach(walk);
  };
  walk(rootId);
  return out;
}

// Rename a folder (used to stamp the job code onto a JOBNUMBER_ slot folder).
export async function renameFolder(folderId, title) {
  const res = await fetch(`${WRIKE}/folders/${folderId}?title=${encodeURIComponent(title)}`, { method: "PUT" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`rename folder (${res.status})${body ? `: ${body}` : ""}`);
  }
}

// After a copy, re-read the new tree and map each JOBNUMBER_ folder title to its
// new folder id, so propagation (req 1) can target the right subtree per slot.
export async function mapJobNumberFoldersUnder(rootFolderId) {
  const byId = await fetchAllFolders();
  const out = {};
  const walk = (id) => {
    const node = byId[id];
    if (!node) return;
    if (/JOBNUMBER/i.test(node.title)) out[node.title] = node.id;
    (node.childIds || []).forEach(walk);
  };
  walk(rootFolderId);
  return out;
}
