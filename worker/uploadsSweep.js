// Enterprise Uploads without anyone pressing Create. Every half hour (the cron
// in wrangler.jsonc) the Worker reads each studio's uploads sheet as the
// person named in UPLOADS_RUN_AS, makes the tasks for the rows not done yet,
// as that person and by the page's own rules (enterpriseUploads.js), and
// writes each row's job number into the sheet. A row with a job number is
// done, so a sheet with nothing new costs one read of it and nothing else.
//
// Its connections are passed in (makeUploadsSweep), so it can be tried with
// stand-ins: tests/uploadsSweep.test.mjs.

import {
  UPLOAD_SHEETS, UPLOAD_FIELDS, readUploads, codeOf, findUploadsFolder, planUploads, taskKey, uploadFields,
} from "../src/lib/orderForms/enterpriseUploads.js";
import { resolveFields, fieldUse } from "../src/lib/orderForms/wrikeFields.js";
import { a1, cellRange } from "../src/lib/orderForms/cells.js";

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

// sbFetch: the Worker's Supabase call. wrikeRowFor(env, wrikeUserId) and
// googleRowFor(env, wrikeUserId): that person's token rows, fresh, or null.
// filmCodes(env): code → film name.
export function makeUploadsSweep({ sbFetch, wrikeRowFor, googleRowFor, filmCodes, fetch: send = (...a) => fetch(...a) }) {
  // Who the sweep runs as: the one current person whose full name, or else
  // first name, is UPLOADS_RUN_AS. Two people answering to it is refused
  // rather than guessed between.
  // The films that go by other names (films.aliases), for findUploadsFolder.
  // None if they can't be read: a film is then found by its own name only.
  async function filmAliases(env) {
    try {
      const res = await sbFetch(env, "/films?select=title,aliases&aliases=neq.%7B%7D");
      return res.ok ? (await res.json()) || [] : [];
    } catch {
      return [];
    }
  }

  async function runsAs(env) {
    const wanted = norm(env.UPLOADS_RUN_AS);
    if (!wanted) return { reason: "UPLOADS_RUN_AS isn't set" };
    const res = await sbFetch(env, "/profiles?select=wrike_user_id,first_name,last_name,left_at");
    if (!res.ok) throw new Error(`profiles ${res.status}`);
    const people = ((await res.json()) || []).filter((p) => p.wrike_user_id && !p.left_at);
    const full = people.filter((p) => norm(`${p.first_name} ${p.last_name}`) === wanted);
    const first = people.filter((p) => norm(p.first_name) === wanted);
    const found = full.length ? full : first;
    if (found.length !== 1) return { reason: found.length ? `${found.length} people answer to "${env.UPLOADS_RUN_AS}"` : `no one called "${env.UPLOADS_RUN_AS}"` };
    return { id: found[0].wrike_user_id, name: `${found[0].first_name} ${found[0].last_name}`.trim() };
  }

  const google = (token) => async (url, init = {}) => {
    const res = await send(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
    if (!res.ok) throw new Error(`Google ${init.method || "GET"} (${res.status})`);
    return res.json();
  };

  const wrike = (row) => async (path, init = {}) => {
    const res = await send(`https://${row.api_host}/api/v4${path}`, { ...init, headers: { Authorization: `Bearer ${row.access_token}` } });
    if (!res.ok) throw new Error(`Wrike ${init.method || "GET"} ${path.split("?")[0]} (${res.status})`);
    return res.json();
  };
  const everyPage = async (get, path) => {
    const out = [];
    let next = "";
    do {
      const page = await get(next ? `${path}${path.includes("?") ? "&" : "?"}nextPageToken=${next}` : path);
      out.push(...(page.data || []));
      next = page.nextPageToken || "";
    } while (next);
    return out;
  };

  // What one sheet needs from Wrike, read once a run and only when a sheet has
  // rows to place: the folder tree, then per folder its tasks.
  async function wrikeView(get) {
    const byId = {};
    for (const f of await everyPage(get, `/folders?fields=${encodeURIComponent("[childIds]")}`)) {
      if (!/^Rb/i.test(f.scope || "")) byId[f.id] = { id: f.id, title: f.title || "", childIds: f.childIds || [] };
    }
    const workflows = (await get("/workflows")).data || [];
    const studio = workflows.find((w) => norm(w.name) === "studio");
    const backlog = studio?.customStatuses?.find((s) => norm(s.name) === "backlog" && !s.hidden);
    const accountFields = (await get("/customfields")).data || [];
    return { byId, status: backlog ? { id: backlog.id } : null, accountFields };
  }

  async function sweepSheet(env, studioId, sheet, run) {
    const read = google(run.google.access_token);
    const params = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" });
    const data = await read(`${SHEETS}/${sheet.id}/values/${encodeURIComponent("A1:Z2000")}?${params}`);
    const tab = (/^'?(.*?)'?!/.exec(data.range || "")?.[1] || "").replace(/''/g, "'");
    const parsed = readUploads(data.values || []);
    if (!parsed.ok) return { studioId, skipped: parsed.reason };
    const pending = parsed.uploads.filter((u) => !u.jobNumber);
    if (!pending.length) return { studioId, pending: 0 };

    const codes = await run.codes();
    const films = [...new Set(pending.map((u) => codes[codeOf(u.name)]).filter(Boolean))];
    if (!films.length) return { studioId, pending: pending.length, made: 0, note: "no row's film code is known" };

    const get = await run.wrike();
    const view = await run.view();
    const aliased = await run.aliases();
    const places = new Map(films.map((film) => [film, findUploadsFolder(view.byId, film, aliased)]));
    const folders = [...new Map([...places.values()].filter((p) => p.ok).map((p) => [p.folder.id, p.folder])).values()];
    const tasks = await Promise.all(folders.map((f) =>
      everyPage(get, `/folders/${f.id}/tasks?fields=${encodeURIComponent("[customFields]")}&subTasks=true&pageSize=1000`)));
    const existing = new Map(folders.map((f, i) => [f.id, new Map(tasks[i].map((t) => [taskKey(t.title), { id: t.id }]))]));
    const fields = resolveFields(view.accountFields, fieldUse(tasks.flat()), UPLOAD_FIELDS.map((f) => f.title));
    const planned = planUploads(pending, { codes, placeOf: (film) => places.get(film), existing: (id) => existing.get(id) || new Map() });

    const made = [];
    const failed = [];
    for (const u of planned.filter((p) => p.state === "ready")) {
      const custom = uploadFields(u, fields).set;
      const body = new URLSearchParams({ title: u.name });
      if (u.date) body.set("dates", JSON.stringify({ type: "Milestone", due: u.date }));
      if (view.status) body.set("customStatus", view.status.id);
      if (custom.length) body.set("customFields", JSON.stringify(custom));
      try {
        await get(`/folders/${u.place.folder.id}/tasks?${body}`, { method: "POST" });
        made.push(u);
      } catch (err) {
        failed.push({ row: u.row, reason: err.message });
      }
    }

    // Every row whose task is there now gets its job number, which marks it done. Each cell is read again first
    // and written only if it's still empty, so nothing typed since is overwritten.
    const done = [...planned.filter((p) => p.state === "in-wrike"), ...made].filter((u) => u.place?.jobCode);
    let written = 0;
    let note = "";
    if (done.length && parsed.columns.jobNumber != null) {
      if (!String(run.google.scopes || "").split(" ").includes(WRITE_SCOPE)) {
        note = `${run.person.name}'s Google connection can't edit sheets, so job numbers weren't written`;
      } else {
        const cells = done.map((u) => ({ range: cellRange(tab, a1(u.row - 1, parsed.columns.jobNumber)), to: u.place.jobCode }));
        const now = await read(`${SHEETS}/${sheet.id}/values:batchGet?${cells.map((c) => `ranges=${encodeURIComponent(c.range)}`).join("&")}`);
        const still = cells.filter((c, i) => String(now.valueRanges?.[i]?.values?.[0]?.[0] ?? "") === "");
        if (still.length) {
          await read(`${SHEETS}/${sheet.id}/values:batchUpdate`, {
            method: "POST",
            body: JSON.stringify({ valueInputOption: "RAW", data: still.map((c) => ({ range: c.range, values: [[c.to]] })) }),
          });
        }
        written = still.length;
      }
    }
    const blocked = planned.filter((p) => p.state === "blocked").map((p) => ({ row: p.row, reason: p.reason }));
    return { studioId, pending: pending.length, made: made.length, failed, blocked, written, ...(note ? { note } : {}) };
  }

  // One run over every studio's sheet. Returns what happened, for the log.
  return async function sweepUploads(env) {
    const person = await runsAs(env);
    if (!person.id) return { skipped: person.reason };
    const googleRow = await googleRowFor(env, person.id);
    if (!googleRow) return { skipped: `${person.name} hasn't connected Google in TimeHub` };
    // Wrike, the film codes and the folder tree are only fetched once a sheet has rows waiting, and only once.
    let wrikeGet = null;
    let view = null;
    let codes = null;
    let aliases = null;
    const run = {
      person,
      google: googleRow,
      codes: async () => (codes ||= await filmCodes(env)),
      aliases: async () => (aliases ||= await filmAliases(env)),
      wrike: async () => {
        if (wrikeGet) return wrikeGet;
        const row = await wrikeRowFor(env, person.id);
        if (!row) throw new Error(`${person.name} hasn't connected Wrike in TimeHub`);
        return (wrikeGet = wrike(row));
      },
      view: async () => (view ||= await wrikeView(await run.wrike())),
    };
    const sheets = [];
    for (const [studioId, sheet] of Object.entries(UPLOAD_SHEETS)) {
      try {
        sheets.push(await sweepSheet(env, studioId, sheet, run));
      } catch (err) {
        sheets.push({ studioId, error: err.message });
      }
    }
    return { as: person.name, sheets };
  };
}
