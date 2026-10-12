// Reads a campaign's motion jobs and every comment on them from Wrike, and
// hands the lot to buildAmends. One call per job for its comments, so a
// campaign is a hundred calls or so: it runs when somebody opens Amends, and
// the result is kept in this browser until they refresh it.
import { fetchRetrying } from "../fetchPool";
import { buildAmends, isMotionJob } from "./amends";

const FIELDS = encodeURIComponent('["subTaskIds"]');
const KEEP_MS = 6 * 60 * 60 * 1000;
const storeKey = (campaignId) => `xyi.amends.v1.${campaignId}`;

async function wrike(path, signal) {
  const res = await fetchRetrying(`/api/wrike${path}`, { signal });
  if (!res.ok) throw new Error(`Wrike answered ${res.status} for ${path.split("?")[0]}`);
  return (await res.json()).data || [];
}

const hasSubtasks = (t) => (t.subTaskIds || []).length > 0;

/**
 * Every job that could be one of the campaign's: the ones the shared cache
 * files under this film, plus any task in Wrike whose title starts with one
 * of the film's codes ("FID - TR - DOOH - Batch 1"), which reaches the jobs
 * the cache is too young to hold. Which of them are MOTION jobs is decided
 * afterwards, from their subtasks.
 */
async function findCandidates({ title, cached, codes, signal }) {
  const byId = {};
  // The Canvas tidies a film's name into a campaign title (underscores, case).
  const same = (a) => String(a || "").replace(/_/g, " ").trim().toLowerCase() === title.trim().toLowerCase();
  cached.filter((t) => same(t.projectName) && hasSubtasks(t)).forEach((t) => { byId[t.id] = t; });
  // A code the film's own cached jobs lead with counts too: not every film is in the code list.
  const lead = {};
  Object.values(byId).forEach((t) => {
    const m = /^([A-Z][A-Z0-9]{1,6})\b/.exec(t.title || "");
    if (m) lead[m[1]] = (lead[m[1]] || 0) + 1;
  });
  const top = Object.keys(lead).sort((a, b) => lead[b] - lead[a])[0];
  const all = [...new Set([...codes, ...(top && lead[top] >= 3 ? [top] : [])].map((c) => c.toUpperCase()))];
  for (const code of all) {
    const starts = new RegExp(`^${code}(?![A-Za-z0-9])`, "i");
    let token = "";
    do {
      const res = await fetchRetrying(
        `/api/wrike/tasks?title=${encodeURIComponent(code + " ")}&pageSize=1000&fields=${FIELDS}${token ? `&nextPageToken=${token}` : ""}`,
        { signal }
      );
      if (!res.ok) break;
      const page = await res.json();
      (page.data || []).filter((t) => starts.test(t.title || "") && hasSubtasks(t)).forEach((t) => { if (!byId[t.id]) byId[t.id] = t; });
      token = page.nextPageToken || "";
    } while (token);
  }
  return Object.values(byId);
}

async function inBatches(items, size, run) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(run));
}

export function readStoredAmends(campaignId) {
  try {
    const raw = JSON.parse(localStorage.getItem(storeKey(campaignId)) || "null");
    return raw && raw.result ? raw : null;
  } catch {
    return null;
  }
}

// A read that found no jobs is never kept as the answer: it is asked again.
export const storedAmendsAreFresh = (stored) =>
  !!stored && stored.result.jobs > 0 && Date.now() - new Date(stored.at).getTime() < KEEP_MS;

/**
 * `onProgress(done, total)` counts jobs read. Throws when Wrike can't be
 * read; a campaign with no motion jobs resolves with `jobs: 0`.
 */
export async function fetchAmends({ campaignId, title, cached = [], codes = [], signal, onProgress }) {
  const candidates = await findCandidates({ title, cached, codes, signal });
  const none = { at: new Date().toISOString(), result: { notes: [], handoffs: 0, jobs: 0 } };
  if (!candidates.length) return none;

  const [contacts, workflows] = await Promise.all([wrike("/contacts", signal), wrike("/workflows", signal)]);
  const people = {};
  contacts.forEach((c) => { people[c.id] = `${c.firstName || ""} ${c.lastName || ""}`.trim(); });
  // Wrike's own group, so nobody keeps a second list of who is in Motion.
  const motionIds = contacts
    .filter((c) => c.type === "Group" && /^motion( team)?$/i.test(people[c.id].replace(/[^\p{L} ]/gu, "").trim()))
    .reduce((all, g) => all.concat(g.memberIds || []), []);
  const statusName = {};
  workflows.forEach((w) => (w.customStatuses || []).forEach((s) => { statusName[s.id] = s.name; }));

  const subIds = candidates.reduce((all, j) => all.concat(j.subTaskIds || []), []);
  const subs = {};
  for (let i = 0; i < subIds.length; i += 100) {
    (await wrike(`/tasks/${subIds.slice(i, i + 100).join(",")}`, signal)).forEach((t) => {
      subs[t.id] = { title: t.title, statusName: statusName[t.customStatusId] || t.status };
    });
  }
  const jobs = candidates.filter((j) => isMotionJob(j, subs));
  if (!jobs.length) return none;

  const comments = {};
  let done = 0;
  await inBatches(jobs, 4, async (job) => {
    comments[job.id] = (await wrike(`/tasks/${job.id}/comments?plainText=true`, signal)).map((c) => ({
      id: c.id,
      authorId: c.authorId,
      text: c.text,
      at: c.createdDate || c.updatedDate,
    }));
    onProgress?.(++done, jobs.length);
  });

  const stored = { at: new Date().toISOString(), result: buildAmends({ jobs, subs, comments, people, motionIds }) };
  // Too big for this browser's storage is not a failure: it is read again next time.
  try { localStorage.setItem(storeKey(campaignId), JSON.stringify(stored)); } catch { /* not kept */ }
  return stored;
}
