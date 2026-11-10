// Jobs setup logic with no UI: the job types a studio's master template
// offers, the jobs a film already has in the Job Book and in Wrike, and
// numbering a batch of new ones.
import { findMasterTemplateFolder, slotSuffix } from "./wrikeCampaign";

const pretty = (s) => String(s || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
const codeIn = (s) => (String(s || "").match(/XY\d{5,6}/i) || [null])[0]?.toUpperCase() || null;

// Print or Digital, read off the folders a job type sits under, then its own
// name. "" when neither says.
export function mediumOf(path, label) {
  const words = [...(path || []), label || ""].map((p) => pretty(p).toLowerCase());
  for (const w of words) {
    if (/\bprint\b/.test(w)) return "Print";
    if (/\bdigital\b/.test(w)) return "Digital";
  }
  return "";
}

// Every "JOBNUMBER_…" folder in a studio's master template, as a job type:
// { id, label, description, group, medium }. `label` is the folder's own name
// (what a job is filed against, and what Push looks for), `group` the folders
// above it. null when the studio has no template in Wrike.
export function templateJobTypes(byId, studioName) {
  const root = findMasterTemplateFolder(byId, studioName);
  if (!root) return null;
  const types = [];
  const seen = new Set();
  const walk = (id, path) => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = byId[id];
    if (!node) return;
    const title = node.title || "";
    if (/JOBNUMBER/i.test(title)) {
      types.push({
        id: node.id,
        label: title,
        description: pretty(slotSuffix(title)) || "General",
        group: path.map(pretty).join(" › ") || "General",
        medium: mediumOf(path, title),
      });
    }
    (node.childIds || []).forEach((c) => walk(c, id === root.id ? [] : [...path, title]));
  };
  walk(root.id, []);
  return { root, types };
}

// The jobs a film has, from both sides, one row per job code, newest first.
// `filmTree` is buildFilmView's tree, or null when the film isn't in Wrike (the
// folder checks are then skipped rather than failed). States:
//   in-wrike       filed and its Wrike folder carries the code
//   not-sent       made from a job type here, no Wrike folder yet
//   book-only      in the Job Book, never tied to a job type
//   folder-renamed its Wrike folder no longer starts with the code
//   folder-gone    the Wrike folder it was given is gone
//   wrike-only     a Wrike folder carries a code the Job Book lacks
export function filmJobRows(bookJobs, filmTree) {
  const liveByCode = {};
  const liveById = {};
  const walk = (n) => {
    if (!n) return;
    if (n.id) liveById[n.id] = n;
    const code = codeIn(n.code);
    if (code && !liveByCode[code]) liveByCode[code] = n;
    (n.children || []).forEach(walk);
  };
  walk(filmTree);

  const rows = [];
  const seen = new Set();
  (bookJobs || []).forEach((job) => {
    const code = codeIn(job.job_number);
    if (code) seen.add(code);
    let state, liveLabel;
    if (filmTree && job.wrike_folder_id) {
      const folder = liveById[job.wrike_folder_id];
      if (!folder) state = "folder-gone";
      else if (code && !new RegExp(`^${code}_`, "i").test(folder.label || "")) { state = "folder-renamed"; liveLabel = folder.label; }
      else state = "in-wrike";
    } else if (job.wrike_folder_id || (code && liveByCode[code])) state = "in-wrike";
    else state = job.template_slot ? "not-sent" : "book-only";
    rows.push({ code, description: job.project_description || "", state, liveLabel, job });
  });
  Object.entries(liveByCode).forEach(([code, n]) => {
    if (!seen.has(code)) rows.push({ code, description: n.description || pretty(slotSuffix(n.label)), state: "wrike-only", job: null });
  });
  return rows.sort((a, b) => String(b.code || "").localeCompare(String(a.code || "")));
}

// How many jobs of each type the film has: slot suffix -> count. A job made
// here counts by the type it was made from, a Wrike folder by its name.
export function countByType(rows, filmTree) {
  const counts = {};
  const add = (label) => { const k = slotSuffix(label || ""); if (k) counts[k] = (counts[k] || 0) + 1; };
  const counted = new Set();
  (rows || []).forEach((r) => { if (r.job?.template_slot) { add(r.job.template_slot); if (r.code) counted.add(r.code); } });
  const walk = (n) => {
    if (!n) return;
    const code = codeIn(n.code);
    if (code && !counted.has(code)) { counted.add(code); add(n.label); }
    (n.children || []).forEach(walk);
  };
  walk(filmTree);
  return counts;
}

// The highest XY number in a list of labels, codes or folder names; 0 if none.
export function highestCode(strings) {
  let max = 0;
  (strings || []).forEach((s) => {
    const m = String(s || "").match(/XY(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return max;
}

export const codeFor = (n) => `XY${String(n).padStart(6, "0")}`;

// The Wrike project a film's jobs go to. Only the project the page already
// found, or one with exactly the film's name, is chosen for the PM: a near
// match ("Shrek" for "Shrek 5") copies a template into the wrong film.
export function pickProject(projects, filmTitle, preferredId) {
  const key = (s) => pretty(s).toLowerCase();
  const list = projects || [];
  return list.find((p) => preferredId && p.id === preferredId)
    || list.find((p) => key(p.title) === key(filmTitle))
    || null;
}
