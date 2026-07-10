// All Wrike API calls go through the Worker proxy at /api/wrike/* instead of
// hitting wrike.com directly. The Worker attaches the member's OAuth access
// token (refreshing it when needed) — the browser never sees it.

export function startWrikeOAuth() {
  window.location.href = "/api/wrike/oauth/start";
}

export async function disconnectWrike() {
  await fetch("/api/wrike/oauth/disconnect", { method: "POST" });
}

export async function fetchWrikeOAuthStatus() {
  try {
    const res = await fetch("/api/wrike/oauth/status");
    if (!res.ok) return { connected: false };
    return await res.json();
  } catch (_) {
    return { connected: false };
  }
}
