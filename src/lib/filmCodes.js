// The discovered film-code dictionary (wrike_sync_meta.film_code_mappings) and
// the hand edits on top of it (film_code_overrides: a name sets a code, null
// removes it). Edits are reapplied after every merge, so discovery never
// undoes them.
import { FILM_MAPPINGS } from "../constants.js";

export function mergeFilmMappings(existing = {}, found = {}, overrides = {}) {
  const out = { ...existing, ...found };
  for (const [code, name] of Object.entries(overrides || {})) {
    if (name) out[code] = name;
    else delete out[code];
  }
  return out;
}

// Every code and the film it names: the hardcoded codes (constants.js) over
// what the scans found, and hand edits over both, so a hardcoded name can be
// corrected from the Codes panel without a deploy.
export function filmCodeTable(dictionary = {}, overrides = {}) {
  return mergeFilmMappings({ ...dictionary, ...FILM_MAPPINGS }, {}, overrides);
}

export const normalizeFilmCode = (code) => String(code || "").trim().toUpperCase();

// Codes the way the scans find them: 2-8 letters and digits, starting with a letter.
export const isFilmCode = (code) => /^[A-Z][A-Z0-9]{1,7}$/.test(code);
