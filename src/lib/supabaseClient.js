import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://oozopadfrupwujsagagn.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vem9wYWRmcnVwd3Vqc2FnYWduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNDg1NjQsImV4cCI6MjA5NzgyNDU2NH0.w0Jny1rCazR4i89zqcarTp9R1VQNkfyyr5gvD5l-6s0";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Ensure an anonymous session exists on load.
// This is a no-op if a session already lives in localStorage.
(async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    await supabase.auth.signInAnonymously();
  }
})();

/**
 * Returns a Set of all wrike_timelog_ids already stored for this user,
 * across ALL sources (tracker + legacy). Used for cross-page dedup on pull.
 */
export async function fetchExistingTimelogIds(wrikeUserId) {
  let query = supabase
    .from("tasks")
    .select("wrike_timelog_id")
    .not("wrike_timelog_id", "is", null);
  if (wrikeUserId) query = query.eq("wrike_user_id", wrikeUserId);
  const { data } = await query;
  return new Set((data ?? []).map((r) => r.wrike_timelog_id));
}

/**
 * Call this once the Wrike user ID is known.
 * Stores it in localStorage (fast path for next load), stamps it
 * onto the anonymous session metadata so RLS policies can read it,
 * and upserts the user's profile into the profiles table.
 */
export async function setWrikeUserId(id, profile = {}) {
  if (!id) return;
  localStorage.setItem("wrike_user_id", id);
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && user.user_metadata?.wrike_user_id !== id) {
      await supabase.auth.updateUser({ data: { wrike_user_id: id } });
    }
  } catch (err) {
    console.warn("Could not update Supabase user metadata:", err.message);
  }
  try {
    // Only include fields that actually have values — never overwrite existing
    // data with nulls if profile info wasn't available at call time.
    const update = { wrike_user_id: id, updated_at: new Date().toISOString() };
    if (profile.firstName) update.first_name = profile.firstName;
    if (profile.lastName) update.last_name = profile.lastName;
    if (profile.email) update.email = profile.email;
    if (profile.avatarUrl) update.avatar_url = profile.avatarUrl;
    await supabase
      .from("profiles")
      .upsert(update, { onConflict: "wrike_user_id" });
  } catch (err) {
    console.warn("Could not upsert profile:", err.message);
  }
}
