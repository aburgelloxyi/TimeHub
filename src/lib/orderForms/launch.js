// A Launch order form: one artwork (a teaser one-sheet, say) and each market's
// answer to the Google Form about it. A market says which formats it needs,
// gives its own versions of the artwork's lines (the date line, the tagline)
// and whether they are literal, and its social handles. The form's questions
// are the artwork's English lines, so they are read from the header rather
// than assumed.
//
// A market can answer more than once; its newest answer is the one that counts.
//
// The workbook's Wrike_Import tab lists a task per market and format. Its
// Country and Format columns are checked against each task's title, since a
// tab that drifts out of line would put the wrong market on a task.

import { CLIENTS } from "./driveTree";
import { EXTRA_STUDIOS } from "./studios";
import { sheetText } from "./domestic";

const header = (rows) => (rows?.[0] || []).map(sheetText);

// A form's timestamp (a spreadsheet day number with a time) as "YYYY-MM-DDTHH:MM".
const stamp = (v) => (typeof v === "number" ? new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 16) : sheetText(v));

// "Belgium - French", "Belgium-French" and "BELGIUM FRENCH" are one market.
export const marketKey = (name) => String(name || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m) => m.toUpperCase());

function readReplies(rows) {
  const head = header(rows);
  const col = (re) => head.findIndex((h) => re.test(h));
  const at = col(/^timestamp$/i);
  const market = col(/market/i);
  const formats = col(/format/i);
  const literal = col(/literal/i);
  const socials = col(/social/i);
  if (market < 0 || formats < 0) return null;
  const own = new Set([at, market, formats, literal, socials]);
  const lines = head.map((h, i) => i).filter((i) => !own.has(i) && head[i]);
  return rows.slice(1).filter((r) => sheetText(r[market])).map((r) => ({
    market: sheetText(r[market]),
    at: stamp(r[at]),
    formats: sheetText(r[formats]).split(/\s*,\s*/).filter(Boolean),
    lines: lines.map((i) => ({ asked: head[i], text: sheetText(r[i]) })),
    literal: literal >= 0 ? sheetText(r[literal]) : "",
    socials: socials >= 0 ? sheetText(r[socials]) : "",
  }));
}

// The newest answer per market, with how many it replaced and what they said differently.
export function latestReplies(replies) {
  const by = new Map();
  for (const r of replies) {
    const key = marketKey(r.market);
    by.set(key, [...(by.get(key) || []), r]);
  }
  return [...by.values()].map((list) => {
    const sorted = [...list].sort((a, b) => a.at.localeCompare(b.at));
    const latest = sorted[sorted.length - 1];
    const before = sorted[sorted.length - 2];
    const changed = !before ? [] : [
      ...(before.formats.join("|") !== latest.formats.join("|") ? ["formats"] : []),
      ...latest.lines.filter((l, i) => before.lines[i]?.text !== l.text).map((l) => l.asked),
      ...(before.literal !== latest.literal ? ["literal"] : []),
    ];
    return { ...latest, replaced: sorted.length - 1, changed };
  }).sort((a, b) => a.market.localeCompare(b.market));
}

// The format a task's title says it is, in the import tab's words.
const formatOfTitle = (title) => (/_Insta_/i.test(title) ? "Instas" : /_Print_/i.test(title) ? "Print Mech" : "Digital Mech");

export function checkImport(rows, filmCode) {
  const at = (rows || []).findIndex((r) => r.map(sheetText).includes("Title") && r.map(sheetText).includes("Country"));
  if (at < 0) return null;
  const head = rows[at].map(sheetText);
  const title = head.indexOf("Title");
  const country = head.indexOf("Country");
  const format = head.indexOf("Format");
  const tasks = rows.slice(at + 1)
    .map((r) => ({ title: sheetText(r[title]), country: sheetText(r[country]), format: format >= 0 ? sheetText(r[format]) : "" }))
    .filter((t) => t.title && (!filmCode || t.title.toUpperCase().startsWith(`${filmCode}_`)));
  const offCountry = tasks.filter((t) => !t.title.endsWith(`_${t.country}`));
  const offFormat = format < 0 ? [] : tasks.filter((t) => t.format !== formatOfTitle(t.title));
  return {
    tasks: tasks.length,
    offCountry: offCountry.length,
    offFormat: offFormat.length,
    examples: [...new Set([...offCountry, ...offFormat])].slice(0, 3),
  };
}

// null when there is no form-responses tab with a market and a formats question: it isn't a Launch form.
export function parseLaunch(sheets, fileName, now = new Date()) {
  const formTab = Object.keys(sheets).find((n) => /^form responses/i.test(n));
  const replies = formTab ? readReplies(sheets[formTab]) : null;
  if (!replies || !replies.length) return null;

  const base = String(fileName || "").replace(/\.xlsx$/i, "");
  const importTab = Object.keys(sheets).find((n) => /wrike/i.test(n) && /import/i.test(n));
  const importRows = importTab ? sheets[importTab] : [];
  const cell = (re) => sheetText(importRows.find((r) => re.test(sheetText(r?.[0])))?.[1]);
  const filmCode = (cell(/^film\s*code$/i) || /^([A-Za-z0-9]{2,8})\b/.exec(base)?.[1] || "").toUpperCase();
  // "EBZR _ Paramount - CANDLE SMOKE - Launch Order Form": the artwork is the part between the studio and the form.
  const parts = base.split(/\s+-\s+/);
  const artwork = parts.length >= 3 ? titleCase(parts[1]) : cell(/^artwork$/i);
  const studio = [...CLIENTS, ...EXTRA_STUDIOS].find((s) => new RegExp(`\\b${s.label}\\b`, "i").test(base))?.id || "";

  const markets = latestReplies(replies);
  return {
    name: fileName,
    section: "launches",
    filmCode,
    studio,
    loadedAt: now.toISOString(),
    // The shared store keeps order forms, which all have markets; a launch's are kept as answers, below.
    markets: [],
    launch: {
      artwork,
      replies: replies.length,
      markets,
      pieces: markets.reduce((n, m) => n + m.formats.length, 0),
      import: importTab ? checkImport(importRows, filmCode) : null,
    },
  };
}
