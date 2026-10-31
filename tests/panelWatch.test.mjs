// Guards the panel's watch route: the one the XYi apps poll while someone is
// looking at their jobs. It must be cheap, additive, and honest about cursors.
import worker from "../worker/index.js";

const env = { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "srk", PANEL_KEY: "k" };
let calls = [];
let changed = [];
let removed = [];

globalThis.fetch = async (url) => {
  calls.push(String(url));
  if (String(url).includes("/profiles")) {
    return new Response(JSON.stringify([{ first_name: "Michael", last_name: "Brown", wrike_user_id: "U1", department: "Motion" }]), { status: 200 });
  }
  if (String(url).includes("/wrike_tasks_cache_removed")) {
    return new Response(JSON.stringify(removed), { status: 200 });
  }
  if (String(url).includes("/wrike_tasks_cache?")) {
    return new Response(JSON.stringify(changed), { status: 200 });
  }
  throw new Error(`unexpected fetch: ${url}`);
};

const ask = (query, key = "k") =>
  worker.fetch(new Request(`https://x.test/api/panel/watch?${query}`, { headers: { "X-Panel-Key": key } }), env, {});

// 1. The key is required, as on the other panel routes.
{
  const res = await ask("member=Michael&since=2026-10-30T00:00:00Z", "wrong");
  check("refuses without the panel key", res.status, 401);
}

// 2. A missing cursor is a caller's mistake, not a silent full read.
{
  const res = await ask("member=Michael");
  check("asks for a cursor", res.status, 400);
}

// 3. It answers only what is past the cursor, with the status the apps filter on.
{
  calls = [];
  changed = [{ id: "T1", cached_at: "2026-10-30T10:00:00Z", task_data: { status: "Active" } }];
  removed = [];
  const res = await ask("member=Michael&since=2026-10-30T00:00:00Z");
  const body = await res.json();
  check("answers 200", res.status, 200);
  check("one changed job, with its status", body.jobs.map((j) => [j.id, j.status]), [["T1", "Active"]]);
  check("the cursor is asked for in the query", calls.some((u) => u.includes("cached_at=gt.")), true);
}

// 4. Removals come back too, so a job that left the cache can be dropped.
{
  changed = [];
  removed = [{ id: "T2", removed_at: "2026-10-30T10:05:00Z" }];
  const res = await ask("member=Michael&since=2026-10-30T00:00:00Z");
  const body = await res.json();
  check("tombstones are passed on", body.removed, ["T2"]);
  check("an empty change set is not an error", body.jobs, []);
}

// 5. A name that is not a person says so, rather than looking like no work.
{
  globalThis.fetch = async (url) => {
    if (String(url).includes("/profiles")) return new Response(JSON.stringify([]), { status: 200 });
    throw new Error(`unexpected fetch: ${url}`);
  };
  const res = await ask("member=Nobody&since=2026-10-30T00:00:00Z");
  check("unknown member is named", res.status, 404);
}
