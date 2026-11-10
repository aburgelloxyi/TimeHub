// Job Book logic with no UI: reading and rebuilding a job's label, and the
// book's filters and sort.
import { tokenMatch } from "../utils/search";
import { studioNameOf } from "./studios";

export const PRINT_DIGITAL = ["Digital", "Print", "Both"];

// The code keeps any suffix a delivery package adds ("XY025953_LUG_D6").
const CODE = /XY\d{5,6}(?:_[A-Za-z0-9]+)*/i;

// "Film : CODE, Description" into its parts. `code` is null for a free-text
// job with no XY code. The film is cut at the LAST " : " before the code, since
// a title can hold a colon of its own ("Jackass: Best and Last : XY…").
export function parseJobLabel(label) {
  const s = String(label || "").trim();
  const m = s.match(CODE);
  if (!m) return { film: "", code: null, description: "" };
  const before = s.slice(0, m.index);
  const colon = before.lastIndexOf(" : ");
  return {
    film: (colon >= 0 ? before.slice(0, colon) : before.replace(/[\s:]+$/, "")).trim(),
    code: m[0].replace(/^xy/i, "XY"),
    description: s.slice(m.index + m[0].length).replace(/^[\s,–—-]+/, "").trim(),
  };
}

export function buildJobLabel({ film, code, description }) {
  const f = String(film || "").trim();
  const d = String(description || "").trim();
  return (f ? `${f} : ${code}` : code) + (d ? `, ${d}` : "");
}

// The label a job carries once `patch` is applied. Only the parts named in the
// patch change; the rest stay as the label already has them, because a row's
// film or description column can be empty or wrong while its label is right.
// A free-text job keeps its label.
export function relabelJob(job, patch = {}) {
  const cur = parseJobLabel(job.job_number);
  if (!cur.code) return job.job_number;
  return buildJobLabel({
    film: "film_title" in patch ? patch.film_title : cur.film,
    code: cur.code,
    description: "project_description" in patch ? patch.project_description : cur.description,
  });
}

// What a PM still has to fill in before a job is usable elsewhere.
export function missingInfo(job) {
  const { film, code } = parseJobLabel(job.job_number);
  const out = [];
  if (!String(job.client || "").trim()) out.push("client");
  if (!job.start_date) out.push("start date");
  if (code && !String(job.film_title || "").trim() && !film) out.push("film");
  return out;
}

// Worked out once per load: the studio match builds a regex per keyword, which
// is too slow to repeat for every row on every keystroke.
export const annotateJob = (job) => ({
  ...job,
  _code: parseJobLabel(job.job_number).code,
  _studio: studioNameOf(job.client) || "Other",
  _missing: missingInfo(job),
});

// The month only narrows a plain browse. A search looks across every month, and
// the two filters that are mostly about undated jobs can't sit inside one.
export const monthApplies = (f) =>
  !!f.month && !String(f.search || "").trim() && !f.undated && !f.attention;

export function filterJobs(jobs, f) {
  const byMonth = monthApplies(f);
  return jobs.filter((j) => {
    if (!tokenMatch(f.search, j.job_number, j.client, j.film_title, j.project_description, j.job_work_category)) return false;
    if (f.undated && j.start_date) return false;
    if (byMonth && String(j.start_date || "").slice(0, 7) !== f.month) return false;
    if (f.status && (j.status || "Inactive") !== f.status) return false;
    if (f.studio && (j._studio ?? (studioNameOf(j.client) || "Other")) !== f.studio) return false;
    if (f.pd && (j.print_digital || "") !== f.pd) return false;
    if (f.attention && !(j._missing ?? missingInfo(j)).length) return false;
    return true;
  });
}

const STATUS_ORDER = ["Inactive", "Active", "Closed"];
const text = (field) => (j) => String(j[field] || "").toLowerCase();
const SORT_VALUE = {
  job_number: (j) => (j._code ?? parseJobLabel(j.job_number).code) || String(j.job_number || "").toLowerCase(),
  date: (j) => j.start_date || "",
  client: text("client"),
  office: text("office"),
  pd: text("print_digital"),
  film: text("film_title"),
  project: text("project_description"),
  costs: (j) => Number(j.fixed_cost ?? j.estimated_cost ?? j.third_party_cost ?? NaN),
  ordered_by: text("ordered_by"),
  billed_to: text("billed_to"),
  status: (j) => STATUS_ORDER.indexOf(j.status || "Inactive"),
  done: (j) => (j.job_done ? 1 : 0),
};
export const isSortable = (key) => key in SORT_VALUE;

// Empty values go last whichever way the column runs, so sorting by date
// doesn't open on a page of undated jobs. Ties fall back to newest first.
export function sortJobs(jobs, key, dir = "desc") {
  const val = SORT_VALUE[key];
  if (!val) return jobs;
  const sign = dir === "asc" ? 1 : -1;
  const empty = (v) => v === "" || v == null || (typeof v === "number" && isNaN(v));
  return jobs.slice().sort((a, b) => {
    const x = val(a), y = val(b);
    if (empty(x) !== empty(y)) return empty(x) ? 1 : -1;
    if (x < y) return -sign;
    if (x > y) return sign;
    return (b.id || 0) - (a.id || 0);
  });
}
