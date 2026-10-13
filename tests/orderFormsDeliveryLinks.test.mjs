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
