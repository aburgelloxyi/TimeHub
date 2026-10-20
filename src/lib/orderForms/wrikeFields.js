// The custom fields a briefed order's Wrike task is given, from the sheet's
// "XYi USE ONLY [for import purposes]" columns: what the old Excel upload
// filled in. Fields are found by title, as Job Number and Order Form are.
// Artworker and File path are left for people to fill as the work happens.

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Each field, and where its value comes from. `context.jobNumber` is the
// film's Markets folder title, which is what the job number field holds.
// `batch` puts it on the batch task too: true for the same value, "earliest"
// for the soonest of its orders' dates, the one the batch has to meet.
export const BRIEF_FIELDS = [
  { title: "Job Number", from: (_, context) => context.jobNumber, batch: true },
  { title: "Market Deadline", from: (o) => o.xyi?.marketDeadline, batch: "earliest" },
  { title: "Department", from: (o) => o.xyi?.department },
  { title: "Aspect ratio", from: (o) => o.xyi?.aspectRatio },
  { title: "Art", from: (o) => o.xyi?.art || o.artwork },
  { title: "Format", from: (o) => o.xyi?.xyiFormat },
  { title: "Quote", from: (o) => o.xyi?.quote },
  { title: "Reporting", from: (o) => o.xyi?.reporting },
];

// The account's field for each title in BRIEF_FIELDS. Wrike lets each space
// make its own field with a title another already has (there are two "File
// path"s), so where a title is taken twice the one the market's existing
// tasks use (`inUse`, field id → how many) is picked, else the first.
export function resolveFields(accountFields, inUse = {}) {
  const out = {};
  for (const { title } of BRIEF_FIELDS) {
    const same = (accountFields || []).filter((f) => norm(f.title) === norm(title));
    if (!same.length) continue;
    out[title] = same.reduce((best, f) => ((inUse[f.id] || 0) > (inUse[best.id] || 0) ? f : best), same[0]);
  }
  return out;
}

// How often each field is filled on these tasks.
export function fieldUse(tasks) {
  const use = {};
  for (const t of tasks || []) for (const c of t.customFields || []) if (c.value) use[c.id] = (use[c.id] || 0) + 1;
  return use;
}

// A field's options, matched without regard to case or spacing.
const optionOf = (field, value) => {
  const options = field.settings?.values || [];
  return options.find((o) => norm(o) === norm(value));
};

// A sheet value as the field takes it. { value } or { refused: reason } or
// null when there is nothing to set.
export function fieldValue(field, raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  switch (field.type) {
    case "Text":
      return { value: text };
    case "Numeric": {
      const n = Number(text.replace(",", "."));
      return Number.isFinite(n) ? { value: String(n) } : { refused: `"${text}" isn't a number` };
    }
    case "Date":
      return /^\d{4}-\d{2}-\d{2}$/.test(text) ? { value: text } : { refused: `"${text}" isn't a date` };
    case "DropDown": {
      const option = optionOf(field, text);
      return option ? { value: option } : { refused: `"${text}" isn't one of its options` };
    }
    case "Multiple": {
      const picked = text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
      const options = picked.map((p) => optionOf(field, p));
      const unknown = picked.filter((_, i) => !options[i]);
      return unknown.length ? { refused: `"${unknown.join('", "')}" ${unknown.length === 1 ? "isn't one of its options" : "aren't among its options"}` } : { value: JSON.stringify(options) };
    }
    default:
      return { refused: `it's a ${field.type} field, which isn't filled from the sheet` };
  }
}

// A value set in the preview for the whole batch: `raw` as fieldValue takes
// it, and `all` to use it on every order rather than only where the sheet
// gives nothing Wrike will take. It never goes back to the sheet.

// What briefing `orders` would fill in. { byKey: { orderKey: [{ id, value }] },
// batch: [{ id, value }] (see `batch` in BRIEF_FIELDS), filled: [title], missing: [title] (no such field in
// Wrike), refused: [{ title, reason, rows }], summary }. A value a field won't
// take is left out and reported; the rest of the order's fields are still
// set. `summary` is, per field, what the sheet alone gives: its distinct
// values, and how many orders it leaves empty or gives a refused value.
export function planFields(orders, { fields, jobNumber, keyOf, overrides = {} }) {
  const byKey = {};
  const filled = new Set();
  const missing = [];
  const refused = new Map();
  const batch = [];
  const summary = [];
  for (const spec of BRIEF_FIELDS) {
    const field = fields[spec.title];
    if (!field) {
      missing.push(spec.title);
      summary.push({ title: spec.title, field: null, values: [], empty: 0, refused: 0 });
      continue;
    }
    const own = overrides[spec.title];
    const set = own?.raw ? fieldValue(field, own.raw) : null;
    const usable = set?.value ? set : null;
    const values = new Set();
    const given = []; // what each order is given, for the batch's earliest
    let empty = 0;
    let wrong = 0;
    for (const o of orders) {
      const fromSheet = fieldValue(field, spec.from(o, { jobNumber }));
      if (!fromSheet) empty++;
      else if (fromSheet.refused) wrong++;
      else values.add(fromSheet.value);
      const got = usable && (own.all || !fromSheet || fromSheet.refused) ? usable : fromSheet;
      if (!got) continue;
      if (got.refused) {
        const at = `${spec.title}|${got.refused}`;
        refused.set(at, { title: spec.title, reason: got.refused, rows: [...(refused.get(at)?.rows || []), o.row] });
        continue;
      }
      (byKey[keyOf(o)] ||= []).push({ id: field.id, value: got.value });
      given.push(got.value);
      filled.add(spec.title);
    }
    if (spec.batch === "earliest") {
      // Dates are YYYY-MM-DD, so the smallest string is the soonest.
      if (given.length) batch.push({ id: field.id, value: given.reduce((a, b) => (b < a ? b : a)) });
    } else if (spec.batch) {
      const fromSheet = fieldValue(field, spec.from(null, { jobNumber }));
      const got = usable && (own.all || !fromSheet?.value) ? usable : fromSheet;
      if (got?.value) batch.push({ id: field.id, value: got.value });
    }
    summary.push({ title: spec.title, field, values: [...values], empty, refused: wrong });
  }
  return { byKey, batch, filled: [...filled], missing, refused: [...refused.values()], summary };
}
