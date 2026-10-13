import { pickFilePathField, deliveryLinkOf, linksFromTasks } from "../src/lib/orderForms/deliveryLinks.js";

const fields = [{ id: "A", title: "Job Number" }, { id: "B", title: "File Path" }, { id: "C", title: "Link" }];
check("the File Path field, by title", pickFilePathField(fields), { id: "B", title: "File Path" });
check("however it is spaced or cased", pickFilePathField([{ id: "X", title: "file-path" }])?.id, "X");
check("a bare Link field isn't taken for it", pickFilePathField([{ id: "C", title: "Link" }]), null);
check("no such field", pickFilePathField([{ id: "A", title: "Job Number" }]), null);

check("a web address is a delivery link", deliveryLinkOf(" https://deliver.example/abc?x=1 "), "https://deliver.example/abc?x=1");
check("a server path is not", deliveryLinkOf("/Volumes/Jobs/XY12345/Delivery"), "");
check("found inside markup, without its trailing punctuation",
  [deliveryLinkOf("<a href=\"https://d.example/a\">here</a>"), deliveryLinkOf("Delivered: https://d.example/a.")],
  ["https://d.example/a", "https://d.example/a"]);
check("empty", deliveryLinkOf(null), "");

check("links by task id, only where there is one", linksFromTasks([
  { id: "T1", customFields: [{ id: "B", value: "https://d.example/1" }] },
  { id: "T2", customFields: [{ id: "B", value: "/Volumes/x" }] },
  { id: "T3", customFields: [{ id: "A", value: "https://not.this/field" }] },
  { id: "T4" },
], "B"), { T1: "https://d.example/1" });

import { planDeliveryFill } from "../src/lib/orderForms/deliveryLinks.js";

const ord = (row, was) => ({ tab: "Croatia (HRV)", row, cells: was === undefined ? {} : { deliveryLink: { at: "AL" + row, was } } });
const os = [ord(5, ""), ord(6, "https://d.example/6"), ord(7, "see email"), ord(8, ""), ord(9, "")];
const ts = [{ id: "T5" }, { id: "T6" }, { id: "T7" }, null, { id: "T9" }];
const ls = { T5: "https://d.example/5", T6: "https://d.example/6", T7: "https://d.example/7" };
check("fills empty cells that have a link, leaves the rest", planDeliveryFill(os, ts, ls), {
  changes: [{ tab: "Croatia (HRV)", cell: "AL5", row: 5, from: "", to: "https://d.example/5" }],
  kept: 1,
  column: true,
});
check("a sheet with no Delivery Link column has nothing to fill", planDeliveryFill([ord(5)], [{ id: "T5" }], ls), { changes: [], kept: 0, column: false });

