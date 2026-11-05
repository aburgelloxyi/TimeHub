// A batch's brief, from the template in its market's Wrike folder description.
// The description starts with a "Job setup" checklist for the PM and a "Delete
// all above" line; what follows is the brief: "Label:" lines (Folder, Master
// PDF's, Master Renders, Specs, Link to the upload server…) whose values are
// filled in, among fixed text (the delivery checklist, separators).
//
// Worked on as a stream of tags and text rather than a DOM, so it runs anywhere
// and whatever markup Wrike uses: a label is found by what its line says, and a
// value is put back in place of what the template had there, leaving every
// other tag (checkboxes, colours, highlights) exactly as Wrike wrote it.

const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "wbr"]);
const BREAKS = new Set(["br", "hr", "p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "tr", "table", "pre"]);
const DROP = new Set(["script", "style", "iframe", "object", "embed", "template"]);

const TOKEN = /<!--[\s\S]*?-->|<\/?([a-zA-Z][\w-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+|</g;

// Tags and text in order. Anything that runs (scripts, event handlers,
// javascript: links) is dropped here, since a brief is shown on the page.
export function tokenize(html) {
  const out = [];
  let skip = null;
  for (const m of String(html || "").matchAll(TOKEN)) {
    const raw = m[0];
    if (raw.startsWith("<!--")) continue;
    if (m[1]) {
      const name = m[1].toLowerCase();
      const close = raw.startsWith("</");
      if (skip) { if (close && name === skip) skip = null; continue; }
      if (DROP.has(name)) { if (!close && !raw.endsWith("/>")) skip = name; continue; }
      const safe = raw
        .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/\s(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, ' $1="#"');
      out.push({ type: "tag", name, close, void: VOID.has(name) || raw.endsWith("/>"), raw: safe });
    } else if (!skip) {
      out.push({ type: "text", raw });
    }
  }
  return out;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const decode = (s) => String(s).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? all);
export const escape = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The lines the tokens make: runs of tokens between line-breaking tags, with
// their text and whether they sit in a list item. Two block tags side by side
// (a <br /> then a <ul>, a </p> then a <p>) leave nothing between them that
// anyone sees as a line, so that isn't one; a blank line is two <br />s in a
// row, or a paragraph with nothing in it.
function linesOf(tokens) {
  const lines = [];
  let from = 0;
  let start = null; // the tag the line began after
  let depth = 0; // open <li>s
  let inLi = false;
  const end = (to) => {
    const text = decode(tokens.slice(from, to).filter((t) => t.type === "text").map((t) => t.raw).join("")).replace(/\s+/g, " ").trim();
    const stop = tokens[to];
    const blank = (start?.name === "br" && stop?.name === "br")
      || (start && stop && !start.close && stop.close && start.name === stop.name && (start.name === "p" || start.name === "div"));
    if (text || blank) lines.push({ from, to, text, inLi });
  };
  tokens.forEach((t, i) => {
    if (t.type === "tag" && BREAKS.has(t.name)) {
      end(i);
      if (t.name === "li") depth += t.close ? -1 : 1;
      inLi = depth > 0;
      from = i + 1;
      start = t;
    }
  });
  end(tokens.length);
  return lines;
}

const LABEL = /^([^:/]*[A-Za-z][^:/]*):(?!\/\/)\s*(.*)$/;
const SEPARATOR = /^[-–—_=*]{4,}$/;
// What the template puts where the PM is meant to write.
const HINT = /^(pm to (edit|update|fill)|edit\/update|tbc|to fill)/i;

export const fieldKey = (label) => String(label).toLowerCase().replace(/[^a-z0-9]+/g, "");

// The template read: its tokens from after "Delete all above" (null when it
// has no such line, then the whole description is the brief), and its fields
// in order, each with where its value sits:
//   inline  on the label's own line, after the colon
//   next    the line under the label (a path under "Master PDF's:")
//   empty   nothing there yet; a value goes on the next line, or after the
//           colon when the label is a list item ("CTA:")
// A label whose next line is a list item that isn't one (the "Delivery
// Checklist:" over its checkboxes) is a heading, not a field.
export function readTemplate(html) {
  let tokens = splitColons(tokenize(html));
  const marker = linesOf(tokens).find((l) => /delete\s*all\s*above/i.test(l.text.replace(/_/g, " ")));
  if (marker) tokens = trimFront(tokens, marker.to);
  const lines = linesOf(tokens);
  const fields = [];
  lines.forEach((line, n) => {
    const m = LABEL.exec(line.text);
    if (!m || m[1].length > 40) return;
    const label = m[1].trim();
    const colon = colonAt(tokens, line);
    if (colon < 0) return;
    const inline = m[2].trim();
    const next = lines[n + 1];
    const nextUsable = next && next.text && !LABEL.test(next.text) && !SEPARATOR.test(next.text) && (!next.inLi || line.inLi);
    if (!inline && next?.inLi && !line.inLi) return; // a heading over a list
    const at = inline
      ? { kind: "inline", from: colon + 1, to: line.to }
      : nextUsable
        ? { kind: "next", from: next.from, to: next.to }
        : { kind: "empty", from: colon + 1, to: colon + 1, inLi: line.inLi };
    const value = inline || (nextUsable ? next.text : "");
    const hint = HINT.test(value) ? value : "";
    fields.push({ key: fieldKey(label), label, value: hint ? "" : value, hint, at });
  });
  return { tokens, fields, trimmed: !!marker };
}

// The tokens from `cut` on, without the closing tags whose openings were cut
// off, and without the blank lines left at the top.
function trimFront(tokens, cut) {
  const kept = [];
  const open = [];
  for (const t of tokens.slice(cut)) {
    if (t.type === "tag" && t.close) {
      const at = open.lastIndexOf(t.name);
      if (at < 0) continue;
      open.splice(at);
    } else if (t.type === "tag" && !t.void) {
      open.push(t.name);
    }
    kept.push(t);
  }
  while (kept.length && ((kept[0].type === "tag" && kept[0].name === "br") || (kept[0].type === "text" && !kept[0].raw.trim()))) kept.shift();
  return kept;
}

// Each text split after its first colon, so a value written in the same text
// as its label ("Folder: abc") is a token of its own. Done once, up front, so
// no position found afterwards moves.
function splitColons(tokens) {
  return tokens.flatMap((t) => {
    const at = t.type === "text" ? t.raw.indexOf(":") : -1;
    return at < 0 || at === t.raw.length - 1 ? [t] : [{ type: "text", raw: t.raw.slice(0, at + 1) }, { type: "text", raw: t.raw.slice(at + 1) }];
  });
}

// The text token holding a label line's colon.
function colonAt(tokens, line) {
  for (let i = line.from; i < line.to; i += 1) if (tokens[i].type === "text" && tokens[i].raw.includes(":")) return i;
  return -1;
}

// What replaces a run of tokens: the new text, and any tag in the run that
// opens or closes outside it, so the rest of the brief keeps its formatting.
function replacement(run, raw) {
  const open = [];
  const strays = [];
  for (const t of run) {
    if (t.type !== "tag" || t.void) continue;
    if (!t.close) { open.push(t); continue; }
    const at = open.map((o) => o.name).lastIndexOf(t.name);
    if (at < 0) strays.push(t); else open.splice(at, 1);
  }
  return [{ type: "text", raw }, ...strays, ...open];
}

// The brief as Wrike will hold it: the template with each value given put in
// its field's place. A field given nothing keeps the template's value, except
// a hint ("PM to edit/update"), which is an instruction and goes.
export function fillTemplate(read, values = {}) {
  const tokens = [...read.tokens];
  // From the last field back, so earlier positions stay where they were.
  for (const f of [...read.fields].sort((a, b) => b.at.from - a.at.from)) {
    const given = values[f.key];
    const value = given != null ? String(given).trim() : f.value;
    if (value === f.value && !f.hint) continue;
    const html = value ? value.split(/\r?\n/).map(escape).join("<br />") : "";
    if (f.at.kind === "empty") {
      if (!value) continue;
      const lead = f.at.inLi ? " " : "<br />";
      // After the label's own closing tags (</b>, </span>), so the value isn't bold too.
      let at = f.at.from;
      while (tokens[at]?.type === "tag" && tokens[at].close && !BREAKS.has(tokens[at].name)) at += 1;
      tokens.splice(at, 0, { type: "text", raw: `${lead}${html}` });
    } else {
      // Inline after the colon, the label's closing tags stay: they close what opened before the colon.
      let from = f.at.from;
      if (f.at.kind === "inline") while (tokens[from]?.type === "tag" && tokens[from].close) from += 1;
      tokens.splice(from, f.at.to - from, ...replacement(tokens.slice(from, f.at.to), f.at.kind === "inline" ? ` ${html}` : html));
    }
  }
  return tokens.map((t) => t.raw).join("");
}

// The batch's own folder, worked out from the masters' path the template
// gives: the same place, with the market's job in place of the masters' and
// the market's folder inside it. "" when there's no masters' path to go by.
export function suggestFolder(read, marketsJob, marketFolder) {
  const path = read.fields.map((f) => f.value).find((v) => /\/Volumes\/.*_Masters(\/|$)/.test(v));
  if (!path || !marketsJob) return "";
  const base = path.replace(/\/[^/]*_Masters(\/.*)?$/, "");
  const market = String(marketFolder || "").replace(/[^\p{L}\p{N}\s()'&._-]/gu, "").trim();
  return [base, marketsJob, market].filter(Boolean).join("/");
}

// What a batch's brief starts as before anyone edits it: the template's values, with the batch's folder where
// the template leaves Folder empty.
export const briefDefaults = (read, suggestion) =>
  Object.fromEntries(read.fields.map((f) => [f.key, f.key === "folder" && !f.value && suggestion ? suggestion : f.value]));

// The description a batch's task gets: its saved values over those defaults.
export const batchDescription = (read, suggestion, saved = {}) => fillTemplate(read, { ...briefDefaults(read, suggestion), ...saved });
