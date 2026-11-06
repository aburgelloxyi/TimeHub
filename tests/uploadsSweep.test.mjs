// The half-hourly Enterprise Uploads sweep (worker/uploadsSweep.js), with
// Google, Wrike and Supabase stood in for: what it makes, what it writes back
// to the sheet, and that a sheet with nothing new costs nothing in Wrike.
import { makeUploadsSweep } from "../worker/uploadsSweep.js";

const sheetRows = (rows) => [["ENTERPRISE UPLOAD NAME", "DATE", "Market Deadline", "Department", "Reporting", "Market", "Quote", "Job Number"], ...rows];
let sheet = sheetRows([
  ["FIL_SOCIAL_ONE", 46330, "2026-11-04", "Asset Management", "Yes", "OV", "Approved"],
  ["FIL_SOCIAL_TWO", "5/11/2026"],
  ["FIL_DONE_ALREADY", "5/11/2026", "", "", "", "", "", "XY026214"],
  ["ZZZ_UNKNOWN", "5/11/2026"],
]);
const calls = [];
const created = [];
let written = [];
const json = (body) => ({ ok: true, status: 200, json: async () => body });

const fakeFetch = async (url, init = {}) => {
  const u = new URL(url);
  calls.push(`${init.method || "GET"} ${u.host}${u.pathname}`);
  if (u.host === "sheets.googleapis.com") {
    if (u.pathname.endsWith(":batchGet")) return json({ valueRanges: u.searchParams.getAll("ranges").map(() => ({})) });
    if (u.pathname.endsWith(":batchUpdate")) { written = JSON.parse(init.body).data; return json({}); }
    return json({ range: "'Uploads'!A1:Z2000", values: sheet });
  }
  if (u.pathname === "/api/v4/folders") {
    return json({ data: [
      { id: "studio", title: "Paramount", childIds: ["fil"] },
      { id: "fil", title: "Focker In-Law", childIds: ["int"] },
      { id: "int", title: "INT_Digital", childIds: ["fup"] },
      { id: "fup", title: "XY026214_Enterprise_Daily_Uploads", childIds: [] },
    ] });
  }
  if (u.pathname === "/api/v4/workflows") return json({ data: [{ name: "Studio", customStatuses: [{ id: "BACKLOG", name: "Backlog" }] }] });
  if (u.pathname === "/api/v4/customfields") {
    return json({ data: [
      { id: "JOB", title: "Job Number", type: "Text" },
      { id: "MKT", title: "Market", type: "DropDown", settings: { values: ["UK"] } },
      { id: "DEPT", title: "Department", type: "Text" },
    ] });
  }
  if (u.pathname === "/api/v4/folders/fup/tasks" && (init.method || "GET") === "GET") return json({ data: [{ id: "T0", title: "FIL_SOCIAL_TWO" }] });
  if (u.pathname === "/api/v4/folders/fup/tasks" && init.method === "POST") {
    created.push(Object.fromEntries(u.searchParams));
    return json({ data: [{ id: `T${created.length}` }] });
  }
  throw new Error(`unexpected ${url}`);
};

const sweep = makeUploadsSweep({
  sbFetch: async (_env, path) => {
    if (path.startsWith("/profiles")) return json([{ wrike_user_id: "JAMES", first_name: "James", last_name: "Doe" }, { wrike_user_id: "OLD", first_name: "James", last_name: "Gone", left_at: "2026-01-01" }]);
    throw new Error(`unexpected ${path}`);
  },
  googleRowFor: async (_env, id) => (id === "JAMES" ? { access_token: "g", scopes: "openid https://www.googleapis.com/auth/spreadsheets" } : null),
  wrikeRowFor: async (_env, id) => (id === "JAMES" ? { access_token: "w", api_host: "www.wrike.com" } : null),
  filmCodes: async () => ({ FIL: "Focker In-Law" }),
  fetch: fakeFetch,
});
const env = { UPLOADS_RUN_AS: "James" };

const first = await sweep(env);
check("runs as the one current James", first.as, "James Doe");
check("makes the one new row's task; the one already in Wrike isn't made again", created.map((c) => c.title), ["FIL_SOCIAL_ONE"]);
check("due on the sheet's date, in Backlog", [JSON.parse(created[0].dates), created[0].customStatus], [{ type: "Milestone", due: "2026-11-04" }, "BACKLOG"]);
check("its fields: job number, department; a market Wrike doesn't offer is left out",
  JSON.parse(created[0].customFields), [{ id: "JOB", value: "XY026214_Enterprise_Daily_Uploads" }, { id: "DEPT", value: "Asset Management" }]);
check("job numbers go to the made row and the one already in Wrike", written.map((w) => [w.range, w.values[0][0]]), [["'Uploads'!H3", "XY026214"], ["'Uploads'!H2", "XY026214"]]);
check("what it says it did", [first.sheets[0].pending, first.sheets[0].made, first.sheets[0].written, first.sheets[0].blocked.map((b) => b.row)], [3, 1, 2, [5]]);

// Next run, the sheet has its job numbers (and the unknown code still waits): one read of the sheet, and Wrike
// only because a row is still waiting.
sheet = sheetRows([["FIL_SOCIAL_ONE", 46330, "", "", "", "", "", "XY026214"], ["FIL_SOCIAL_TWO", "5/11/2026", "", "", "", "", "", "XY026214"]]);
calls.length = 0;
const quiet = await sweep(env);
check("nothing waiting: the sheet is read and nothing else", [quiet.sheets[0].pending, calls], [0, ["GET sheets.googleapis.com/v4/spreadsheets/1vZMlcRV4Z6M5X0RRfelN-ldeZeNnHsGLOI0biU8Djck/values/A1%3AZ2000"]]);

check("no one by that name: it doesn't run", (await sweep({ UPLOADS_RUN_AS: "Nobody" })).skipped, 'no one called "Nobody"');
