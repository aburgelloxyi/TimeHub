// The picture on a Client Orders film card, by pasted URL.
//
// One row, one JSON map, keyed by the studio's Drive client id and the film's
// title. Not the Drive file id: that changes when a film's sheets are re-read,
// and the poster would be stranded. Loads fail soft (an unapplied migration
// shows the fallback cards rather than an empty page).
import { supabase } from "./supabaseClient";

// "universal::the odyssey". Case and spacing folded so a title typed two ways is one film.
export function posterKey(clientId, film) {
  const title = String(film ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${String(clientId ?? "").trim()}::${title}`;
}

// A studio's own picture lives in the same map, under its own prefix, so the
// one read and write serve both.
export function studioKey(studioId) {
  return `studio::${String(studioId ?? "").trim().toLowerCase()}`;
}

export async function loadPosters() {
  const { data, error } = await supabase.from("film_posters").select("posters").eq("id", 1).single();
  if (error) return {};
  return (data && data.posters) || {};
}

// Merges into the latest map rather than this screen's copy, so a poster set
// elsewhere since this page loaded survives. Not atomic: two saves in the same
// moment can still lose one.
export async function setPoster(key, url) {
  const current = await loadPosters();
  const next = { ...current };
  const clean = String(url ?? "").trim();
  if (clean) next[key] = clean;
  else delete next[key];
  const { error } = await supabase.from("film_posters").upsert({ id: 1, posters: next }, { onConflict: "id" });
  return { posters: next, error: error ? error.message : null };
}
