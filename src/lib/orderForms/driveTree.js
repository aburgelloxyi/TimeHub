// The clients' Drive folders, read as the PMs see them: a client's folder
// holds one folder per market, and each market folder holds one order sheet
// per film and medium ("FID_Motion_Outdoor", "Street Fighter - Print and
// Digital Outdoor"). Pure helpers; the network calls are in googleApi.js.

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();

export const CLIENTS = [
  { id: "universal", label: "Universal", folderId: "1HXwSdQN19Fpg8kACsb57m4a2axEr5an3" },
  { id: "paramount", label: "Paramount", folderId: "1OL4IrlKTAO7gUhOYUY7MWRa8ZAU0qxk-" },
];

export const clientFor = (id) => CLIENTS.find((c) => c.id === id) || null;

const MEDIUM_LABEL = { motion: "Motion", print: "Print" };

// The film and medium a sheet's name gives, or null for a spreadsheet that
// isn't an order form (spec lists, cleaning data). The film is everything
// before the medium word, so both clients' naming is read the same way.
export function sheetFilm(fileName) {
  const text = String(fileName ?? "").replace(/\.xlsx$/i, "").replace(/^(copy of\s+)+/i, "").trim();
  const found = /^(.+?)[\s_-]+(motion|dooh|print)(?=[\s_-]|$)/i.exec(text);
  if (!found) return null;
  return { film: found[1].trim(), medium: /print/i.test(found[2]) ? "print" : "motion" };
}

// A folder the clients keep beside the markets that isn't one: for trying
// things out ("AA_Test_Market"), a working copy ("Copy of _StandardSizes"),
// or a template or reference sheet, which they start with an underscore.
// Left out of every film. Markets are named for their country with its code
// ("Chile (CHI)"), so none of these patterns is one.
export const isTestFolder = (folderName) => {
  const name = String(folderName ?? "").trim();
  return /(^|[^a-z])test([^a-z]|$)/i.test(name)
    || /^copy of\b/i.test(name)
    || /^_/.test(name)
    || /template|standard\s*sizes/i.test(name);
};

// "BULGARIA (BG)" → "Bulgaria (BG)". Names already in mixed case are kept.
export function marketName(folderName) {
  const text = String(folderName ?? "").trim();
  const [, bare, code = ""] = /^(.*?)(\s*\([^)]*\))?$/.exec(text);
  if (bare !== bare.toUpperCase()) return text;
  return bare.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase()) + code;
}

const newer = (a, b) => String(b.modifiedTime || "") > String(a.modifiedTime || "");

// Every film with an order sheet in at least one market folder.
//
// `folders` are the market folders, `sheets` the spreadsheets directly inside
// them (each with `parents`), `names` the film codes the app knows
// (FILM_MAPPINGS), so "FID" is listed as "Forgotten Island". A market with two
// sheets for one film and medium (a copy beside the original) gives the most
// recently changed.
export function filmsIn(folders, sheets, names = {}) {
  const folderById = new Map((folders || []).map((f) => [f.id, f]));
  const films = new Map();
  for (const sheet of sheets || []) {
    const folder = (sheet.parents || []).map((id) => folderById.get(id)).find(Boolean);
    const found = sheetFilm(sheet.name);
    if (!folder || !found) continue;
    const title = names[found.film.toUpperCase()] || found.film;
    const key = `${norm(title)}|${found.medium}`;
    if (!films.has(key)) {
      films.set(key, { key, title, medium: found.medium, label: `${title} · ${MEDIUM_LABEL[found.medium]}`, byFolder: new Map() });
    }
    const { byFolder } = films.get(key);
    const seen = byFolder.get(folder.id);
    if (!seen || newer(seen, sheet)) byFolder.set(folder.id, sheet);
  }
  return [...films.values()]
    .map(({ byFolder, ...film }) => ({
      ...film,
      markets: [...byFolder]
        .map(([folderId, sheet]) => ({ name: marketName(folderById.get(folderId).name), folderId, sheet }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// Whether a loaded film is still what the studio's Drive folders hold. Films
// that have run their course are cleared out of the market folders, so a film
// with no sheets left is finished, and one with most of them gone is on its
// way. `driveFilms` is that studio's films as listed now (filmsIn).
//   null                                   still there, or not a Drive film
//   { gone: true }                         no sheet for it anywhere
//   { left, had }                          fewer than half its markets remain
//   { left, typical }                      it was already down to a handful
//                                          when it was loaded, against the
//                                          studio's fullest film
export function driveStaleness(file, driveFilms) {
  if (!file?.source?.clientId || !driveFilms) return null;
  const now = driveFilms.find((f) => f.key === file.source.filmKey);
  if (!now) return { gone: true };
  const had = file.markets.length;
  const left = now.markets.length;
  if (had >= 4 && left < had / 2) return { left, had };
  const typical = Math.max(...driveFilms.map((f) => f.markets.length));
  return left <= 3 && typical >= 12 ? { left, typical } : null;
}
