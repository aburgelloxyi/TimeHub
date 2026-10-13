import React from "react";
import { HoverLabel } from "../shared/FloatingCard";
import { ExternalLink } from "lucide-react";
import { taskSummary, taskLink } from "../../lib/orderForms/wrikeMatch";
import { formatDay } from "./format";
import PickerMenu from "./PickerMenu";

// What opens under an order's row: everything the table has no column for.
// The long text in full, the rest of the spec, the Wrike task it is matched to
// (with the means to overrule that), and the task the sheet would build.

function Field({ label, value, note }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-[#768994]">{label}</dt>
      <dd className="text-sm text-[#122027] whitespace-pre-wrap break-words">{value}</dd>
      {note && <dd className="text-[11px] text-[#768994] mt-0.5">{note}</dd>}
    </div>
  );
}

const LONG_TEXT = [["translations", "Translations"], ["notes", "Notes"], ["specs", "Written specifications"]];

// Each of the three is its own panel on the row's sunken background, so they
// read as three things and not one run of fields.
const panelClass = "rounded-xl bg-white border border-[#dce4ec] p-4 min-w-0";
const headingClass = "text-[10px] font-black uppercase tracking-widest text-[#768994] mb-2.5";

// `task` is the Wrike task matched to this order, `how` the way it was matched
// ("exact", "close", "chosen"), `parent` the task it is a subtask of.
// `matching` lets the PM overrule the match: { link, candidates, onLink }.
// `onSetAside` takes the order off the list. `edit` is set in the market's
// edit mode, for the long text that has no column: { fields, value(f),
// changed(f), set(f, text) }.
export default function OrderDetail({ order, task, how, parent, today, matching, onSetAside, edit }) {
  const wrike = task ? taskSummary(task, parent) : null;
  const x = order.xyi || {};
  const wrikeTitle = x.title || order.deliveryName;
  // Candidates are tasks whose names end in the same code as this order's.
  // That code is the sheet's, and isn't always the country: Belgium's Dutch
  // rows end in NL, as the Netherlands' tasks do. The heading says what was
  // looked for, not that the tasks are this market's.
  const marketCode = String(wrikeTitle || "").trim().split(/[\s_]+/).pop().toUpperCase();
  const candidatesHeading = marketCode ? `Tasks for this film ending in ${marketCode}` : "Tasks for this film";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 p-4 bg-slate-50">
      <section className={panelClass}>
        <h3 className={headingClass}>From the market</h3>
        <dl className="space-y-3">
          {LONG_TEXT.map(([field, label]) => (edit?.fields.includes(field) ? (
            <label key={field} className="block">
              <span className="block text-[11px] text-[#768994] mb-1">{label}</span>
              <textarea
                rows={3}
                value={edit.value(field)}
                onChange={(e) => edit.set(field, e.target.value)}
                className={`w-full px-3 py-2 text-sm text-[#122027] border rounded-lg outline-none focus:border-[#12a0e1] bg-white ${
                  edit.changed(field) ? "border-indigo-500 ring-2 ring-indigo-500/15" : "border-[#dce4ec]"
                }`}
              />
            </label>
          ) : <Field key={field} label={label} value={order[field]} />))}
          <Field label="Spec sheet" value={order.specSheet} />
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            <Field label="Media approved" value={order.mediaApproved} />
            <Field label="XYi received" value={order.received == null ? "" : order.received ? "Yes" : "Not yet"} />
            <Field label="Format" value={order.format} />
            <Field label="Colour" value={order.colourMode} />
            <Field label="Video format" value={order.videoFormat} />
            <Field label="File size" value={order.fileSize} />
            <Field label="Bit rate" value={order.bitRate} />
            <Field label="Sound" value={order.sound} />
            <Field label="Canvas rotation" value={order.rotation} />
          </div>
        </dl>
        {onSetAside && (
          <HoverLabel label="Takes this row off the list and out of the counts. The sheet isn't changed, and it can be brought back from the bottom of the page.">
            <button
              onClick={onSetAside}
              className="mt-4 px-3 py-1.5 rounded-lg border border-[#dce4ec] hover:border-[#12a0e1] bg-white text-xs font-bold text-[#122027] transition-colors"
            >
              Set this row aside
            </button>
          </HoverLabel>
        )}
      </section>

      {/* The one that isn't the sheet's word: tinted, so the eye finds Wrike. */}
      <section className={`${panelClass} !bg-sky-50`}>
        <h3 className={headingClass}>
          {task ? `In Wrike${how === "close" ? " · close match, not the exact name" : how === "chosen" ? " · chosen by you" : how === "created" ? " · created from here" : ""}` : "Not found in Wrike"}
        </h3>
        {task && (
          <>
            <a href={taskLink(task)} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1.5 font-mono text-xs text-sky-600 hover:underline break-all">
              <ExternalLink className="w-3 h-3 mt-0.5 shrink-0" />
              {task.title}
            </a>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-3 mt-3">
              <Field label="Status" value={task.customStatusName || task.status} />
              <Field label="Assigned to" value={wrike.assignees || "Nobody yet"} note={wrike.assigneesFromParent && "On the parent task"} />
              <Field
                label="Due"
                value={formatDay(wrike.due, today)}
                note={wrike.dueFromParent ? "On the parent task" : wrike.parentDue && `Parent task is due ${formatDay(wrike.parentDue, today)}`}
              />
            </dl>
            {parent && (
              <p className="text-[11px] text-[#768994] mt-3 break-words">
                Subtask of{" "}
                <a href={taskLink(parent)} target="_blank" rel="noreferrer" className="font-bold text-sky-600 hover:underline">{parent.title}</a>
              </p>
            )}
          </>
        )}
        {matching && (
          <div className="mt-3">
            <span className="block text-[11px] text-[#768994] mb-1">{task ? "Not the right task?" : "In Wrike under another name?"}</span>
            <PickerMenu
              compact
              searchable={matching.candidates.length > 8}
              ariaLabel="Wrike task for this order"
              items={[
                { id: "auto", label: "Match automatically" },
                { id: "none", label: "Not in Wrike" },
                ...matching.candidates.map(({ task: t }) => ({ id: t.id, label: t.title, group: candidatesHeading })),
              ]}
              value={matching.link || "auto"}
              onChange={(id) => matching.onLink(id === "auto" ? null : id)}
            />
            {matching.candidates.length === 0 && (
              <span className="block text-[11px] text-[#768994] mt-1">TimeHub has no tasks loaded for this film ending in {marketCode || "this market's code"}.</span>
            )}
          </div>
        )}
      </section>

      {wrikeTitle && (
        <section className={panelClass}>
          <h3 className={headingClass}>{task ? "From the sheet" : "Becomes Wrike task"}</h3>
          <p className="font-mono text-xs text-[#122027] break-all">{wrikeTitle}</p>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3 mt-3">
            <Field label="Workflow" value={x.workflow} />
            <Field label="Status" value={x.customStatus} />
            <Field label="End date" value={formatDay(x.endDate, today)} />
            <Field label="Market deadline" value={formatDay(x.marketDeadline, today)} />
            <Field label="PM" value={x.pm} />
            <Field label="Department" value={x.department} />
            <Field label="Aspect ratio" value={x.aspectRatio} />
            <Field label="Art" value={x.art} />
            <Field label="Format" value={x.xyiFormat} />
            <Field label="Quote" value={x.quote} />
          </dl>
        </section>
      )}
    </div>
  );
}
