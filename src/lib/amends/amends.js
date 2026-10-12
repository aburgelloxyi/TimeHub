// A campaign's motion amends, read out of the comments on its Wrike jobs.
//
// The studio writes amends as comments on the JOB (the parent task), naming
// the deliverables they are about. `parseAmends` splits one comment into notes
// per deliverable; it is the XYi Toolbox panel's reader (lib/amendNotes.ts
// there), copied, so the two agree on what a filename and a note are. Change
// one, change the other.
//
// `buildAmends` then sorts every naming comment on a campaign's jobs into what
// it is (a review amend, a mech or content amend, a new mech sheet, the
// artist's reply, a hand-off with nothing to say) and keeps only what was
// written once the job was in Motion. Sorting is by wording: Wrike's API has
// no status history, so "in Motion" is the first comment by one of the Motion
// group or the first render posted.

export function amendKey(name) {
  let s = String(name || "").trim();
  const dot = s.lastIndexOf(".");
  if (dot > 0 && s.length - dot <= 5) s = s.substring(0, dot);
  s = s.replace(/_[Vv]\d+_(?:DOUBLE|TRIPLE|QUAD)_RES$/i, "").replace(/_[Vv]\d+$/, "");
  return s.split(/[_ ]+/).filter((t) => t && !/^\d{1,2}x\d{1,2}$/i.test(t)).map((t) => t.toUpperCase()).join("_");
}
const stripLead = (line) => line.replace(/^(?::[a-z0-9_+-]+:|[^\p{L}\p{N}])+/iu, "").trim();
const looksDeliverable = (t) => /(^|_)\d{2,5}x\d{2,5}(px)?(_|$)/i.test(t) && /(^|_)\d+s(ec)?(_|\.|$)/i.test(t);
const baseName = (t) => t.substring(Math.max(t.lastIndexOf("/"), t.lastIndexOf("\\")) + 1);
function isFilename(line) {
  const t = baseName(stripLead(line));
  if ((t.match(/ /g) || []).length > 2) return false;
  return looksDeliverable(t);
}
function namesInLine(line) {
  const words = stripLead(line).split(/\s+/);
  const names = [];
  const shown = [];
  const rest = [];
  let leading = true;
  let lead = true;
  for (const w of words) {
    const name = baseName(w).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (name && looksDeliverable(name)) {
      names.push(name);
      shown.push(baseName(w));
      if (!leading) lead = false;
      continue;
    }
    if (leading && names.length && /^(and|&|\+|,)$/i.test(w)) {
      shown.push(w);
      continue;
    }
    leading = false;
    shown.push(w);
    rest.push(w);
  }
  if (!names.length) return null;
  return { names, note: stripLead(lead ? rest.join(" ") : shown.join(" ")) };
}
function versionOf(name) {
  const m = /_[Vv](\d+)(?:_(?:DOUBLE|TRIPLE|QUAD)_RES)?(?:\.\w{2,4})?$/i.exec(name.trim());
  return m ? parseInt(m[1], 10) : 0;
}
export function parseAmends(text) {
  const byKey = {};
  const general = [];
  const groups = [];
  let group = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      if (group && group.notes.length) group = null;
      continue;
    }
    if (isFilename(line)) {
      if (!group || group.notes.length) {
        group = { names: [], notes: [] };
        groups.push(group);
      }
      group.names.push(baseName(stripLead(line)));
      continue;
    }
    const inline = namesInLine(line);
    if (inline) {
      if (!group || group.notes.length) {
        group = { names: [], notes: [] };
        groups.push(group);
      }
      group.names.push(...inline.names);
      if (inline.note) group.notes.push(inline.note);
      continue;
    }
    const note = stripLead(line);
    if (!note) continue;
    if (group) group.notes.push(note);
    else general.push(note);
  }
  for (const g of groups) {
    if (!g.notes.length) continue;
    const note = g.notes.join("\n");
    for (const name of g.names) {
      const k = amendKey(name);
      (byKey[k] = byKey[k] || []).push({ text: note, version: versionOf(name), name });
    }
  }
  return { byKey, general };
}

// The CREATIVE is the token left of the artwork type (`SF_INTL_Trio_DOOH_…`
// is Trio). A legacy name spends that slot on `DGTL` and names none.
export function creativeOfName(name) {
  const toks = String(name || "").split(/[_ ]+/);
  if (toks.length < 5) return "";
  const c = toks[2];
  if (!c || /^DGTL$/i.test(c) || /^\d+x\d+/i.test(c)) return "";
  return c;
}

// The MARKET is the token straight after the length (`…_10s_DK`). Never OV.
export function marketOfName(name) {
  const toks = String(name || "").replace(/\.[A-Za-z0-9]{2,4}$/, "").split(/[_ ]+/);
  for (let i = 0; i < toks.length - 1; i++) {
    if (!/^\d{1,3}s(?:ec)?$/i.test(toks[i])) continue;
    const t = toks[i + 1];
    return /^[A-Za-z]{2,3}$/.test(t) && t.toUpperCase() !== "OV" ? t.toUpperCase() : "";
  }
  return "";
}

// A comment with paths, filenames and icons taken off: what somebody SAID.
function sayable(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) =>
      line
        .split(/\s+/)
        .filter((w) => {
          const bare = w.replace(/^[^\w/\\]+|[^\w]+$/g, "");
          if (/^(\/Volumes\/|\\\\|[A-Z]:\\)/i.test(bare) || /\/[^/\s]+\/[^/\s]+/.test(bare)) return false;
          return !looksDeliverable(bare.split(/[\\/]/).pop());
        })
        .join(" ")
        .replace(/:[a-z0-9_+-]+:/gi, "")
        .replace(/[^\p{L}\p{N}\p{P}\p{Zs}$€£%+=<>|'"`~^]/gu, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean)
    .join("\n");
}

// Words that say nothing by themselves: a comment made only of these and
// filenames is a hand-off.
const FILLER = /^(hey|hi|hello|thanks|thank|you|cheers|please|below|above|attached|here|are|is|the|for|and|motion|dooh|dinth|dfoh|renders?|pdfs?|mc|ec|x\d+|new|old|review|ready|all|both|good|morning|afternoon|to|of|in|on|with|these|this|a|an|updated?|revised|amends?|amended|check|content|approved?|team|guys|done|now|up|as|per|be|can|we|have|been|ta|thanking|kindly|let|me|know|if|any|issues|folder|links?|files?|versions?|v\d+)$/i;
const substance = (text) =>
  (text.replace(/@\p{L}+(\s\p{Lu}\p{L}+)?/gu, "").match(/\p{L}{2,}/gu) || []).filter((w) => !FILLER.test(w)).length;

export const THEMES = [
  ["CTA / date", "CTA", /\bcta\b|\bdate\b|in cinemas|only in|coming soon|out now|\bpost\b/i],
  ["Title treatment", "TT", /\btt\b|title treatment|title\b|logo/i],
  ["File name / legend", "Name", /file ?name|legend|description:|rename|naming/i],
  ["Size / spec", "Spec", /\bsize\b|resolution|pixel|dimension|aspect|spec\b|bitrate|file size|\bfps\b|duration|length|seconds|too long|too short/i],
  ["Layout / position", "Layout", /position|tight|higher|lower|too high|too low|move|align|centre|center|spacing|margin|crop|safe|edge|overlap|cut off|bleed|scale|bigger|smaller|follow the pdf|match the pdf/i],
  ["Animation / timing", "Animation", /animat|timing|poking|\bpops?\b|flash|glitch|jump|stutter|\bloops?\b|transition|\bfade|\bhold|freeze|\bframes?\b|before coming in|\beas(e|ing)\b|speed/i],
  ["Artwork / colour", "Artwork", /colou?r|artwork|image|rating|bug\b|bugs\b|billing|credit|legal|copy\b|text\b|font|translation|typo|spelling|hard line|darken|bright|dull|mucky/i],
];
const themesOf = (text) => THEMES.filter((t) => t[2].test(text)).map((t) => t[0]);

export const KINDS = {
  review: "Review amend",
  content: "Mech / content amend",
  pdf: "New mech sheet",
  fix: "Artist's reply",
  question: "Question",
};

const RENDER = /\/Renders\/[^\n]*\.mov|_V\d+(_(DOUBLE|TRIPLE|QUAD)_RES)?\.mov/i;

function kindOf(comment, whole, maxVersion, byMotion) {
  const text = comment.text;
  const hasRender = /\/Renders\//i.test(text);
  const hasPdf = /\/PDFs?\//i.test(text) || /\.pdf\b/i.test(text);
  const said = substance(whole);
  const asks = /amend|\bfix|should|wrong|incorrect|doesn.?t|\bstill\b|can you|can we|could you|needs? to|missing|instead/i;
  let kind;
  if (/^\s*(AMENDS|CTA|LEGEND|FILE NAME|DATE|TT)\s*$/m.test(text)) kind = "content";
  else if (said < 3) kind = hasPdf && /amend/i.test(text) && maxVersion >= 2 ? "pdf" : "handoff";
  else if (
    /(amended|revised|updated) renders?|amends? (are |is )?(in|done)|\bfixed\b|\bi('ve| have)\b.*(changed|fixed|updated|adjusted|moved|amended)|\bnow (matches|fixed|correct)/i.test(whole) &&
    (hasRender || maxVersion >= 2 || /\.mov\b/i.test(text))
  ) kind = "fix";
  else if (/\?\s*$/m.test(whole) && !/please|can you|could you|needs?|should|fix|amend/i.test(whole)) kind = "question";
  else if ((hasRender || /_Delivery|Masters?:/i.test(text)) && /\bx\s?\d+\b/i.test(whole) && !asks.test(whole)) kind = "handoff";
  else if (hasRender && said < 6 && !/amend|fix|please|should|needs?|wrong|incorrect|missing/i.test(whole)) kind = "handoff";
  else kind = "review";
  // One of the Motion group naming deliverables is answering, not asking.
  if (kind === "review" && byMotion) kind = "fix";
  if (kind === "review" && /\bmasv\b|uploaded to (ent|puma)|delivery report/i.test(whole) && !/amend|\bfix|please (move|change|nudge|darken|reduce|increase)/i.test(whole)) kind = "handoff";
  return kind;
}

const cleanPerson = (name) => String(name || "Somebody").replace(/[^\p{L}\p{Zs}'-]/gu, "").trim() || "Somebody";

/**
 * Every amend note on a campaign's jobs.
 *
 *   jobs      [{ id, title, permalink, subTaskIds }]
 *   subs      { subtaskId: { title, statusName } }
 *   comments  { jobId: [{ authorId, text, at }] }
 *   people    { contactId: name }
 *   motionIds contact ids of Wrike's Motion group
 *
 * `pre` marks a note written before its job was in Motion; the view hides
 * those unless asked.
 */
export function buildAmends({ jobs = [], subs = {}, comments = {}, people = {}, motionIds = [] }) {
  const isMotion = (id) => motionIds.indexOf(id) !== -1;
  const notes = [];
  let handoffs = 0;

  for (const job of jobs) {
    const list = (comments[job.id] || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const motionFrom = list.filter((c) => isMotion(c.authorId) || RENDER.test(c.text)).map((c) => String(c.at))[0] || "";
    const statusByKey = {};
    for (const id of job.subTaskIds || []) if (subs[id]) statusByKey[amendKey(subs[id].title)] = subs[id].statusName || "";

    for (const c of list) {
      const parsed = parseAmends(c.text);
      const keys = Object.keys(parsed.byKey);
      if (!keys.length) continue;
      const whole = sayable(c.text);
      const named = keys.reduce((all, k) => all.concat(parsed.byKey[k]), []);
      const maxVersion = Math.max(0, ...named.map((n) => n.version), ...(c.text.match(/_V(\d+)/gi) || []).map((v) => parseInt(v.slice(2), 10)));
      const kind = kindOf(c, whole, maxVersion, isMotion(c.authorId));
      if (kind === "handoff") { handoffs++; continue; }

      for (const key of keys) {
        const first = parsed.byKey[key][0];
        let text = sayable(parsed.byKey[key].map((n) => n.text).filter((v, i, a) => a.indexOf(v) === i).join("\n"));
        if (substance(text) < 2) text = whole;
        if (kind === "pdf") text = `A new version of the mech sheet (V${maxVersion}) was sent to be matched.` + (substance(whole) >= 2 ? "\n" + whole : "");
        const name = first.name.replace(/\.[A-Za-z0-9]{2,4}$/, "").replace(/_V\d+(_(DOUBLE|TRIPLE|QUAD)_RES)?$/i, "");
        const toks = name.split("_");
        const sizeAt = toks.findIndex((t) => /^\d{2,5}x\d{2,5}(px)?$/i.test(t));
        notes.push({
          id: `${job.id}:${c.id || c.at}:${key}`,
          jobId: job.id,
          job: job.title,
          link: job.permalink || "",
          kind,
          at: c.at,
          who: cleanPerson(people[c.authorId]),
          motion: isMotion(c.authorId),
          pre: !motionFrom || String(c.at) < motionFrom,
          creative: creativeOfName(name) || "Other",
          market: marketOfName(name),
          name,
          site: sizeAt > 4 ? toks.slice(4, sizeAt).join(" ") : "",
          size: sizeAt >= 0 ? toks[sizeAt].replace(/px$/i, "") : "",
          length: toks.find((t) => /^\d+s(ec)?$/i.test(t)) || "",
          medium: toks[3] || "",
          version: first.version || 0,
          text,
          themes: themesOf(text),
          status: statusByKey[key] || "",
        });
      }
    }
  }

  // A reply that quotes the amend it answers is the reply, not a second amend.
  const said = {};
  notes
    .slice()
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))
    .forEach((n) => {
      if (n.kind !== "review" && n.kind !== "content") return;
      const k = `${n.jobId}\n${n.name}\n${n.text.replace(/\s+/g, " ").toLowerCase()}`;
      if (said[k] && said[k] !== n.who) n.kind = "fix";
      else if (!said[k]) said[k] = n.who;
    });

  return { notes, handoffs, jobs: jobs.length };
}
