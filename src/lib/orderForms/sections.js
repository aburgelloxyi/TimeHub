// The kinds of work a film's orders come in, offered in the drawer that opens
// beside its poster. International is the per-country order forms read from
// Drive; Domestic and Launches are read from their own sheets (domestic.js,
// launch.js); Titles is still to come. Each wears its own colour in the drawer
// and counts in its own unit.
export const SECTIONS = [
  { id: "international", label: "International", unit: { one: "market", many: "markets" }, from: "#4f46e5", to: "#12a0e1" },
  { id: "domestic", label: "Domestic", unit: { one: "item", many: "items" }, from: "#f59e0b", to: "#f97316" },
  { id: "titles", label: "Titles", unit: { one: "title", many: "titles" }, from: "#f43f5e", to: "#ec4899" },
  { id: "launches", label: "Launches", unit: { one: "market", many: "markets" }, from: "#14b8a6", to: "#22c55e" },
];
