// A matched task's Wrike status, named and coloured as Wrike shows it, for the
// market table's Wrike status column and its row tint.

import { fetchWorkflows } from "../wrikeCampaign";

// Wrike's status colours, as the API names them, to the colour families the
// dark themes already restyle (src/Timesheeter.css). Class names are spelled
// out whole so Tailwind keeps them.
const FAMILY = {
  gray: "slate", grey: "slate", red: "red", orange: "orange", yellow: "yellow", brown: "amber",
  green: "green", yellowgreen: "green", turquoise: "teal", darkcyan: "cyan", blue: "sky",
  darkblue: "blue", indigo: "indigo", purple: "purple", pink: "pink",
};
const STYLE = {
  slate: { pill: "bg-slate-100 text-slate-700", bar: "bg-slate-400", row: "bg-slate-100" },
  red: { pill: "bg-red-100 text-red-700", bar: "bg-red-500", row: "bg-red-50" },
  orange: { pill: "bg-orange-100 text-orange-700", bar: "bg-orange-500", row: "bg-orange-50" },
  yellow: { pill: "bg-yellow-100 text-yellow-700", bar: "bg-yellow-500", row: "bg-yellow-50" },
  amber: { pill: "bg-amber-100 text-amber-700", bar: "bg-amber-700", row: "bg-amber-50" },
  green: { pill: "bg-green-100 text-green-700", bar: "bg-green-500", row: "bg-green-50" },
  teal: { pill: "bg-teal-100 text-teal-700", bar: "bg-teal-500", row: "bg-teal-50" },
  cyan: { pill: "bg-cyan-100 text-cyan-700", bar: "bg-cyan-600", row: "bg-cyan-50" },
  sky: { pill: "bg-sky-100 text-sky-700", bar: "bg-sky-500", row: "bg-sky-50" },
  blue: { pill: "bg-blue-100 text-blue-700", bar: "bg-blue-700", row: "bg-blue-50" },
  indigo: { pill: "bg-indigo-100 text-indigo-700", bar: "bg-indigo-500", row: "bg-indigo-50" },
  purple: { pill: "bg-purple-100 text-purple-700", bar: "bg-purple-500", row: "bg-purple-50" },
  pink: { pill: "bg-pink-100 text-pink-700", bar: "bg-pink-500", row: "bg-pink-50" },
};
// A status Wrike gives no colour we know: shown, but the row isn't tinted.
const PLAIN = { pill: "bg-slate-100 text-slate-700", bar: "bg-slate-300", row: "" };

export const statusStyle = (color) =>
  STYLE[FAMILY[String(color || "").toLowerCase().replace(/[^a-z]/g, "")]] || PLAIN;

// { statusId: { name, color, group } } from Wrike's workflows.
export function statusesOf(workflows) {
  const out = {};
  for (const wf of workflows || []) {
    for (const st of wf.customStatuses || []) out[st.id] = { name: st.name, color: st.color || "", group: st.group || "" };
  }
  return out;
}

// One read of the workflows per page load: statuses rarely change.
let once = null;
export const readStatuses = () => (once ||= fetchWorkflows().then(statusesOf).catch(() => { once = null; return {}; }));

// A task's status: `freshId` is its status as just read from Wrike, which
// wins over the cached copy's. null when there is no task.
export function taskStatus(task, statuses, freshId) {
  if (!task) return null;
  const id = freshId || task.customStatusId;
  const known = id && statuses?.[id];
  if (known) return { ...known, style: statusStyle(known.color) };
  const name = task.customStatusName || task.status || "";
  return name ? { name, color: "", group: "", style: PLAIN } : null;
}
