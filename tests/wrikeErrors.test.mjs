import { plainWrikeError } from "../src/lib/wrikeErrors.js";

const reconnect = "Your Wrike connection has dropped. Reconnect it from your profile, then try again.";
check("not connected", plainWrikeError(new Error('Wrike GET /folders?fields=%5BchildIds%5D failed (401): {"error":"not_connected"}')), reconnect);
check("a refused token", plainWrikeError("Wrike rejected the refresh token: 400"), reconnect);
check("rate limited", plainWrikeError("Wrike GET /folders failed (429)"), "Wrike is busy right now. Wait a minute and try again.");
check("Wrike down", plainWrikeError("Wrike GET /folders failed (503): upstream"), "Wrike isn't answering at the moment. Try again in a minute.");
check("offline", plainWrikeError(new TypeError("Failed to fetch")), "Couldn't reach Wrike. Check your internet connection and try again.");
check("anything else is passed on", plainWrikeError("No “Sony” folder found"), "No “Sony” folder found");
check("nothing at all", plainWrikeError(null), "Something went wrong reading Wrike.");
