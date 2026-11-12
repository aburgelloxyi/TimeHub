// The films that go by other names (films.aliases), for finding a film in
// Wrike under the name an order sheet uses (findFilm). Read at most once a
// minute; if they can't be read, the last copy, or none.
import { supabase } from "./supabaseClient";

const KEEP_FOR = 60 * 1000;
let held = { at: 0, films: null };

export async function filmAliases() {
  if (held.films && Date.now() - held.at < KEEP_FOR) return held.films;
  try {
    const { data, error } = await supabase.from("films").select("title, aliases").neq("aliases", "{}");
    if (error) throw error;
    held = { at: Date.now(), films: data || [] };
    return held.films;
  } catch {
    return held.films || [];
  }
}

// After an alias is changed on this page, so the next lookup reads it.
export function forgetFilmAliases() {
  held = { at: 0, films: null };
}
