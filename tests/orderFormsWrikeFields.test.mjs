import { resolveFields, fieldUse, fieldValue, planFields } from "../src/lib/orderForms/wrikeFields.js";

// As Wrike lists them (titles and types from the account).
const account = [
  { id: "JN", title: "Job Number", type: "Text" },
  { id: "MD", title: "Market Deadline", type: "Date" },
  { id: "DP", title: "Department", type: "Multiple", settings: { values: ["Print", "Asset Management", "Motion"] } },
  { id: "AR", title: "Aspect ratio", type: "Numeric" },
  { id: "ART", title: "Art", type: "Text" },
  { id: "FM", title: "Format", type: "Multiple", settings: { values: ["Digital Mech", "Print Mech"] } },
  { id: "Q", title: "Quote", type: "DropDown", settings: { values: ["Approved", "Pending"] } },
  { id: "RP", title: "Reporting", type: "DropDown", settings: { values: ["Yes", "No"] } },
  { id: "FP1", title: "File path", type: "Text" },
];

check("each brief field found by title", Object.keys(resolveFields(account)).length, 8);
check("of two fields with one title, the one the market's tasks use",
  resolveFields([{ id: "A", title: "Art", type: "Text" }, { id: "B", title: "Art", type: "Text" }], fieldUse([{ customFields: [{ id: "B", value: "x" }] }])).Art.id, "B");

check("values as each type takes them", [
  fieldValue(account[0], " XY1_Markets "), fieldValue(account[3], "2,13"), fieldValue(account[1], "2026-10-13"),
  fieldValue(account[6], "approved"), fieldValue(account[2], "Print, Asset Management"), fieldValue(account[6], ""),
], [{ value: "XY1_Markets" }, { value: "2.13" }, { value: "2026-10-13" }, { value: "Approved" }, { value: '["Print","Asset Management"]' }, null]);
check("a value a dropdown doesn't offer is refused", fieldValue(account[6], "Maybe"), { refused: '"Maybe" isn\'t one of its options' });

const order = (row, xyi) => ({ row, artwork: "LieDetector", xyi });
const plan = planFields(
  [order(4, { marketDeadline: "2026-10-13", department: "Print;Asset Management", aspectRatio: "2.13", art: "LieDetector", xyiFormat: "Digital Mech", quote: "Approved", reporting: "Yes" }),
   order(5, { marketDeadline: "", department: "Print", aspectRatio: "0.5", art: "", xyiFormat: "", quote: "Maybe" })],
  { fields: resolveFields(account.filter((f) => f.id !== "RP")), jobNumber: "XY026216_INTL_PRINT_Outdoor_Campaign_Markets", keyOf: (o) => `r${o.row}` }
);
check("the upload's fields, per order", plan.byKey.r4, [
  { id: "JN", value: "XY026216_INTL_PRINT_Outdoor_Campaign_Markets" }, { id: "MD", value: "2026-10-13" }, { id: "DP", value: '["Print","Asset Management"]' },
  { id: "AR", value: "2.13" }, { id: "ART", value: "LieDetector" }, { id: "FM", value: '["Digital Mech"]' }, { id: "Q", value: "Approved" },
]);
check("an empty cell is left empty; the artwork stands in for Art", plan.byKey.r5.map((f) => f.id), ["JN", "DP", "AR", "ART"]);
check("the batch carries the job number and the only deadline", plan.batch, [{ id: "JN", value: "XY026216_INTL_PRINT_Outdoor_Campaign_Markets" }, { id: "MD", value: "2026-10-13" }]);
{
  const dated = (row, marketDeadline) => order(row, { marketDeadline });
  const fields = resolveFields(account);
  const plan = (orders, overrides) => planFields(orders, { fields, jobNumber: "J", keyOf: (o) => `r${o.row}`, overrides });
  const deadline = (p) => p.batch.find((f) => f.id === "MD")?.value;
  check("the batch's Market Deadline is its orders' earliest", deadline(plan([dated(4, "2026-10-26"), dated(5, "2026-10-21"), dated(6, "")])), "2026-10-21");
  check("one set for the batch counts, where it is used", deadline(plan([dated(4, "2026-10-26"), dated(5, "")], { "Market Deadline": { raw: "2026-10-20" } })), "2026-10-20");
  check("no deadline on the batch when no order has one", deadline(plan([dated(4, ""), dated(5, "")])), undefined);
}
check("what is missing and refused is said", [plan.missing, plan.refused], [["Reporting"], [{ title: "Quote", reason: '"Maybe" isn\'t one of its options', rows: [5] }]]);

// Values set in the preview for the batch.
{
  const fields = resolveFields(account);
  const orders = [order(4, { quote: "Approved", reporting: "" }), order(5, { quote: "Maybe", reporting: "" }), order(6, { quote: "", reporting: "No" })];
  const plain = planFields(orders, { fields, jobNumber: "J", keyOf: (o) => `r${o.row}` });
  const q = plain.summary.find((s) => s.title === "Quote");
  check("the sheet's own picture of a field", [q.values, q.empty, q.refused], [["Approved"], 1, 1]);
  const gaps = planFields(orders, { fields, jobNumber: "J", keyOf: (o) => `r${o.row}`, overrides: { Quote: { raw: "Pending" }, Reporting: { raw: "Yes" } } });
  const val = (plan, row, id) => plan.byKey[`r${row}`]?.find((f) => f.id === id)?.value;
  check("a batch value fills only the gaps", [4, 5, 6].map((r) => val(gaps, r, "Q")), ["Approved", "Pending", "Pending"]);
  check("and leaves a market's own answer", [4, 5, 6].map((r) => val(gaps, r, "RP")), ["Yes", "Yes", "No"]);
  check("nothing refused once the gaps are filled", gaps.refused, []);
  const all = planFields(orders, { fields, jobNumber: "J", keyOf: (o) => `r${o.row}`, overrides: { Quote: { raw: "Pending", all: true }, "Job Number": { raw: "XY9", all: true } } });
  check("or, asked to, every order", [4, 5, 6].map((r) => val(all, r, "Q")), ["Pending", "Pending", "Pending"]);
  check("the batch's job number follows", all.batch.filter((f) => f.id === "JN"), [{ id: "JN", value: "XY9" }]);
  check("a value the field won't take is ignored", val(planFields(orders, { fields, jobNumber: "J", keyOf: (o) => `r${o.row}`, overrides: { Quote: { raw: "Nope" } } }), 6, "Q"), undefined);
}
