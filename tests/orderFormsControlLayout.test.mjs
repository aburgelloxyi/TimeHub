import { SECTIONS, defaultLayout, normaliseLayout, moveSection, toggleSection } from "../src/lib/orderForms/controlLayout.js";

check("nothing saved: the default", normaliseLayout(null), defaultLayout());
check("a saved order is kept, unknown sections dropped, new ones added at the end",
  normaliseLayout([{ id: "changed", on: true }, { id: "gone", on: true }, { id: "overdue", on: false }]).map((s) => `${s.id}:${s.on}`).slice(0, 4),
  ["changed:true", "overdue:false", "dueSoon:true", "requested:true"]);
check("every section is there once", normaliseLayout([{ id: "films" }, { id: "films" }]).length, SECTIONS.length);
check("moved up, and not past the top", [moveSection(defaultLayout(), "dueSoon", -1)[0].id, moveSection(defaultLayout(), "overdue", -1)[0].id], ["dueSoon", "overdue"]);
check("shown and hidden", toggleSection(defaultLayout(), "toBrief").find((s) => s.id === "toBrief").on, true);
