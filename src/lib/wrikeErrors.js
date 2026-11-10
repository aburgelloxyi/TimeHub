// What a failed Wrike call means, in words a PM can act on. The raw message
// ("Wrike GET /folders?… failed (401): {"error":"not_connected"}") names the
// call that failed, which helps nobody decide what to do next.
export function plainWrikeError(error) {
  const raw = String(error?.message || error || "");
  if (/not_connected|\(401\)|\(403\)|rejected the refresh token/i.test(raw)) {
    return "Your Wrike connection has dropped. Reconnect it from your profile, then try again.";
  }
  if (/\(429\)|rate limit/i.test(raw)) return "Wrike is busy right now. Wait a minute and try again.";
  if (/\(5\d\d\)/.test(raw)) return "Wrike isn't answering at the moment. Try again in a minute.";
  if (/failed to fetch|networkerror|load failed/i.test(raw)) return "Couldn't reach Wrike. Check your internet connection and try again.";
  return raw || "Something went wrong reading Wrike.";
}
