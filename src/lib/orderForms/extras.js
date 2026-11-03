// Domestic and Launch reads sit in the shared store beside the International
// order forms but aren't order forms: they carry a `section` and no markets.
// The International screens only ever see order forms (isOrderFile); these
// reach a film through its code, which the Canvas's film-code table names
// (EBZR is Ebenezer), matched against the film cards' titles.

import { filmKey, studioOf } from "./studios";
import { domesticItems, domesticVenues } from "./domestic";

export const isOrderFile = (file) => !file?.section;

// Two spellings of one film: the same letters, or one the start of the other
// ("Ebenezer" and "Ebenezer: A Christmas Carol"), as long as the shorter is a real name.
export function sameFilmName(a, b) {
  const x = filmKey(a);
  const y = filmKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x));
}

// The film a read belongs to, by name: the code's name when the Canvas knows it, else the code.
export const extraFilm = (extra, codes = {}) => codes[extra.filmCode] || extra.film || extra.filmCode;

// Each read with the film it names and the studio that film is under: the studio of its order forms when
// they are loaded, else the one its file name gave. `alone` when no order form is that film's.
export function placeExtras(files, extras, codes, titleOf) {
  return (extras || []).map((extra) => {
    const name = extraFilm(extra, codes);
    const match = (files || []).find((f) => sameFilmName(titleOf(f), name));
    return { extra, name, studio: match ? studioOf(match) : extra.studio || "dropped", alone: !match };
  });
}

// What a read counts in the drawer, and the line under it.
export function extraSummary(extra) {
  if (extra.section === "domestic") {
    const items = domesticItems(extra).length;
    const venues = domesticVenues(extra);
    return { count: items, detail: `${venues} ${venues === 1 ? "venue" : "venues"}` };
  }
  const { markets = [], pieces = 0 } = extra.launch || {};
  return { count: markets.length, detail: `${pieces} ${pieces === 1 ? "piece" : "pieces"}` };
}
