// Google sign-in kept by the Worker, as Wrike's is: Google's approval page
// once, then the Worker holds the refresh token and hands the page a fresh
// access token whenever it asks. The page's own sign-in (Google's in-browser
// one) lasted an hour and couldn't be renewed without a click.
//
// One connection per TimeHub person, keyed by their Wrike user id, so it
// works in every browser they're signed in to. Tokens live in Supabase
// (google_oauth_tokens), reachable only with this Worker's service key. The
// page still calls Google itself with the access token; only how it gets one
// changes.
//
// The client is Internal to the xyi.com Workspace, so refresh tokens last
// until revoked (an External app in Testing would lose them after 7 days).

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const STATE_COOKIE = "google_oauth_state";
const STATE_MAX_AGE = 600; // 10 minutes
// Renewed this long before it lapses, so the page never starts a read on a
// token about to go.
const EARLY_MS = 2 * 60 * 1000;

// Reading Drive, editing sheets (Fill links, Apply), and who the account is.
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
];

class GoogleAuthInvalid extends Error {}

// Where Google's approval page is, for this request. `prompt=consent` makes
// Google return a refresh token even to someone who approved before.
export function authorizeUrl({ clientId, redirectUri, state, loginHint }) {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("state", state);
  if (loginHint) u.searchParams.set("login_hint", loginHint);
  return u.toString();
}

// The email in Google's id_token. It comes straight from Google's token
// endpoint over TLS, so it is read, not verified.
export function emailFromIdToken(idToken) {
  try {
    const part = String(idToken || "").split(".")[1] || "";
    const padded = part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4);
    return JSON.parse(atob(padded)).email || "";
  } catch {
    return "";
  }
}

// Where to send someone back to after Google: a path on this site only.
export const safeReturn = (value) => (/^\/(?!\/)[^\s]*$/.test(String(value || "")) ? value : "/");

// The page to land on, with a flag for the page to read. The return path's
// own hash (#orderforms/…) goes last, where a browser keeps it.
function landing(origin, back, flag) {
  const [path, hash = ""] = safeReturn(back).split("#");
  const sep = path.includes("?") ? "&" : "?";
  return `${origin}${path}${sep}${flag}${hash ? `#${hash}` : ""}`;
}

export function makeGoogleAuth({ parseCookies, setCookie, clearCookie, json, sbFetch, whoIs }) {
  const table = (env, query = "") => `/google_oauth_tokens${query}`;

  async function readRow(env, wrikeUserId) {
    const res = await sbFetch(env, table(env, `?wrike_user_id=eq.${encodeURIComponent(wrikeUserId)}&select=*`), { timeoutMs: 5000 });
    if (!res.ok) throw new Error(`google token read ${res.status}`);
    return (await res.json())[0] || null;
  }
  async function saveRow(env, row) {
    const res = await sbFetch(env, table(env, "?on_conflict=wrike_user_id"), {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(row),
    });
    if (!res.ok) throw new Error(`google token save ${res.status} ${await res.text()}`);
    return (await res.json())[0];
  }
  async function deleteRow(env, wrikeUserId) {
    const res = await sbFetch(env, table(env, `?wrike_user_id=eq.${encodeURIComponent(wrikeUserId)}`), { method: "DELETE" });
    if (!res.ok) throw new Error(`google token delete ${res.status}`);
  }

  async function tokenRequest(env, params) {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // invalid_grant: revoked, password changed, or the account removed.
      // The person has to connect again. Anything else is passing.
      if (body.error === "invalid_grant") throw new GoogleAuthInvalid(body.error_description || body.error);
      throw new Error(`google token ${res.status} ${body.error || ""}`);
    }
    return body;
  }

  // Who is asking, from their Wrike session. null when signed out of TimeHub.
  async function caller(request, env) {
    try {
      return await whoIs(request, env);
    } catch {
      return undefined; // couldn't check: not the same as signed out
    }
  }

  async function start(request, url, env, isHttps) {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return json({ error: "google_not_configured" }, { status: 503 });
    const me = await caller(request, env);
    if (me === undefined) return json({ error: "unavailable" }, { status: 503 });
    if (!me) return Response.redirect(landing(url.origin, url.searchParams.get("return"), "google_error=not_signed_in"), 302);
    const state = crypto.randomUUID();
    // The state cookie carries where to go back to, so the callback needs no
    // other memory.
    const cookie = JSON.stringify({ state, back: safeReturn(url.searchParams.get("return")) });
    const headers = new Headers({
      Location: authorizeUrl({
        clientId: env.GOOGLE_CLIENT_ID,
        redirectUri: `${url.origin}/api/google/oauth/callback`,
        state,
        loginHint: url.searchParams.get("hint") || "",
      }),
    });
    headers.append("Set-Cookie", setCookie(STATE_COOKIE, encodeURIComponent(cookie), { maxAge: STATE_MAX_AGE, path: "/api/google/oauth", secure: isHttps }));
    return new Response(null, { status: 302, headers });
  }

  async function callback(request, url, env) {
    let saved = {};
    try { saved = JSON.parse(decodeURIComponent(parseCookies(request)[STATE_COOKIE] || "")); } catch { /* no cookie */ }
    const back = saved.back || "/";
    const done = (flag) => {
      const headers = new Headers({ Location: landing(url.origin, back, flag) });
      headers.append("Set-Cookie", clearCookie(STATE_COOKIE, "/api/google/oauth"));
      return new Response(null, { status: 302, headers });
    };
    if (url.searchParams.get("error")) return done(`google_error=${encodeURIComponent(url.searchParams.get("error"))}`);
    const code = url.searchParams.get("code");
    if (!code || !saved.state || url.searchParams.get("state") !== saved.state) return done("google_error=invalid_state");
    const me = await caller(request, env);
    if (!me) return done("google_error=not_signed_in");

    let tokens;
    try {
      tokens = await tokenRequest(env, { grant_type: "authorization_code", code, redirect_uri: `${url.origin}/api/google/oauth/callback` });
    } catch (err) {
      console.error("[google] code exchange failed:", err.message);
      return done("google_error=token_exchange_failed");
    }
    if (!tokens.refresh_token) return done("google_error=no_refresh_token");
    try {
      await saveRow(env, {
        wrike_user_id: me,
        google_email: emailFromIdToken(tokens.id_token),
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
        scopes: tokens.scope || "",
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[google] save failed:", err.message);
      return done("google_error=save_failed");
    }
    return done("google_connected=1");
  }

  // A valid access token for the page, renewed when it is close to lapsing.
  async function token(request, env) {
    const me = await caller(request, env);
    if (me === undefined) return json({ error: "unavailable" }, { status: 503 });
    if (!me) return json({ error: "not_signed_in" }, { status: 401 });
    let row;
    try { row = await readRow(env, me); } catch (err) {
      console.error("[google] token read failed:", err.message);
      return json({ error: "unavailable" }, { status: 503 });
    }
    if (!row) return json({ error: "google_not_connected" }, { status: 404 });
    const fresh = row.access_token && Date.parse(row.expires_at) - Date.now() > EARLY_MS;
    if (!fresh) {
      let renewed;
      try {
        renewed = await tokenRequest(env, { grant_type: "refresh_token", refresh_token: row.refresh_token });
      } catch (err) {
        if (err instanceof GoogleAuthInvalid) {
          await deleteRow(env, me).catch(() => {});
          return json({ error: "google_not_connected" }, { status: 404 });
        }
        console.error("[google] refresh failed:", err.message);
        return json({ error: "unavailable" }, { status: 503 });
      }
      row = {
        ...row,
        access_token: renewed.access_token,
        expires_at: new Date(Date.now() + Number(renewed.expires_in || 3600) * 1000).toISOString(),
        scopes: renewed.scope || row.scopes,
        // Google rarely sends a new one; keep the old otherwise.
        refresh_token: renewed.refresh_token || row.refresh_token,
        updated_at: new Date().toISOString(),
      };
      // A failed save costs nothing: Google's refresh tokens aren't used up,
      // so the next request just renews again.
      await saveRow(env, row).catch((err) => console.error("[google] save after refresh failed:", err.message));
    }
    return json(
      { accessToken: row.access_token, expiresAt: row.expires_at, scopes: row.scopes, email: row.google_email },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  async function status(request, env) {
    const me = await caller(request, env);
    if (me === undefined) return json({ error: "unavailable" }, { status: 503 });
    if (!me) return json({ connected: false, signedIn: false });
    try {
      const row = await readRow(env, me);
      return json({ connected: !!row, signedIn: true, email: row?.google_email || "", scopes: row?.scopes || "" });
    } catch {
      return json({ error: "unavailable" }, { status: 503 });
    }
  }

  // Revokes the grant at Google too, so nothing usable is left behind.
  async function disconnect(request, env, ctx) {
    const me = await caller(request, env);
    if (!me) return json({ ok: true });
    const row = await readRow(env, me).catch(() => null);
    if (row?.refresh_token) {
      const revoke = fetch(REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: row.refresh_token }),
      }).catch(() => {});
      if (ctx) ctx.waitUntil(revoke);
    }
    try { await deleteRow(env, me); } catch (err) {
      console.error("[google] disconnect delete failed:", err.message);
      return json({ error: "unavailable" }, { status: 503 });
    }
    return json({ ok: true });
  }

  // Routes this module answers, or null for the rest of the Worker.
  return async function handleGoogle(request, url, env, ctx, isHttps) {
    const p = url.pathname;
    if (p === "/api/google/oauth/start") return start(request, url, env, isHttps);
    if (p === "/api/google/oauth/callback") return callback(request, url, env);
    if (p === "/api/google/oauth/status") return status(request, env);
    if (p === "/api/google/oauth/disconnect" && request.method === "POST") return disconnect(request, env, ctx);
    if (p === "/api/google/token") return token(request, env);
    return null;
  };
}
