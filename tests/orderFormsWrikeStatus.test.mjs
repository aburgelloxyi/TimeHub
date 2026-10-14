import { statusesOf, statusStyle, taskStatus } from "../src/lib/orderForms/wrikeStatus.js";

const statuses = statusesOf([
  { customStatuses: [{ id: "S1", name: "Delivered", color: "Gray", group: "Completed" }, { id: "S2", name: "On hold", color: "Red", group: "Deferred" }] },
  { customStatuses: [{ id: "S3", name: "In progress", color: "DarkBlue", group: "Active" }] },
]);
check("statuses by id, from every workflow", Object.keys(statuses), ["S1", "S2", "S3"]);
check("Wrike's colours to ours", ["Gray", "Red", "DarkBlue", "YellowGreen", "Mauve", ""].map((c) => statusStyle(c).row),
  ["bg-slate-100", "bg-red-50", "bg-blue-50", "bg-green-50", "", ""]);
check("a delivered task, greyed", [taskStatus({ customStatusId: "S1" }, statuses).name, taskStatus({ customStatusId: "S1" }, statuses).style.row], ["Delivered", "bg-slate-100"]);
check("Wrike's fresh status wins over the cached one", taskStatus({ customStatusId: "S1" }, statuses, "S2").name, "On hold");
check("an unknown status still shows its name, untinted", [taskStatus({ customStatusId: "X", customStatusName: "Review" }, statuses).name, taskStatus({ customStatusId: "X", customStatusName: "Review" }, statuses).style.row], ["Review", ""]);
check("no task, no status", taskStatus(null, statuses), null);

// The Motion Board's colours win over Wrike's own.
{
  const named = statusesOf([{ customStatuses: ["Cancelled", "Delivering", "Prep for Delivery", "On hold", "Delivered"].map((name, i) => ({ id: `N${i}`, name, color: "Gray" })) }]);
  check("statuses the board colours keep those colours", ["N0", "N1", "N2", "N3", "N4"].map((id) => taskStatus({ customStatusId: id }, named).style.row),
    ["bg-red-50", "bg-yellow-50", "bg-orange-50", "bg-red-50", "bg-slate-100"]);
}
