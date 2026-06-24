import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://oozopadfrupwujsagagn.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vem9wYWRmcnVwd3Vqc2FnYWduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNDg1NjQsImV4cCI6MjA5NzgyNDU2NH0.w0Jny1rCazR4i89zqcarTp9R1VQNkfyyr5gvD5l-6s0";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Ensure an anonymous session exists on load.
// This is a no-op if a session already lives in localStorage.
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    await supabase.auth.signInAnonymously();
  }
})();

/**
 * Call this once the Wrike user ID is known.
 * Stores it in localStorage (fast path for next load) and stamps it
 * onto the anonymous session metadata so RLS policies can read it.
 */
export async function setWrikeUserId(id) {
  if (!id) return;
  localStorage.setItem("wrike_user_id", id);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && user.user_metadata?.wrike_user_id !== id) {
      await supabase.auth.updateUser({ data: { wrike_user_id: id } });
    }
  } catch (err) {
    console.warn("Could not update Supabase user metadata:", err.message);
  }
}
