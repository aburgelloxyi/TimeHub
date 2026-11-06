// The kinds of work a film's orders come in, offered in the drawer that opens
// beside its poster. International is the per-country order forms read from
// Drive; Domestic and Launches are read from their own sheets (domestic.js,
// launch.js); Titles is still to come. Each counts in its own unit and has two
// sets of colours: `from`/`to`, bright, for its figures on the drawer's dark
// glass, and `fillFrom`/`fillTo`, deep enough to carry white text (4.5:1 or
// better) wherever it's a background: the drawer's sweep, a view's band, pills.
export const SECTIONS = [
  { id: "international", label: "International", unit: { one: "market", many: "markets" }, from: "#6366f1", to: "#12a0e1", fillFrom: "#4338ca", fillTo: "#0369a1" },
  { id: "domestic", label: "Domestic", unit: { one: "item", many: "items" }, from: "#f59e0b", to: "#f97316", fillFrom: "#b45309", fillTo: "#c2410c" },
  { id: "titles", label: "Titles", unit: { one: "title", many: "titles" }, from: "#f43f5e", to: "#ec4899", fillFrom: "#be123c", fillTo: "#be185d" },
  { id: "launches", label: "Launches", unit: { one: "market", many: "markets" }, from: "#14b8a6", to: "#22c55e", fillFrom: "#0f766e", fillTo: "#15803d" },
];

// Enterprise Uploads: a film's rows in its studio's uploads sheet (enterpriseUploads.js). Not one of SECTIONS,
// which are read per film from Drive; it shows in the drawer only for a studio that keeps such a sheet.
export const UPLOADS = { id: "uploads", label: "Uploads", unit: { one: "upload", many: "uploads" }, from: "#a78bfa", to: "#22d3ee", fillFrom: "#6d28d9", fillTo: "#0e7490" };
