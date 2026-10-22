// The Worker's Google sign-in (worker/googleAuth.js): the approval link, the
// callback storing a refresh token, the token route renewing it, and a
// revoked grant reading as "connect again", not as an outage.
import worker from "../worker/index.js";
import { authorizeUrl, emailFromIdToken, safeReturn } from "../worker/googleAuth.js";

// Put back after, so the stand-in doesn't answer for the tests that follow.
const realFetch = globalThis.fetch;
const env = { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "srk", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec" };
const ctx = { waitUntil: () => {} };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// One TimeHub person signed in to Wrike as W1; `google` is their stored row.
function scenario({ google = null, googleToken }) {
  const writes = [];
  globalThis.fetch = async (url, opts = {}) => {
    url = String(url);
    if (url.includes("/wrike_oauth_tokens")) return json([{ wrike_user_id: "W1", session_token: "s", expires_at: new Date(Date.now() + 3600e3).toISOString() }]);
    if (url.includes("/google_oauth_tokens")) {
      const method = opts.method || "GET";
      if (method === "GET") return json(google ? [google] : []);
      writes.push({ method, body: opts.body ? JSON.parse(opts.body) : null });
      return json(opts.body ? [JSON.parse(opts.body)] : []);
    }
    if (url.startsWith("https://oauth2.googleapis.com/token")) return googleToken(Object.fromEntries(new URLSearchParams(opts.body)));
    if (url.startsWith("https://oauth2.googleapis.com/revoke")) return json({});
    throw new Error(`unexpected fetch: ${url}`);
  };
  return writes;
}
const req = (path, { cookie = "wrike_session=s", method = "GET" } = {}) =>
  new Request(`https://th.test${path}`, { method, headers: cookie ? { Cookie: cookie } : {} });

check("the approval link asks for offline access, the scopes and a fresh consent", (() => {
  const u = new URL(authorizeUrl({ clientId: "cid", redirectUri: "https://th.test/cb", state: "st" }));
  const scope = u.searchParams.get("scope");
  return [u.searchParams.get("access_type"), u.searchParams.get("prompt"), scope.includes("spreadsheets"), scope.includes("calendar.events.readonly"), u.searchParams.get("state")];
})(), ["offline", "consent", true, true, "st"]);
check("the email in Google's id token", emailFromIdToken(`x.${btoa(JSON.stringify({ email: "pm@xyi.com" })).replace(/=+$/, "")}.y`), "pm@xyi.com");
check("only paths on this site to go back to", ["/#orderforms", "//evil.com", "https://evil.com", ""].map(safeReturn), ["/#orderforms", "/", "/", "/"]);

{
  scenario({ googleToken: () => json({}) });
  const res = await worker.fetch(req("/api/google/oauth/start?return=%2F%23orderforms"), env, ctx);
  const to = new URL(res.headers.get("Location"));
  check("start sends someone signed in to Google, remembering the way back", [res.status, to.host, /google_oauth_state=/.test(res.headers.get("Set-Cookie"))], [302, "accounts.google.com", true]);
}
{
  scenario({ googleToken: () => json({}) });
  const res = await worker.fetch(req("/api/google/oauth/start", { cookie: "" }), env, ctx);
  check("someone not signed in to TimeHub is sent back to say so", res.headers.get("Location"), "https://th.test/?google_error=not_signed_in");
}
{
  const writes = scenario({ googleToken: (p) => json({ access_token: "A1", refresh_token: "R1", expires_in: 3599, scope: "s", id_token: `x.${btoa(JSON.stringify({ email: "pm@xyi.com" }))}.y` }) });
  const state = encodeURIComponent(JSON.stringify({ state: "st", back: "/#orderforms" }));
  const res = await worker.fetch(req("/api/google/oauth/callback?code=c&state=st", { cookie: `wrike_session=s; google_oauth_state=${state}` }), env, ctx);
  check("the callback stores the refresh token for that person and goes back", [res.headers.get("Location"), writes[0].body.wrike_user_id, writes[0].body.refresh_token, writes[0].body.google_email],
    ["https://th.test/?google_connected=1#orderforms", "W1", "R1", "pm@xyi.com"]);
}
{
  scenario({ googleToken: () => json({}) });
  const state = encodeURIComponent(JSON.stringify({ state: "st", back: "/" }));
  const res = await worker.fetch(req("/api/google/oauth/callback?code=c&state=forged", { cookie: `wrike_session=s; google_oauth_state=${state}` }), env, ctx);
  check("a callback whose state doesn't match stores nothing", res.headers.get("Location"), "https://th.test/?google_error=invalid_state");
}
{
  scenario({ google: { wrike_user_id: "W1", refresh_token: "R1", access_token: "A1", expires_at: new Date(Date.now() + 30 * 60e3).toISOString() }, googleToken: () => { throw new Error("no refresh needed"); } });
  const body = await (await worker.fetch(req("/api/google/token"), env, ctx)).json();
  check("a token with time left is handed over as it is", body.accessToken, "A1");
}
{
  const writes = scenario({ google: { wrike_user_id: "W1", refresh_token: "R1", access_token: "A1", expires_at: new Date(Date.now() + 60e3).toISOString() }, googleToken: (p) => json({ access_token: p.refresh_token === "R1" ? "A2" : "?", expires_in: 3599 }) });
  const body = await (await worker.fetch(req("/api/google/token"), env, ctx)).json();
  check("one about to lapse is renewed from the refresh token, which is kept", [body.accessToken, writes[0].body.refresh_token], ["A2", "R1"]);
}
{
  const writes = scenario({ google: { wrike_user_id: "W1", refresh_token: "R1", access_token: "A1", expires_at: new Date(0).toISOString() }, googleToken: () => json({ error: "invalid_grant" }, 400) });
  const res = await worker.fetch(req("/api/google/token"), env, ctx);
  check("a revoked grant: the row goes and the page is told to connect again", [res.status, (await res.json()).error, writes[0].method], [404, "google_not_connected", "DELETE"]);
}
{
  scenario({ google: { wrike_user_id: "W1", refresh_token: "R1", access_token: "A1", expires_at: new Date(0).toISOString() }, googleToken: () => json({ error: "backend" }, 500) });
  const res = await worker.fetch(req("/api/google/token"), env, ctx);
  check("Google having a bad moment is not a sign-out", res.status, 503);
}

globalThis.fetch = realFetch;
