// Cloudflare Worker: Wrike OAuth (authorization code flow) + API proxy.
//
// Members never see a Wrike access token. They hit /api/wrike/oauth/start,
// approve on Wrike's site, and land back here. From then on the browser talks
// to /api/wrike/* (this Worker), which attaches the stored token, refreshes it
// when it's about to expire, and forwards the request to the real Wrike API.
//
// Tokens live in Supabase (wrike_oauth_tokens), reachable only with the
// service role key held in this Worker's secrets — RLS blocks the anon/
// authenticated roles the browser client uses entirely.

const WRIKE_AUTHORIZE_URL = "https://login.wrike.com/oauth2/authorize/v4";
const WRIKE_TOKEN_URL = "https://login.wrike.com/oauth2/token";
const SESSION_COOKIE = "wrike_session";
const STATE_COOKIE = "wrike_oauth_state";
const SESSION_MAX_AGE = 60 * 60 * 24 * 180; // 180 days
const STATE_MAX_AGE = 600; // 10 minutes

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isHttps = url.protocol === "https:";

    if (url.pathname === "/api/wrike/oauth/start") {
      return handleOAuthStart(url, env, isHttps);
    }
    if (url.pathname === "/api/wrike/oauth/callback") {
      return handleOAuthCallback(request, url, env, isHttps);
    }
    if (url.pathname === "/api/wrike/oauth/disconnect") {
      return handleDisconnect(request, env);
    }
    if (url.pathname === "/api/wrike/oauth/status") {
      return handleStatus(request, env);
    }
    if (url.pathname.startsWith("/api/wrike/")) {
      return handleProxy(request, url, env);
    }

    return env.ASSETS.fetch(request);
  },
};

// ── Cookie helpers ───────────────────────────────────────────────────────────

function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function setCookie(name, value, { maxAge, path = "/", secure }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, "HttpOnly", "SameSite=Lax"];
  if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function clearCookie(name, path = "/") {
  return `${name}=; Path=${path}; Max-Age=0; HttpOnly; SameSite=Lax`;
}

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

// ── Supabase (service role) helpers ──────────────────────────────────────────

async function sbFetch(env, path, opts = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
}

async function getTokenRowBySession(env, sessionToken) {
  const res = await sbFetch(
    env,
    `/wrike_oauth_tokens?session_token=eq.${encodeURIComponent(sessionToken)}&select=*`
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function upsertTokenRow(env, row) {
  const res = await sbFetch(env, `/wrike_oauth_tokens?on_conflict=wrike_user_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase upsert failed: ${res.status} ${await res.text()}`);
  return (await res.json())[0];
}

async function updateTokenRow(env, wrikeUserId, patch) {
  const res = await sbFetch(env, `/wrike_oauth_tokens?wrike_user_id=eq.${encodeURIComponent(wrikeUserId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Supabase update failed: ${res.status} ${await res.text()}`);
  return (await res.json())[0];
}

async function deleteTokenRow(env, wrikeUserId) {
  await sbFetch(env, `/wrike_oauth_tokens?wrike_user_id=eq.${encodeURIComponent(wrikeUserId)}`, {
    method: "DELETE",
  });
}

// ── Wrike OAuth helpers ───────────────────────────────────────────────────────

async function exchangeCodeForToken(env, code, redirectUri) {
  const body = new URLSearchParams({
    client_id: env.WRIKE_CLIENT_ID,
    client_secret: env.WRIKE_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch(WRIKE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Wrike token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function refreshAccessToken(env, refreshToken) {
  const body = new URLSearchParams({
    client_id: env.WRIKE_CLIENT_ID,
    client_secret: env.WRIKE_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(WRIKE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Wrike token refresh failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Route handlers ───────────────────────────────────────────────────────────

async function handleOAuthStart(url, env, isHttps) {
  const state = crypto.randomUUID();
  const redirectUri = `${url.origin}/api/wrike/oauth/callback`;

  const authorizeUrl = new URL(WRIKE_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", env.WRIKE_CLIENT_ID);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  const headers = new Headers({ Location: authorizeUrl.toString() });
  headers.append(
    "Set-Cookie",
    setCookie(STATE_COOKIE, state, { maxAge: STATE_MAX_AGE, path: "/api/wrike/oauth", secure: isHttps })
  );
  return new Response(null, { status: 302, headers });
}

async function handleOAuthCallback(request, url, env, isHttps) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const cookies = parseCookies(request);

  const fail = (reason) => Response.redirect(`${url.origin}/?wrike_error=${encodeURIComponent(reason)}`, 302);

  if (error) return fail(error);
  if (!code || !state || state !== cookies[STATE_COOKIE]) return fail("invalid_state");

  const redirectUri = `${url.origin}/api/wrike/oauth/callback`;

  let tokenData;
  try {
    tokenData = await exchangeCodeForToken(env, code, redirectUri);
  } catch (err) {
    console.error(err);
    return fail("token_exchange_failed");
  }

  const apiHost = tokenData.host || "www.wrike.com";
  const meRes = await fetch(`https://${apiHost}/api/v4/contacts?me=true`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!meRes.ok) return fail("profile_fetch_failed");
  const me = (await meRes.json()).data?.[0];
  if (!me) return fail("no_profile");

  const sessionToken = crypto.randomUUID() + crypto.randomUUID();
  const expiresAt = new Date(Date.now() + Number(tokenData.expires_in || 3600) * 1000).toISOString();

  await upsertTokenRow(env, {
    wrike_user_id: me.id,
    session_token: sessionToken,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    api_host: apiHost,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });

  const params = new URLSearchParams({
    wrike_connected: "1",
    wrike_user_id: me.id,
    first_name: me.firstName || "",
    last_name: me.lastName || "",
    email: me.profiles?.[0]?.email || "",
    avatar_url: me.avatarUrl || "",
  });

  const headers = new Headers({ Location: `${url.origin}/?${params.toString()}` });
  headers.append(
    "Set-Cookie",
    setCookie(SESSION_COOKIE, sessionToken, { maxAge: SESSION_MAX_AGE, path: "/", secure: isHttps })
  );
  headers.append("Set-Cookie", clearCookie(STATE_COOKIE, "/api/wrike/oauth"));
  return new Response(null, { status: 302, headers });
}

async function handleDisconnect(request, env) {
  const cookies = parseCookies(request);
  const session = cookies[SESSION_COOKIE];
  if (session) {
    const row = await getTokenRowBySession(env, session);
    if (row) await deleteTokenRow(env, row.wrike_user_id);
  }
  const res = json({ ok: true });
  res.headers.append("Set-Cookie", clearCookie(SESSION_COOKIE, "/"));
  return res;
}

async function handleStatus(request, env) {
  const cookies = parseCookies(request);
  const session = cookies[SESSION_COOKIE];
  if (!session) return json({ connected: false });
  const row = await getTokenRowBySession(env, session);
  return json({ connected: !!row, wrikeUserId: row?.wrike_user_id || null });
}

async function handleProxy(request, url, env) {
  const cookies = parseCookies(request);
  const session = cookies[SESSION_COOKIE];
  if (!session) return json({ error: "not_connected" }, { status: 401 });

  let row = await getTokenRowBySession(env, session);
  if (!row) return json({ error: "not_connected" }, { status: 401 });

  if (new Date(row.expires_at).getTime() - Date.now() < 60_000) {
    try {
      const refreshed = await refreshAccessToken(env, row.refresh_token);
      row = await updateTokenRow(env, row.wrike_user_id, {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token || row.refresh_token,
        api_host: refreshed.host || row.api_host,
        expires_at: new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      return json({ error: "token_refresh_failed" }, { status: 401 });
    }
  }

  const restPath = url.pathname.replace(/^\/api\/wrike/, "");
  const targetUrl = `https://${row.api_host}/api/v4${restPath}${url.search}`;

  const fwdHeaders = new Headers(request.headers);
  fwdHeaders.delete("Cookie");
  fwdHeaders.delete("Host");
  fwdHeaders.set("Authorization", `Bearer ${row.access_token}`);

  const init = { method: request.method, headers: fwdHeaders };
  if (!["GET", "HEAD"].includes(request.method)) init.body = request.body;

  const wrikeRes = await fetch(targetUrl, init);
  const resHeaders = new Headers(wrikeRes.headers);
  resHeaders.delete("Set-Cookie");
  return new Response(wrikeRes.body, { status: wrikeRes.status, headers: resHeaders });
}
