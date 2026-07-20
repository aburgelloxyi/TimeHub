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

// Pull the whole flat folder list once (id, title, childIds, scope, project) so
// callers can walk the tree locally without N round-trips. `project` is present
// on folders that are Wrike Projects (item type "Project").
export async function fetchAllFolders() {
  // The flat /folders (FolderTree) list only accepts a small set of requestable
  // fields — `childIds` is valid, but `scope`/`project` are NOT and 400 the whole
  // call. Project-ness isn't available here; detect it with a targeted by-id
  // call (fetchFolderProjects) only where we actually need it.
  const FF = encodeURIComponent("[childIds]");
  const rows = await wrikeGetAll(`/folders?fields=${FF}`);
  const byId = {};
  rows.forEach((f) => {
    byId[f.id] = {
      id: f.id,
      title: f.title || "",
      childIds: f.childIds || [],
    };
  });
  return byId;
}

// Which of the given folder ids are Wrike Projects (item type "Project"). The
// by-id folder endpoint returns full Folder objects, which — unlike the flat
// tree — do accept `project` in fields. Batched into chunks of 100 (Wrike's
// per-request id cap). Returns [{ id, title }] for the project ones only.
export async function fetchFolderProjects(folderIds) {
  const ids = (folderIds || []).filter(Boolean);
  if (!ids.length) return [];
  const FF = encodeURIComponent("[project]");
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const rows = await wrikeGet(`/folders/${batch.join(",")}?fields=${FF}`);
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
  const have = new Set([...existingTitles].map((t) => t.trim().toLowerCase()));
  const projects = await fetchFolderProjects(studioFolder.childIds);
  const toAdd = projects
    .filter((p) => p.title.trim() && !have.has(p.title.trim().toLowerCase()))
    .map((p) => p.title.trim())
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

// ── Req 5: duplicate the whole studio template into Wrike ─────────────────────

// Copy a folder (and its entire subtree — folders, tasks, subtasks) to a new
// parent. copyDescriptions/copyCustomFields keep the template's content;
// copyResponsibles is off so a duplicated template isn't auto-assigned to
// whoever is on the template. Returns the new root folder's id.
export async function copyTemplateFolder({ sourceFolderId, parentId, title }) {
  // No rescheduleMode/rescheduleDate — they must be supplied together and we're
  // not shifting dates, just duplicating structure + content.
  const params = new URLSearchParams({
    parent: parentId,
    title,
    copyDescriptions: "true",
    copyCustomFields: "true",
    copyCustomStatuses: "true",
    copyResponsibles: "false",
    copyAttachments: "false",
  });
  const res = await fetch(`${WRIKE}/copy_folder/${sourceFolderId}?${params}`, { method: "POST" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`copy_folder (${res.status})${body ? `: ${body}` : ""}`);
  }
  const json = await res.json();
  return json.data?.[0]?.id || null;
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
