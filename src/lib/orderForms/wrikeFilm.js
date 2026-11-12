// The film in Wrike. Its folder there isn't always punctuated the way the
// order sheets name it ("Focker In-Law" for "Focker In Law"), so when the name
// as given finds nothing, folders whose letters and digits are the same are
// tried. On its own, without the browser's Supabase client, so the Worker can
// use it.
import { findFilmLocation } from "../wrikeCampaign";

const lettersOnly = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

function bySpelling(byId, filmTitle) {
  const asGiven = findFilmLocation(byId, filmTitle);
  if (asGiven || !lettersOnly(filmTitle)) return asGiven;
  const spellings = [...new Set(Object.values(byId).filter((f) => lettersOnly(f.title) === lettersOnly(filmTitle)).map((f) => f.title))];
  for (const title of spellings) {
    const found = findFilmLocation(byId, title);
    if (found) return found;
  }
  return null;
}

// `films` is the Films list's films that go by other names ({ title, aliases }).
// A sheet that names a film by one of them ("Angry Birds 3") is looked for in
// Wrike under the film's own title ("Angry Birds 3 Movie").
export function findFilm(byId, filmTitle, films = []) {
  const found = bySpelling(byId, filmTitle);
  if (found) return found;
  const key = lettersOnly(filmTitle);
  if (!key) return null;
  for (const film of films || []) {
    if (!(film.aliases || []).some((alias) => lettersOnly(alias) === key)) continue;
    const viaAlias = bySpelling(byId, film.title);
    if (viaAlias) return viaAlias;
  }
  return null;
}

// Why `alias` can't be added to the film `id`, or "" when it can: it is the
// film's own title, or another film already has it as its title or an alias,
// so a name would lead to two films. Punctuation and case don't count.
export function aliasClash(films, id, alias) {
  const key = lettersOnly(alias);
  if (!key) return "An alias needs at least one letter or digit.";
  for (const film of films || []) {
    const same = lettersOnly(film.title) === key || (film.aliases || []).some((a) => lettersOnly(a) === key);
    if (!same) continue;
    return film.id === id ? `"${alias}" is already this film's name.` : `"${alias}" already names ${film.title}.`;
  }
  return "";
}
