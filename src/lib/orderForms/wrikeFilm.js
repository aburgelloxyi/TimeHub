// The film in Wrike. Its folder there isn't always punctuated the way the
// order sheets name it ("Focker In-Law" for "Focker In Law"), so when the name
// as given finds nothing, folders whose letters and digits are the same are
// tried. On its own, without the browser's Supabase client, so the Worker can
// use it.
import { findFilmLocation } from "../wrikeCampaign";

const lettersOnly = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export function findFilm(byId, filmTitle) {
  const asGiven = findFilmLocation(byId, filmTitle);
  if (asGiven || !lettersOnly(filmTitle)) return asGiven;
  const spellings = [...new Set(Object.values(byId).filter((f) => lettersOnly(f.title) === lettersOnly(filmTitle)).map((f) => f.title))];
  for (const title of spellings) {
    const found = findFilmLocation(byId, title);
    if (found) return found;
  }
  return null;
}
