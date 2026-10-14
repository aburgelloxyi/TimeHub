// Which of the Control Centre's sections a PM sees, and in what order. Kept
// on their profile, so it follows them between computers.

// Every section, in the order a new PM sees them, and whether it shows to
// begin with. The two cross-cutting lists start hidden so the page opens as
// it always has; a PM adds them.
export const SECTIONS = [
  { id: "overdue", label: "Overdue", on: true },
  { id: "dueSoon", label: "Due this week", on: true },
  { id: "requested", label: "To pick up", on: true },
  { id: "pending", label: "Pending with the market", on: true },
  { id: "toBrief", label: "To brief", on: false },
  { id: "waitingArtwork", label: "Waiting for artwork", on: false },
  { id: "changed", label: "Changed since you looked", on: true },
  { id: "longOverdue", label: "Long overdue", on: true },
  { id: "films", label: "Films", on: true },
];

export const defaultLayout = () => SECTIONS.map(({ id, on }) => ({ id, on }));

// A saved layout made whole: sections it doesn't know are dropped, and ones
// added since it was saved go in at the end, as they start.
export function normaliseLayout(saved) {
  const known = new Map(SECTIONS.map((s) => [s.id, s]));
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(saved) ? saved : []) {
    if (!item || !known.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push({ id: item.id, on: item.on !== false });
  }
  for (const s of SECTIONS) if (!seen.has(s.id)) out.push({ id: s.id, on: s.on });
  return out;
}

// The layout with one section moved up (-1) or down (+1).
export function moveSection(layout, id, by) {
  const at = layout.findIndex((s) => s.id === id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= layout.length) return layout;
  const next = [...layout];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

export const toggleSection = (layout, id) => layout.map((s) => (s.id === id ? { ...s, on: !s.on } : s));
