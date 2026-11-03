// A Domestic wizard sheet: the US cinema pieces for one film, one row per
// physical item at one venue (an indoor banner at a multiplex, a lightbox, a
// floor decal), with its sizes, material and copy. Each tab is one type of
// work (Teaser, Main…), named by the "FilmCode:" and "Type:" cells below its
// rows; the rows above those are the items.
//
// No header names the item columns, so they are read by position, as the sheets
// seen so far lay them out. If the PMs' sheets move a column, this is the place.

const COL = {
  number: 1, venue: 3, city: 4, state: 5, item: 6, material: 7, finishing: 8,
  visible: 9, trim: 10, bleed: 11, copy: 13, date: 14, deadline: 15, timing: 16, size: 20, site: 21,
};

// Text as the sheet shows it, without a formula's error ("#VALUE!" is a size
// the sheet couldn't work out, not a size).
export const sheetText = (v) => {
  const text = String(v ?? "").replace(/[ \t]+/g, " ").trim();
  return /^#(VALUE|REF|N\/A|DIV\/0|NAME|NUM|NULL)[!?]?$/i.test(text) ? "" : text;
};

// A spreadsheet day number as "YYYY-MM-DD"; text that isn't one (ASAP) as itself.
export function sheetDate(v) {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  return sheetText(v);
}

function readTab(rows) {
  const codeAt = rows.findIndex((r) => /^film\s*code:?$/i.test(sheetText(r?.[0])));
  if (codeAt < 0) return null;
  const filmCode = sheetText(rows[codeAt][1]).toUpperCase();
  if (!filmCode) return null;
  const typeRow = rows.find((r) => /^type:?$/i.test(sheetText(r?.[0])));
  const type = typeRow ? sheetText(typeRow[1]) : "";

  const items = [];
  for (const r of rows.slice(0, codeAt)) {
    const venue = sheetText(r[COL.venue]);
    const item = sheetText(r[COL.item]);
    if (!venue || !item) continue;
    const size = sheetText(r[COL.size]);
    const site = sheetText(r[COL.site]);
    items.push({
      venue,
      number: sheetText(r[COL.number]),
      city: sheetText(r[COL.city]),
      state: sheetText(r[COL.state]),
      item,
      material: sheetText(r[COL.material]),
      finishing: sheetText(r[COL.finishing]),
      visible: sheetText(r[COL.visible]),
      trim: sheetText(r[COL.trim]),
      bleed: sheetText(r[COL.bleed]),
      copy: sheetText(r[COL.copy]),
      date: sheetDate(r[COL.date]),
      deadline: sheetDate(r[COL.deadline]),
      timing: sheetText(r[COL.timing]),
      size,
      // The Wrike task the sheet's own import block names for it; none while the size can't be worked out.
      task: size && site ? `${filmCode}_DOM_${type}_${size}_${site}` : "",
    });
  }
  return { filmCode, type, items };
}

// null when no tab has a FilmCode cell: it isn't a Domestic sheet.
export function parseDomestic(sheets, fileName, now = new Date()) {
  const tabs = Object.entries(sheets)
    .map(([name, rows]) => ({ name, read: readTab(rows || []) }))
    .filter((t) => t.read && t.read.items.length > 0)
    .map(({ name, read }) => ({ name, ...read }));
  if (!tabs.length) return null;
  return {
    name: fileName,
    section: "domestic",
    filmCode: tabs[0].filmCode,
    loadedAt: now.toISOString(),
    // The shared store keeps order forms, which all have markets; Domestic has none.
    markets: [],
    domestic: { tabs: tabs.map(({ name, type, items }) => ({ name, type, items })) },
  };
}

export const domesticItems = (file) => (file?.domestic?.tabs || []).flatMap((t) => t.items.map((i) => ({ ...i, type: t.type })));
export const domesticVenues = (file) => new Set(domesticItems(file).map((i) => i.venue.toLowerCase())).size;
