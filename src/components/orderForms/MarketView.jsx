import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ExternalLink, Loader2, PencilLine } from "lucide-react";
import { marketSummary, orderUrgency, changeKeys, changesNote } from "../../lib/orderForms/status";
import { orderKey, taskLink } from "../../lib/orderForms/wrikeMatch";
import OrderDetail from "./OrderDetail";
import PickerMenu from "./PickerMenu";
import DateField from "../shared/DateField";
import { HoverLabel } from "../shared/FloatingCard";
import MarketFlag from "./MarketFlag";
import WrikeFolderButton from "./WrikeFolderButton";
import Corrections from "./Corrections";
import { googleMessage } from "./GoogleSource";
import { applyCellChanges, connectGoogleForWriting, googleCanWrite, googleConnected, readCellChoices } from "../../lib/orderForms/googleApi";
import { cellRange, editChanges, reversed } from "../../lib/orderForms/corrections";
import { confirmAction } from "../../lib/confirm";
import { notify } from "../../lib/toast";
import { formatDay, pillClass, undatedNote, STATUS_CLASS, STATUS_LABEL, URGENCY_TEXT } from "./format";

// The table's columns: what a PM scans a market by, sized to fit the page
// without scrolling sideways. Site name takes whatever width is left. `field`
// marks a column the page can write back (parseWorkbook's EDITABLE_FIELDS).
// The market's own Confirmed answer only has a column while editing: read-only
// it says nothing the status doesn't. Long text (translations, notes,
// specifications) is in the row's details, where there is room to read it.
const columnsFor = (kind, editing) => (editing ? [
  // Editing adds two columns and turns cells into inputs, so the shares are
  // set to leave Site name, the one with no width of its own, about a fifth.
  { id: "status", label: "Status", width: "8%" },
  { id: "confirmed", label: "Confirmed?", width: "9%", field: true },
  { id: "deliveryDeadline", label: "Deadline", width: "9%", field: true },
  // Read-only, the live date sits under the deadline; editing, it needs its own cell.
  { id: "liveDate", label: "Live", width: "9%", field: true },
  { id: "placement", label: "Placement", width: "8%", field: true },
  { id: "siteName", label: "Site name", field: true },
  { id: "size", label: "Size", width: "11%", field: true },
  kind === "print" ? { id: "type", label: "Type", width: "7%" } : { id: "duration", label: "Duration", width: "6%" },
  { id: "artwork", label: "Artwork", width: "10%", field: true },
  { id: "wrike", label: "Wrike", width: "6%" },
] : [
  { id: "status", label: "Status", width: "11%" },
  { id: "deliveryDeadline", label: "Deadline", width: "9%" },
  { id: "placement", label: "Placement", width: "9%" },
  { id: "siteName", label: "Site name" },
  { id: "size", label: "Size", width: "13%" },
  kind === "print" ? { id: "type", label: "Type", width: "11%" } : { id: "duration", label: "Duration", width: "8%" },
  { id: "artwork", label: "Artwork", width: "14%" },
  { id: "wrike", label: "Wrike", width: "9%" },
]);
const DETAIL_FIELDS = ["translations", "notes", "specs"];

// What "set for the ticked orders" can set, and how each is typed.
const BULK_FIELDS = [
  { id: "confirmed", label: "Confirmed?" },
  { id: "deliveryDeadline", label: "Deadline", type: "date" },
  { id: "liveDate", label: "Live date", type: "date" },
  { id: "placement", label: "Placement" },
  { id: "siteName", label: "Site name" },
  { id: "width", label: "Width", type: "number" },
  { id: "height", label: "Height", type: "number" },
  { id: "artwork", label: "Artwork" },
  { id: "translations", label: "Translations" },
  { id: "notes", label: "Notes" },
  { id: "specs", label: "Specifications" },
];

const cellInputClass = "w-full px-2 py-1 text-sm text-[#122027] border rounded-md outline-none focus:border-[#12a0e1] bg-white";
const linkButtonClass =
  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-[#122027] hover:bg-slate-50 transition-colors";

// One market, laid out like its sheet: a row an order, a column a field, wide
// enough to scroll sideways. A row opens to show what has no column (see
// OrderDetail).
// `filmTitle` is set for a film read from Google, whose markets have a Drive
// folder and a place in Wrike; a dropped workbook has neither.
//
// Edit mode (Google films only) writes back to the market's sheet: the cells
// that are plain text in it become inputs in the table, and a correction can
// be made to a column across several sheets. Edits are collected and shown as a count;
// nothing is written until Apply is confirmed. `onChanged` reads the market
// again afterwards.
//
// `decide` is how a PM overrules what the page works out, kept with the film in
// this browser: { links, onLink(order, taskId | "none" | null), onSetAside(order),
// onRestore(order) }. Rows set aside are listed under the orders and don't count.
export default function MarketView({ market, kind, filmTitle, clientId, filmKey, today, matcher, wrikeParents, decide, onBack, onChanged }) {
  const orders = market.orders;
  // The row being worked in (its dropdown choices are read), and the row opened out.
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(false);
  const columns = useMemo(() => columnsFor(kind, editing), [kind, editing]);
  const [edits, setEdits] = useState({}); // "orderIndex:field" → text
  const [applying, setApplying] = useState(false);
  // What the last apply wrote, turned round, so it can be put back.
  const [undo, setUndo] = useState(null);
  const changes = useMemo(() => editChanges(orders, edits), [orders, edits]);
  // The sheet's own dropdown choices, by cell address, read for an order when
  // it is selected in edit mode. Cells not asked about yet aren't in it.
  const [choices, setChoices] = useState({});
  const asked = useRef(new Set());
  // Orders ticked in edit mode, to set one field on all of them at once. What
  // is set joins the pending edits, to be reviewed and applied like any other.
  const [ticked, setTicked] = useState(() => new Set());
  const [bulk, setBulk] = useState({ field: "confirmed", value: "" });
  const setEdit = (i, field, value) => setEdits((prev) => ({ ...prev, [`${i}:${field}`]: value }));
  // What an editable cell shows before anything is typed: a date as its day,
  // anything else as the cell holds it.
  const heldIn = (o, field) => {
    const held = o.cells?.[field];
    return !held ? "" : held.as === "serial" || held.as === "text" ? o[field] || "" : held.was;
  };
  const choicesFor = (held) => (held ? choices[held.at] || choices[`col:${held.at.replace(/\d+$/, "")}`] : null);
  const summary = marketSummary(market, today);
  const matches = useMemo(() => (matcher ? matcher.match(orders, decide?.links) : orders.map(() => null)), [matcher, orders, decide?.links]);
  const tasks = matches.map((m) => m?.task || null);
  const inWrike = tasks.filter(Boolean).length;
  const setAside = market.setAside || [];
  // What the last Refresh changed here and hasn't been acknowledged, and which
  // of the orders on screen it was (decide.changes; see status.js).
  const changed = decide?.changes || null;
  const changedTag = useMemo(() => {
    if (!changed) return () => "";
    const keys = changeKeys(orders);
    const tags = new Map();
    changed.moved.forEach((key) => tags.set(key, "Date moved"));
    changed.confirmed.forEach((key) => tags.set(key, "Confirmed"));
    changed.added.forEach((key) => tags.set(key, "New"));
    return (i) => tags.get(keys[i]) || "";
  }, [changed, orders]);

  useEffect(() => { setSelected(0); setExpanded(null); setEditing(false); setEdits({}); setUndo(null); setTicked(new Set()); }, [market.name]);
  // A fresh read replaces the orders, and with them what each cell held.
  useEffect(() => { setEdits({}); setChoices({}); setExpanded(null); setTicked(new Set()); asked.current = new Set(); }, [orders]);

  useEffect(() => {
    const current = orders[selected];
    if (!editing || !current?.tab || !market.sheetId || !googleConnected()) return;
    const cells = Object.values(current.cells || {}).map((c) => c.at).filter((at) => !asked.current.has(`${current.tab}!${at}`));
    if (!cells.length) return;
    cells.forEach((at) => asked.current.add(`${current.tab}!${at}`));
    // If this fails the fields stay as text boxes, which is what they were.
    readCellChoices(market.sheetId, current.tab, cells)
      .then((found) => setChoices((prev) => {
        const byColumn = Object.fromEntries(Object.entries(found).map(([at, list]) => [`col:${at.replace(/\d+$/, "")}`, list]));
        return { ...byColumn, ...prev, ...found };
      }))
      .catch(() => {});
  }, [editing, selected, orders, market.sheetId]);

  // A value as the confirmation shows it: a date as a day, nothing as "empty".
  const said = (value, date) => (!value ? "empty" : date ? formatDay(value, today) : `"${value}"`);

  // Sets the chosen field on every ticked order that has that cell.
  const setOnTicked = () => {
    setEdits((prev) => {
      const next = { ...prev };
      for (const i of ticked) if (orders[i]?.cells?.[bulk.field]) next[`${i}:${bulk.field}`] = bulk.value;
      return next;
    });
  };
  const bulkField = BULK_FIELDS.find((f) => f.id === bulk.field);
  const firstTicked = orders[[...ticked][0]];
  const bulkChoices = bulkField && !bulkField.type ? choicesFor(firstTicked?.cells?.[bulk.field]) : null;

  const startEditing = () => {
    if (!market.sheetId) return notify("Refresh this market first, so its sheet can be edited from here.");
    if (!market.sheetNative) return notify("This market's sheet is an Excel file, not a Google Sheet, so it can't be edited from here.");
    setEditing(true);
  };

  const undoLast = async () => {
    setApplying(true);
    try {
      if (!googleCanWrite()) await connectGoogleForWriting();
      const result = await applyCellChanges(market.sheetId, undo.map((c) => ({ ...c, range: cellRange(c.tab, c.cell) })));
      notify(
        `${result.written} ${result.written === 1 ? "cell" : "cells"} put back${result.changed ? `, ${result.changed} left alone because the sheet has been edited since` : ""}`,
        result.changed ? "error" : "success"
      );
      setUndo(null);
      onChanged?.();
    } catch (err) {
      notify(googleMessage(err));
    } finally {
      setApplying(false);
    }
  };

  const stopEditing = async () => {
    if (changes.length && !(await confirmAction({
      title: "Discard your edits?",
      message: `${changes.length} ${changes.length === 1 ? "edit hasn't" : "edits haven't"} been applied to the sheet.`,
      confirmLabel: "Discard",
      danger: true,
    }))) return;
    setEdits({});
    setTicked(new Set());
    setEditing(false);
  };

  const applyEdits = async () => {
    const ok = await confirmAction({
      title: `Change ${changes.length} ${changes.length === 1 ? "cell" : "cells"} in ${market.name}'s sheet?`,
      message: `${changes.slice(0, 6).map((c) => `${c.cell}: ${said(c.show.from, c.show.date)} → ${said(c.show.to, c.show.date)}`).join("\n")}${changes.length > 6 ? `\nand ${changes.length - 6} more` : ""}\n\nThis writes to the Google Sheet. To undo it, use the sheet's version history in Google.`,
      confirmLabel: "Apply",
      danger: true,
    });
    if (!ok) return;
    setApplying(true);
    try {
      // Inside the click, so the browser lets Google's window open.
      if (!googleCanWrite()) await connectGoogleForWriting();
      const result = await applyCellChanges(market.sheetId, changes.map((c) => ({ ...c, range: cellRange(c.tab, c.cell) })));
      notify(
        `${result.written} ${result.written === 1 ? "cell" : "cells"} changed${result.changed ? `, ${result.changed} left alone because the sheet had been edited since it was read` : ""}`,
        result.changed ? "error" : "success"
      );
      setEdits({});
      setUndo(result.written ? reversed(changes) : null);
      onChanged?.();
    } catch (err) {
      notify(err?.reason === "denied" ? "Google didn't grant edit access to spreadsheets, so nothing was written."
        : err?.reason === "no-access" ? "Your Google account can't edit this sheet."
        : googleMessage(err));
    } finally {
      setApplying(false);
    }
  };

  // One cell of the table. In edit mode a writable cell is an input holding
  // what the sheet's cell holds, or a dropdown where the sheet has one.
  const cell = (o, i, col) => {
    const at = o.cells?.[col.id];
    const inputFor = (field, extra = {}) => {
      const key = `${i}:${field}`;
      const value = edits[key] ?? heldIn(o, field);
      return {
        value,
        onFocus: () => setSelected(i),
        onChange: (e) => setEdit(i, field, e.target.value),
        "aria-label": `${col.label}, row ${o.row}`,
        className: `${cellInputClass} ${value !== heldIn(o, field) ? "border-indigo-500 ring-2 ring-indigo-500/15" : "border-[#dce4ec]"}`,
        ...extra,
      };
    };
    if (editing && col.id === "size" && o.cells?.width && o.cells?.height) {
      return (
        <span className="flex items-center gap-1">
          <input inputMode="decimal" {...inputFor("width", { "aria-label": `Width, row ${o.row}` })} />
          <span className="text-[#768994] shrink-0">×</span>
          <input inputMode="decimal" {...inputFor("height", { "aria-label": `Height, row ${o.row}` })} />
        </span>
      );
    }
    if (editing && col.field && at) {
      if (at.as === "serial" || at.as === "text") {
        const day = edits[`${i}:${col.id}`] ?? heldIn(o, col.id);
        return (
          <DateField
            floating
            compact
            value={day}
            onChange={(picked) => setEdit(i, col.id, picked)}
            onOpen={() => setSelected(i)}
            changed={day !== heldIn(o, col.id)}
            ariaLabel={`${col.label}, row ${o.row}`}
            placeholder="No date"
            // A row with no delivery deadline stops being an order, so that
            // one can be moved but not emptied from here.
            allowClear={col.id !== "deliveryDeadline"}
          />
        );
      }
      const props = inputFor(col.id);
      const { value } = props;
      const options = choicesFor(at);
      return options ? (
        <PickerMenu
          compact
          changed={value !== at.was}
          ariaLabel={props["aria-label"]}
          onOpen={() => setSelected(i)}
          // What the cell holds now stays in the list even if the sheet's no
          // longer includes it.
          items={[...(options.includes(value) ? [] : [value]), ...options].map((opt) => ({ id: opt, label: opt || "—" }))}
          value={value}
          onChange={(picked) => setEdit(i, col.id, picked)}
        />
      ) : (
        // A box narrower than what's in it shows the whole of it on hover.
        <HoverLabel label={String(value).length > 16 ? <span className="break-words">{value}</span> : ""} delay={300}>
          <input {...props} />
        </HoverLabel>
      );
    }
    switch (col.id) {
      case "status":
        return <span className={`${pillClass} ${STATUS_CLASS[o.status]}`}>{STATUS_LABEL[o.status]}</span>;
      case "deliveryDeadline": {
        const urgency = orderUrgency(o, today);
        return (
          <span className="block tabular-nums">
            <span className={urgency ? `font-bold ${URGENCY_TEXT[urgency]}` : ""}>{formatDay(o.deliveryDeadline, today)}</span>
            {o.liveDate && <span className="block text-[11px] text-[#768994]">live {formatDay(o.liveDate, today)}</span>}
          </span>
        );
      }
      case "liveDate":
        return <span className="tabular-nums">{formatDay(o.liveDate, today)}</span>;
      case "size":
        return (
          <span className="block tabular-nums truncate">
            {o.width && o.height ? `${o.width} × ${o.height}${o.unit ? ` ${o.unit}` : ""}` : ""}
            {o.orientation && <span className="block text-[11px] text-[#768994] truncate">{o.orientation}</span>}
          </span>
        );
      case "duration":
        return o.duration ? `${o.duration}s` : "";
      case "wrike":
        return tasks[i] ? (
          <a
            href={taskLink(tasks[i])}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={matches[i].how === "close" ? `Close match: ${tasks[i].title}` : tasks[i].title}
            className={`${pillClass} gap-1 bg-sky-100 text-sky-600 hover:underline`}
          >
            <ExternalLink className="w-3 h-3" />
            {matches[i].how === "close" ? "In Wrike?" : "In Wrike"}
          </a>
        ) : <span className="text-[#b6c3cc]">—</span>;
      default:
        return <span className="block truncate" title={o[col.id]}>{o[col.id]}</span>;
    }
  };

  return (
    <div className="bg-white border border-[#dce4ec] rounded-2xl shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-[#dce4ec]">
        <nav aria-label="Where you are" className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={onBack}
            className="px-2 py-1.5 -ml-2 rounded-lg text-sm font-bold text-[#768994] hover:text-[#122027] hover:bg-slate-100 transition-colors truncate max-w-[16rem]"
          >
            {filmTitle || "All markets"}
          </button>
          <ChevronRight className="w-4 h-4 text-[#b6c3cc] shrink-0" />
          <h2 className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight text-[#122027]">
            <MarketFlag name={market.name} className="w-7 h-5" />
            {market.name}
          </h2>
        </nav>
        <span className={`${pillClass} ${STATUS_CLASS[summary.status]}`}>{STATUS_LABEL[summary.status]}</span>
        <p className="ml-auto text-sm text-[#768994]">
          {summary.total} {summary.total === 1 ? "order" : "orders"} · {summary.confirmed} confirmed
          {inWrike > 0 && ` · ${inWrike} in Wrike`}
          {summary.undated > 0 && ` · ${undatedNote(summary.undated)}`}
        </p>
        {filmTitle && (editing ? (
          <>
            {changes.length > 0 && (
              <button
                onClick={applyEdits}
                disabled={applying}
                className="press flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors disabled:opacity-60"
              >
                {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PencilLine className="w-3.5 h-3.5" />}
                Apply {changes.length} {changes.length === 1 ? "edit" : "edits"}
              </button>
            )}
            {undo && changes.length === 0 && (
              <button onClick={undoLast} disabled={applying} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#dce4ec] hover:border-[#12a0e1] text-sm font-bold text-[#122027] transition-colors disabled:opacity-60">
                {applying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Undo last apply
              </button>
            )}
            <button onClick={stopEditing} disabled={applying} className="px-3 py-1.5 rounded-lg bg-[#122027] hover:bg-[#25373c] text-sm font-bold text-white transition-colors">
              Done editing
            </button>
          </>
        ) : (
          <button onClick={startEditing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#dce4ec] hover:border-[#12a0e1] text-sm font-bold text-[#122027] transition-colors">
            <PencilLine className="w-3.5 h-3.5" />
            Edit
          </button>
        ))}
        {(filmTitle || market.sheetUrl) && (
          <div className="flex items-stretch rounded-lg border border-[#dce4ec] divide-x divide-[#dce4ec] overflow-hidden [&_a]:border-0 [&_button]:border-0 [&_a]:rounded-none [&_button]:rounded-none">
            {market.sheetUrl && (
              <a href={market.sheetUrl} target="_blank" rel="noreferrer" title={market.sheetName} className={linkButtonClass}>
                <ExternalLink className="w-3.5 h-3.5" />
                Sheet
              </a>
            )}
            {filmTitle && <WrikeFolderButton filmTitle={filmTitle} kind={kind} marketName={market.name} driveUrl={market.folderUrl} />}
          </div>
        )}
      </div>

      {changed && (
        <div className="flex flex-wrap items-center gap-3 px-5 py-2.5 border-b border-[#dce4ec] bg-indigo-50">
          <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" aria-hidden />
          <p className="text-sm text-[#122027] mr-auto">
            <span className="font-bold">Since you last looked:</span> {changesNote(changed)}
          </p>
          <button onClick={decide.onSeen} className="px-3 py-1 rounded-lg bg-white border border-[#dce4ec] hover:border-[#12a0e1] text-xs font-bold text-[#122027] transition-colors">
            Got it
          </button>
        </div>
      )}

      {editing && clientId && <Corrections clientId={clientId} filmKey={filmKey} market={market.name} onApplied={onChanged} />}

      {editing && ticked.size > 0 && (
        <div className="flex flex-wrap items-end gap-3 px-5 py-3 border-b border-[#dce4ec] bg-slate-50">
          <p className="text-sm font-bold text-[#122027] pb-2 mr-1">
            {ticked.size} {ticked.size === 1 ? "order" : "orders"} ticked
          </p>
          <div className="w-44">
            <span className="block mb-1 text-[10px] font-black uppercase tracking-widest text-[#768994]">Set</span>
            <PickerMenu
              compact
              ariaLabel="Field to set"
              items={BULK_FIELDS.filter((f) => firstTicked?.cells?.[f.id]).map((f) => ({ id: f.id, label: f.label }))}
              value={bulk.field}
              onChange={(field) => setBulk({ field, value: "" })}
            />
          </div>
          <div className="w-64">
            <span className="block mb-1 text-[10px] font-black uppercase tracking-widest text-[#768994]">To</span>
            {bulkChoices ? (
              <PickerMenu
                compact
                ariaLabel="Value to set"
                placeholder="Choose"
                items={bulkChoices.map((opt) => ({ id: opt, label: opt || "—" }))}
                value={bulk.value}
                onChange={(value) => setBulk((b) => ({ ...b, value }))}
              />
            ) : (
              bulkField?.type === "date" ? (
                <DateField
                  floating
                  compact
                  value={bulk.value}
                  onChange={(value) => setBulk((b) => ({ ...b, value }))}
                  ariaLabel="Date to set"
                  placeholder="Pick a date"
                  allowClear={false}
                />
              ) : (
                <input
                  inputMode={bulkField?.type === "number" ? "decimal" : undefined}
                  value={bulk.value}
                  onChange={(e) => setBulk((b) => ({ ...b, value: e.target.value }))}
                  aria-label="Value to set"
                  className={`${cellInputClass} border-[#dce4ec] py-1.5`}
                />
              )
            )}
          </div>
          <button
            onClick={setOnTicked}
            className="press px-3 py-1.5 rounded-lg bg-[#122027] hover:bg-[#25373c] text-white text-sm font-bold transition-colors"
          >
            Set on {ticked.size}
          </button>
          <button onClick={() => setTicked(new Set())} className="px-2 py-1.5 text-xs font-bold text-[#768994] hover:text-[#122027]">
            Untick all
          </button>
          <p className="basis-full text-[11px] text-[#768994]">This fills in the cells below for you to check. Nothing is written until you press Apply.</p>
        </div>
      )}

      {orders.length === 0 ? (
        <p className="px-5 py-16 text-center text-sm text-[#768994]">
          No orders with a delivery deadline yet.
          {summary.undated > 0 && ` ${undatedNote(summary.undated)}.`}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className={`w-full ${editing ? "min-w-[1360px]" : "min-w-[920px]"} table-fixed text-sm text-left text-[#122027] border-separate border-spacing-0`}>
            <colgroup>
              <col style={{ width: editing ? 84 : 64 }} />
              {columns.map((col) => <col key={col.id} style={col.width ? { width: col.width } : undefined} />)}
            </colgroup>
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-[#768994]">
                <th className="px-3 py-2.5 bg-slate-50 border-b border-[#dce4ec] font-black">
                  <span className="flex items-center gap-2">
                    {editing && (
                      <input
                        type="checkbox"
                        aria-label="Tick every order"
                        checked={ticked.size === orders.length && orders.length > 0}
                        onChange={() => setTicked(ticked.size === orders.length ? new Set() : new Set(orders.map((_, n) => n)))}
                        className="accent-indigo-600"
                      />
                    )}
                    Row
                  </span>
                </th>
                {columns.map((col) => (
                  <th key={col.id} className="px-3 py-2.5 bg-slate-50 border-b border-[#dce4ec] font-black whitespace-nowrap truncate">
                    {col.label}
                    {editing && col.field && <PencilLine className="inline w-3 h-3 ml-1 -mt-0.5 text-indigo-600" />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => {
                const open = expanded === i;
                return (
                  <React.Fragment key={orderKey(o)}>
                    <tr
                      onClick={() => { if (!editing) setExpanded(open ? null : i); setSelected(i); }}
                      title={editing ? undefined : "Open this order's details"}
                      className={`group ${editing ? "" : "cursor-pointer"} ${open ? "bg-[#12a0e1]/10" : "hover:bg-slate-50"}`}
                    >
                      <td className="px-3 py-2 border-b border-slate-100">
                        <span className="flex items-center gap-2">
                        {editing && (
                          <input
                            type="checkbox"
                            aria-label={`Tick row ${o.row}`}
                            checked={ticked.has(i)}
                            onChange={() => setTicked((prev) => { const next = new Set(prev); if (!next.delete(i)) next.add(i); return next; })}
                            className="accent-indigo-600 shrink-0"
                          />
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpanded(open ? null : i); setSelected(i); }}
                          aria-expanded={open}
                          aria-label={`Row ${o.row}, ${open ? "close" : "open"} details`}
                          className="flex items-center gap-1 text-xs tabular-nums text-[#768994] hover:text-[#122027]"
                        >
                          <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
                          {o.row}
                        </button>
                        </span>
                        {changedTag(i) && (
                          <span className="block mt-0.5 text-[9px] font-black uppercase tracking-wider text-indigo-600 whitespace-nowrap">{changedTag(i)}</span>
                        )}
                      </td>
                      {columns.map((col) => (
                        <td key={col.id} className="px-3 py-2 border-b border-slate-100 align-middle overflow-hidden">
                          {cell(o, i, col)}
                        </td>
                      ))}
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={columns.length + 1} className="p-0 border-b border-[#dce4ec]">
                          <div>
                            <OrderDetail
                              order={o}
                              task={tasks[i]}
                              how={matches[i]?.how}
                              parent={wrikeParents?.get(tasks[i]?.id)}
                              today={today}
                              matching={decide && matcher ? {
                                link: decide.links?.[orderKey(o)],
                                candidates: matcher.candidates(o),
                                onLink: (value) => decide.onLink(o, value),
                              } : null}
                              onSetAside={decide && !editing ? () => decide.onSetAside(o) : null}
                              edit={editing ? {
                                fields: DETAIL_FIELDS.filter((f) => o.cells?.[f]),
                                value: (f) => edits[`${i}:${f}`] ?? o.cells[f].was,
                                changed: (f) => `${i}:${f}` in edits && edits[`${i}:${f}`] !== o.cells[f].was,
                                set: (f, value) => setEdit(i, f, value),
                              } : null}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {setAside.length > 0 && (
        <div className="border-t border-[#dce4ec]">
          <div className="flex items-baseline gap-2 px-5 py-3 bg-slate-50/60 border-b border-[#dce4ec]">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#768994]">Set aside</h3>
            <p className="text-xs text-[#768994]">
              {setAside.length} {setAside.length === 1 ? "row" : "rows"} not being considered for now. Still in the sheet as {setAside.length === 1 ? "it was" : "they were"}.
            </p>
          </div>
          {setAside.map((o) => (
            <div key={orderKey(o)} className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 last:border-b-0 text-sm text-[#768994]">
              <span className={`${pillClass} bg-slate-100 text-slate-600 w-16 justify-center shrink-0`}>{o.placement || "—"}</span>
              <span className="flex-1 min-w-0 truncate">{o.siteName || o.xyi?.title || `Row ${o.row}`}</span>
              <span className="tabular-nums shrink-0 hidden sm:block">{o.width && o.height ? `${o.width} × ${o.height}` : ""}</span>
              <span className="tabular-nums shrink-0 text-xs">row {o.row}</span>
              <button onClick={() => decide?.onRestore(o)} className="shrink-0 px-2.5 py-1 rounded-lg border border-[#dce4ec] hover:border-[#12a0e1] text-xs font-bold text-[#122027] transition-colors">
                Bring back
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
