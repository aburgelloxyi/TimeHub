// Comparing the Job Book with what the Studio Scan found in Wrike. No UI and no
// network: given the scan's candidates and the book's rows, work out which jobs
// are new, which book rows disagree with Wrike and why, and which are spare
// copies. Wrike's folders are the source of truth; nothing here writes.
import { descriptionsAgree } from "./wrikeCampaign";
import { clientsAgree, studioNameOf } from "./studios";
import { isWorkingHours } from "./systemStatus";
import { bookFilmTitle } from "../utils/wrikeHelpers";

export const codeOf = (s) => {
  const m = (s || "").match(/XY\d{5,6}/i);
  return m ? m[0].toUpperCase() : (s || "").trim().toUpperCase();
};
// The film of a label: the part before " : ".
export const filmOf = (s) => ((s || "").includes(" : ") ? (s || "").split(" : ")[0] : "").trim();
// A bare year or a letterless token ("2026") is a folder, not a film.
export const isPseudoFilm = (film) => !film || /^\d{2,4}$/.test(film.trim()) || !/[a-z]/i.test(film);
// Nothing but the code: the stub a timesheet pull files the first time it meets
// a job, before anyone has filed it properly.
export const isBareCode = (s) => /^\s*XY\d{5,6}\s*$/i.test(s || "");
// Read off the label rather than the project_description column: a stub row
// never has the column filled, while the description sits in its label.
export const descOf = (s) => {
  const i = (s || "").indexOf(",");
  return i === -1 ? "" : s.slice(i + 1).trim();
};
// How complete a label is: "Film : CODE, Description" beats "Film : CODE"
// beats a bare stub. Picks the row a code is judged by when it has several.
const rowRank = (s) =>
  isBareCode(s) ? 0 : (s || "").includes(" : ") ? ((s || "").includes(",") ? 2 : 1) : 0;

// One code can own several book rows (a stub beside the filed row, or two
// spellings of one description). `byCode` is the most complete, `extras` the rest.
export function indexBook(rows) {
  const byCode = {};
  const extras = {};
  (rows || []).forEach((j) => {
    const code = codeOf(j.job_number);
    const prev = byCode[code];
    if (!prev) { byCode[code] = j; return; }
    const keep = rowRank(j.job_number) > rowRank(prev.job_number) ? j : prev;
    byCode[code] = keep;
    (extras[code] = extras[code] || []).push(keep === j ? prev : j);
  });
  return { byCode, extras };
}

const loose = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Why a book row disagrees with Wrike's folder for the same code, as a list of
// "film" | "label" | "description" | "duplicate" | "client". Empty when it agrees.
//   label       the folder name leaked into the code ("XY026089_SKY_VIP")
//   description the two describe different work; descriptionsAgree is loose on
//               purpose, and an empty one on either side counts as agreeing
//   duplicate   another row for this code already is what Wrike says
//   client      none, or another studio's
export function whyDifferent(cur, cand, extraRows = []) {
  if (!cur || !cand.filmTitle || isPseudoFilm(cand.filmTitle)) return [];
  const label = cur.job_number || "";
  const reasons = [];
  if (loose(filmOf(label) || cur.film_title) !== loose(cand.filmTitle)) reasons.push("film");
  if (!new RegExp(`(^|\\s:\\s)${cand.code}\\s*,`, "i").test(label)) reasons.push("label");
  if (!descriptionsAgree(descOf(label), cand.projectDescription)) reasons.push("description");
  if (label !== cand.jobNumber && extraRows.some((r) => (r.job_number || "") === cand.jobNumber)) reasons.push("duplicate");
  if (!clientsAgree(cur.client, cand.client)) reasons.push("client");
  return reasons;
}

// What a correction writes. A row whose only fault is its client has just the
// client set, so a description someone chose isn't swapped for the scan's.
export function correctionPatch(cur, cand) {
  const clientOnly = !clientsAgree(cur.client, cand.client) && (cur.job_number || "") === cand.jobNumber;
  return clientOnly ? { client: cand.client } : {
    job_number: cand.jobNumber,
    film_title: cand.filmTitle || null,
    client: cand.client || null,
    project_description: cand.projectDescription || null,
  };
}

export function reconcile(candidates, bookRows) {
  const { byCode, extras } = indexBook(bookRows);
  const candByCode = {};
  candidates.forEach((c) => { candByCode[c.code] = c; });

  const newJobs = candidates.filter((c) => !byCode[c.code]);
  const corrections = [];
  candidates.forEach((cand) => {
    const cur = byCode[cand.code];
    const reasons = whyDifferent(cur, cand, extras[cand.code]);
    if (reasons.length) corrections.push({ code: cand.code, cand, cur, reasons });
  });

  // Extra rows that say nothing the judged row doesn't. A bare stub always
  // goes. A second label goes only when the judged row is exactly what Wrike
  // says, and the two share a film and a description: the same code under two
  // films is a decision for a person, and shows up as a "film" correction.
  const redundant = Object.entries(extras).flatMap(([code, rows]) => {
    const kept = byCode[code];
    if (!kept || isBareCode(kept.job_number)) return [];
    const cand = candByCode[code];
    const keptIsWrikes = !!cand && kept.job_number === cand.jobNumber;
    const keptFilm = filmOf(kept.job_number).toLowerCase();
    return rows.filter((r) => {
      if (isBareCode(r.job_number)) return true;
      if (!keptIsWrikes || (r.job_number || "") === kept.job_number) return false;
      return filmOf(r.job_number).toLowerCase() === keptFilm
        && descriptionsAgree(descOf(r.job_number), descOf(kept.job_number));
    }).map((row) => ({ code, row, kept, cand }));
  });

  return { byCode, extras, candByCode, newJobs, corrections, redundant };
}

// What's waiting for a PM: archived jobs and ones they've said to keep aside.
export function pending(result, keptCodes = new Set(), hideArchived = true) {
  const live = (c) => !hideArchived || !c.archived;
  return {
    newJobs: result.newJobs.filter(live),
    corrections: result.corrections.filter((x) => live(x.cand) && !keptCodes.has(x.code)),
    redundant: result.redundant.filter((x) => !keptCodes.has(x.code)),
  };
}

const filmKey = (t) => String(t || "").toLowerCase().replace(/[_\s]+/g, " ").trim();

// Films these jobs name that the Films list doesn't have yet, with the studio
// their client belongs to.
export function filmsToAdd(candidates, existingTitles) {
  const have = new Set((existingTitles || []).map(filmKey));
  const out = [];
  for (const c of candidates) {
    const title = bookFilmTitle({ film_title: c.filmTitle });
    if (!title || isPseudoFilm(title) || have.has(filmKey(title))) continue;
    have.add(filmKey(title));
    out.push({ title, studio: studioNameOf(c.client) });
  }
  return out;
}

// ── How far the saved copy of Wrike's folders can be trusted ──────────────────
// It is replaced in full once a day by whoever syncs first, and patched in
// between as Wrike's webhook reports changes. A patch that fails is not
// retried, so the copy is right for suggesting and not for writing unasked.

const HOUR = 60 * 60 * 1000;

// "old": no full read for a day and a half, so the daily refresh missed a turn.
// "quiet": working hours and no live update for an hour, so the webhook has
// most likely stopped. Pass lastEventAt as undefined when it couldn't be read.
export function copyHealth({ treeAt, lastEventAt }, now = new Date()) {
  const age = (iso) => (iso ? now.getTime() - Date.parse(iso) : Infinity);
  if (age(treeAt) > 36 * HOUR) return "old";
  if (lastEventAt !== undefined && isWorkingHours(now) && age(lastEventAt) > HOUR) return "quiet";
  return "ok";
}

// Jobs whose folder is no longer what the saved copy says: binned or renamed.
// `nowById` comes from fetchFoldersNow; a folder Wrike didn't answer for is
// left out rather than accused.
export function changedSinceCopy(candidates, nowById) {
  return candidates
    .filter((c) => {
      const f = nowById[c.folderId];
      return !!f && (f.gone || (c.folderTitle != null && f.title !== c.folderTitle));
    })
    .map((c) => c.code);
}
