// Guards the jobs feed's statuses (/api/panel/jobs) against a stale cache.
//
// On 12 Nov 2026 Emma moved FIL_DOOH_NO_PRE to Prep for delivery at 15:49. The
// webhook recorded it in wrike_task_activity at once, but wrike_tasks_cache is
// only written by an open TimeHub tab, and none was open: the Hub and the
// Toolbox showed Creative approved until someone opened the site at 16:09.
import worker from "../worker/index.js";

const env = { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "srk", PANEL_KEY: "pk" };
const ctx = { waitUntil: () => {} };
const today = new Date(new Date().setHours(12, 0, 0, 0)).toISOString();
const later = () => new Date(Date.now() + 3_600_000).toISOString();
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
const ok = (body) => new Response(JSON.stringify(body), { status: 200 });

let member = 0;
function scenario({ copiedAt, activity, activityFails = false }) {
  const who = `Zed${++member}`;
  const job = {
    id: "J1",
    task_data: {
      title: "FIL_DOOH_NO_PRE", status: "Active", dueDate: today, updatedDate: copiedAt,
      customStatusId: "CREATIVE", customStatusName: "Creative approved",
      responsibleIds: ["U9"], superTaskIds: [], subTaskIds: [],
    },
  };
  globalThis.fetch = async (url) => {
    url = String(url);
    if (url.includes("/profiles?")) return ok([{ wrike_user_id: "U9", first_name: who, last_name: "Q", updated_at: today }]);
    if (url.includes("/wrike_oauth_tokens")) return ok([{ api_host: "www.wrike.com", access_token: "t", expires_at: later() }]);
    if (url.includes("/wrike_task_activity")) {
      if (activityFails) return new Response("down", { status: 503 });
      return ok(activity.filter((a) => url.includes(`"${a.task_id}"`)));
    }
    if (url.includes("/wrike_tasks_cache")) return ok([job]);
    if (url.includes("/api/v4/")) return ok({ data: [] });
    if (url.includes("sb.test")) return ok([]);
    throw new Error(`unexpected fetch: ${url}`);
  };
}

// A new member name per scenario, so the feed's two-minute answer cache never serves the last one.
const statusOf = async () => {
  const res = await worker.fetch(
    new Request(`https://x.test/api/panel/jobs?member=Zed${member}`, { headers: { "X-Panel-Key": "pk" } }),
    env, ctx
  );
  const jobs = await res.json();
  return (Array.isArray(jobs) ? jobs : []).find((j) => j.id === "J1")?.status;
};

const change = (at, name, id) => ({ task_id: "J1", status: name, custom_status_id: id, occurred_at: at });

// 1. The real case: changed after the cache's copy, so the change wins.
scenario({
  copiedAt: ago(160),
  activity: [change(ago(20), "Prep for delivery", "PREP"), change(ago(160), "Creative approved", "CREATIVE")],
});
check("a status changed since the cache's copy is the one sent", await statusOf(), "Prep for delivery");

// 2. The cache copied the task after its last change: the cache stands.
scenario({ copiedAt: ago(5), activity: [change(ago(20), "Prep for delivery", "PREP")] });
check("a change the cache already holds changes nothing", await statusOf(), "Creative approved");

// 3. Only the newest change counts, whatever came before it.
scenario({
  copiedAt: ago(300),
  activity: [change(ago(10), "Delivering", "DELIV"), change(ago(30), "Prep for delivery", "PREP")],
});
check("the newest change is the one sent", await statusOf(), "Delivering");

// 4. The activity read fails: the cached status, never an error.
scenario({ copiedAt: ago(160), activity: [], activityFails: true });
check("a failed activity read leaves the cached status", await statusOf(), "Creative approved");
