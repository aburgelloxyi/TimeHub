import React from "react";
import { ExternalLink } from "lucide-react";
import { orderUrgency } from "../../lib/orderForms/status";
import { taskSummary } from "../../lib/orderForms/wrikeMatch";
import { formatDay, pillClass, STATUS_CLASS, STATUS_LABEL, URGENCY_LABEL, URGENCY_TEXT } from "./format";

// One order, laid out for reading: the market's answers grouped by what they
// describe, then the Wrike task the sheet builds from them. Fields the market
// left empty are left out rather than shown as blanks.

function Group({ title, fields }) {
  const filled = fields.filter(([, value]) => value);
  if (!filled.length) return null;
  return (
    <section className="py-4 border-b border-slate-100 last:border-b-0">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-[#768994] mb-2.5">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3">
        {filled.map(([label, value, wide]) => (
          <div key={label} className={wide ? "col-span-2" : ""}>
            <dt className="text-xs text-[#768994]">{label}</dt>
            <dd className="text-sm text-[#122027] whitespace-pre-wrap break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const EDIT_LABEL = {
  confirmed: "Are your orders confirmed?",
  placement: "Placement",
  siteName: "Media site name",
  artwork: "Artwork",
  translations: "Translations",
  notes: "Notes",
  specs: "Written specifications",
};
const LONG_FIELDS = new Set(["translations", "notes", "specs"]);
const editInputClass =
  "w-full px-3 py-2 text-sm text-[#122027] border rounded-lg outline-none focus:border-[#12a0e1] bg-white";

// The cells of this order the page can write back to its sheet, holding what
// each cell holds now. A cell that is a dropdown in the sheet is one here, with
// the sheet's own choices (edit.choices), so nothing can be typed into it that
// the sheet wouldn't offer. A changed field is outlined until applied.
function EditFields({ order, edit }) {
  const fields = Object.keys(order.cells || {});
  if (!fields.length) {
    return <p className="mt-4 text-sm text-[#768994]">Refresh this market to edit its orders here.</p>;
  }
  return (
    <section className="mt-4 rounded-xl bg-slate-50 border border-[#dce4ec] p-4 space-y-3">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Edit in the sheet</h3>
      {fields.map((field) => {
        const was = order.cells[field].was;
        const value = edit.values[field] ?? was;
        const changed = value !== was;
        const options = edit.choices?.[order.cells[field].at];
        const props = {
          value,
          onChange: (e) => edit.set(field, e.target.value),
          className: `${editInputClass} ${changed ? "border-indigo-500 ring-2 ring-indigo-500/15" : "border-[#dce4ec]"}`,
        };
        return (
          <label key={field} className="block">
            <span className="flex items-baseline justify-between gap-2 text-xs text-[#768994] mb-1">
              {EDIT_LABEL[field]}
              <span className="font-mono text-[10px]">{order.cells[field].at}</span>
            </span>
            {options ? (
              <select {...props}>
                {/* What the cell holds now stays selectable even if the sheet's
                    list no longer includes it. */}
                {!options.includes(value) && <option value={value}>{value || "—"}</option>}
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : LONG_FIELDS.has(field) ? <textarea rows={3} {...props} /> : <input {...props} />}
          </label>
        );
      })}
    </section>
  );
}

const size = (o) => (o.width && o.height ? `${o.width} × ${o.height}${o.unit ? ` ${o.unit}` : ""}` : "");

// `task` is the Wrike task with this order's name, when TimeHub has it loaded,
// and `parent` the task it is a subtask of. `edit` is set in the market's edit
// mode: { values, set } for this order's pending edits.
export default function OrderPanel({ order, task, parent, today, edit }) {
  const wrike = task ? taskSummary(task, parent) : null;
  const urgency = orderUrgency(order, today);
  const x = order.xyi;
  const wrikeTitle = x.title || order.deliveryName;

  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold tracking-tight text-[#122027] break-words">
            {order.siteName || size(order) || `Row ${order.row}`}
          </h2>
          <p className="text-xs text-[#768994] mt-1">
            {[order.placement, order.marketCode, `row ${order.row}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className={`${pillClass} ${STATUS_CLASS[order.status]} shrink-0`}>{STATUS_LABEL[order.status]}</span>
      </div>

      {edit && <EditFields order={order} edit={edit} />}

      <div className="mt-2">
        <Group
          title="Dates and approval"
          fields={[
            ["Delivery deadline", order.deliveryDeadline && (
              <span className={urgency ? `font-bold ${URGENCY_TEXT[urgency]}` : ""}>
                {formatDay(order.deliveryDeadline, today)}{urgency ? ` · ${URGENCY_LABEL[urgency]}` : ""}
              </span>
            )],
            ["Live date", formatDay(order.liveDate, today)],
            ["Media approved", order.mediaApproved],
            ["XYi received", order.received == null ? "" : order.received ? "Yes" : "Not yet"],
          ]}
        />
        <Group
          title="Size and spec"
          fields={[
            ["Size", size(order)],
            ["Orientation", order.orientation],
            ["Duration", order.duration && `${order.duration}s`],
            ["Format", order.format],
            ["Type", order.type],
            ["Colour", order.colourMode],
            ["Video format", order.videoFormat],
            ["File size", order.fileSize],
            ["Bit rate", order.bitRate],
            ["Sound", order.sound],
            ["Canvas rotation", order.rotation],
            ["Spec sheet", order.specSheet, true],
            ["Written specifications", order.specs, true],
          ]}
        />
        <Group
          title="Artwork and translations"
          fields={[
            ["Artwork", order.artwork, true],
            ["Translations", order.translations, true],
          ]}
        />
        <Group title="Notes" fields={[["From the market", order.notes, true]]} />

        {task && (
          <section className="mt-4 rounded-xl bg-sky-100 border border-[#dce4ec] p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-sky-600">In Wrike</h3>
              {task.permalink && (
                <a href={task.permalink} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-bold text-sky-600 hover:underline">
                  <ExternalLink className="w-3 h-3" />
                  Open task
                </a>
              )}
            </div>
            <p className="font-mono text-xs text-[#122027] break-all">{task.title}</p>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-2 mt-3">
              {[
                ["Status", task.customStatusName || task.status],
                ["Assigned to", wrike.assignees || "Nobody yet", wrike.assigneesFromParent && "On the parent task"],
                ["Due", formatDay(wrike.due, today), wrike.dueFromParent ? "On the parent task" : wrike.parentDue && `Parent task is due ${formatDay(wrike.parentDue, today)}`],
              ].filter(([, value]) => value).map(([label, value, note]) => (
                <div key={label}>
                  <dt className="text-[11px] text-[#768994]">{label}</dt>
                  <dd className="text-xs font-medium text-[#122027] break-words">{value}</dd>
                  {note && <dd className="text-[11px] text-[#768994] mt-0.5">{note}</dd>}
                </div>
              ))}
            </dl>
            {parent && (
              <p className="text-[11px] text-[#768994] mt-3 break-words">
                Subtask of{" "}
                {parent.permalink
                  ? <a href={parent.permalink} target="_blank" rel="noreferrer" className="font-bold text-sky-600 hover:underline">{parent.title}</a>
                  : <span className="font-bold text-[#122027]">{parent.title}</span>}
              </p>
            )}
          </section>
        )}

        {wrikeTitle && (
          <section className="mt-4 rounded-xl bg-slate-50 border border-[#dce4ec] p-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#768994] mb-2">{task ? "From the sheet" : "Becomes Wrike task"}</h3>
            <p className="font-mono text-xs text-[#122027] break-all">{wrikeTitle}</p>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-2 mt-3">
              {[
                ["Workflow", x.workflow],
                ["Status", x.customStatus],
                ["End date", formatDay(x.endDate, today)],
                ["Market deadline", formatDay(x.marketDeadline, today)],
                ["PM", x.pm],
                ["Department", x.department],
                ["Aspect ratio", x.aspectRatio],
                ["Art", x.art],
                ["Format", x.xyiFormat],
                ["Quote", x.quote],
              ].filter(([, value]) => value).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] text-[#768994]">{label}</dt>
                  <dd className="text-xs font-medium text-[#122027] break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}
