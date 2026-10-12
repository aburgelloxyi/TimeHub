// Reads a campaign's motion jobs and every comment on them from Wrike, and
// hands the lot to buildAmends. One call per job for its comments, so a
// campaign is around a hundred calls: it runs when somebody opens Amends, and
// the result is kept in this browser until they refresh it.
import { fetchRetrying } from "../fetchPool";
import { buildAmends } from "./amends";

const FIELDS = encodeURIComponent('["subTaskIds"]');
const KEEP_MS = 6 * 60 * 60 * 1000;
const storeKey = (campaignId) => `xyi.amends.v1.${campaignId}`;

async function wrike(path, signal) {
  const res = await fetchRetrying(`/api/wrike${path}`, { signal });
  if (!res.ok) throw new Error(`Wrike answered ${res.status} for ${path.split("?")[0]}`);
  return (await res.json()).data || [];
}

const isMotionJob = (t) => /\bmotion\b/i.test(t.title || "") && (t.subTaskIds || []).length > 0;

// "SF Motion Outdoor CO 4" -> "SF Motion": what every motion job of the
// campaign starts with, so a title search finds the ones the cache is too
// young to hold.
function jobPrefix(titles) {
  const count = {};
  titles.forEach((t) => {
    const m = /^(.*?\bmotion)\b/i.exec(t);
    if (m) count[m[1].trim()] = (count[m[1].trim()] || 0) + 1;
  });
  return Object.keys(count).sort((a, b) => count[b] - count[a])[0] || "";
}

/**
 * The campaign's motion jobs: the ones the shared cache files under this film,
 * plus any other job whose title starts the same way. `codes` are the film's
 * codes, tried when the cache holds none of its motion jobs.
 */
async function findJobs({ title, cached, codes, signal }) {
  const byId = {};
  // The Canvas tidies a film's name into a campaign title (underscores, case).
  const same = (a) => String(a || "").replace(/_/g, " ").trim().toLowerCase() === title.trim().toLowerCase();
  cached.filter((t) => same(t.projectName) && isMotionJob(t)).forEach((t) => { byId[t.id] = t; });
  const prefixes = [jobPrefix(Object.values(byId).map((t) => t.title))].filter(Boolean);
  if (!prefixes.length) codes.forEach((c) => prefixes.push(`${c} Motion`));
  for (const prefix of prefixes) {
    let token = "";
    do {
      const res = await fetchRetrying(
        `/api/wrike/tasks?title=${encodeURIComponent(prefix)}&pageSize=1000&fields=${FIELDS}${token ? `&nextPageToken=${token}` : ""}`,
        { signal }
      );
      if (!res.ok) break;
      const page = await res.json();
      (page.data || [])
        .filter((t) => String(t.title || "").toLowerCase().indexOf(prefix.toLowerCase()) === 0 && isMotionJob(t))
        .forEach((t) => { if (!byId[t.id]) byId[t.id] = t; });
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

export const storedAmendsAreFresh = (stored) => !!stored && Date.now() - new Date(stored.at).getTime() < KEEP_MS;

/**
 * `onProgress(done, total)` counts jobs read. Throws when Wrike can't be
 * read; a campaign with no motion jobs resolves with `jobs: 0`.
 */
export async function fetchAmends({ campaignId, title, cached = [], codes = [], signal, onProgress }) {
  const jobs = await findJobs({ title, cached, codes, signal });
  if (!jobs.length) return { at: new Date().toISOString(), result: { notes: [], handoffs: 0, jobs: 0 } };

  const [contacts, workflows] = await Promise.all([wrike("/contacts", signal), wrike("/workflows", signal)]);
  const people = {};
  contacts.forEach((c) => { people[c.id] = `${c.firstName || ""} ${c.lastName || ""}`.trim(); });
  // Wrike's own group, so nobody keeps a second list of who is in Motion.
  const motionIds = contacts
    .filter((c) => c.type === "Group" && /^motion( team)?$/i.test(people[c.id].replace(/[^\p{L} ]/gu, "").trim()))
    .reduce((all, g) => all.concat(g.memberIds || []), []);
  const statusName = {};
  workflows.forEach((w) => (w.customStatuses || []).forEach((s) => { statusName[s.id] = s.name; }));

  const subIds = jobs.reduce((all, j) => all.concat(j.subTaskIds || []), []);
  const subs = {};
  for (let i = 0; i < subIds.length; i += 100) {
    (await wrike(`/tasks/${subIds.slice(i, i + 100).join(",")}`, signal)).forEach((t) => {
      subs[t.id] = { title: t.title, statusName: statusName[t.customStatusId] || t.status };
    });
  }

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
