import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, ExternalLink, FileSpreadsheet, Link2, Loader2, PencilLine, Send } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { checkMarketFolder } from "../../lib/orderForms/wrikeMarketFolder";
import { fetchTasksUnderFolder } from "../../lib/wrikeCampaign";
import { makeMatcher } from "../../lib/orderForms/wrikeMatch";
import { marketSummary, orderUrgency, changeKeys, changesNote } from "../../lib/orderForms/status";
import { orderKey, taskLink } from "../../lib/orderForms/wrikeMatch";
import { deliveryLinkOf, planDeliveryFill, readDeliveryLinks } from "../../lib/orderForms/deliveryLinks";
import OrderDetail from "./OrderDetail";
import PickerMenu from "./PickerMenu";
import DateField from "../shared/DateField";
import Sweep, { sweepClass } from "./Sweep";
import { HoverLabel } from "../shared/FloatingCard";
import MarketFlag from "./MarketFlag";
import WrikeFolderButton from "./WrikeFolderButton";
import Corrections from "./Corrections";
import { googleMessage } from "./GoogleSource";
import { applyCellChanges, connectGoogleForWriting, googleCanWrite, googleConnected, readCellChoices } from "../../lib/orderForms/googleApi";
import { cellRange, editChanges, reversed } from "../../lib/orderForms/corrections";
import { readMarketForBriefing, suggestBatchName, suggestDue, planBatch, createBatch, hasArtwork } from "../../lib/orderForms/wrikeBatch";
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
// Buttons that act on the same thing sit joined in one outline.
const groupClass =
  "flex items-stretch rounded-lg border border-[#dce4ec] divide-x divide-[#dce4ec] overflow-hidden [&_a]:border-0 [&_button]:border-0 [&_a]:rounded-none [&_button]:rounded-none";
const linkButtonClass =
  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-[#122027]";

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
// Briefing (Google films only) makes the ticked orders in Wrike: a batch task
// in the market's folder with a subtask an order. It reads Wrike on the way in,
// shows where the tasks will go and what they will be called, and creates
// nothing until that is confirmed.
//
// `decide` is how a PM overrules what the page works out, kept with the film in
// this browser: { links, onLink(order, taskId | "none" | null), onSetAside(order),
// onRestore(order) }. Rows set aside are listed under the orders and don't count.
// `startBriefing` opens it already briefing (a link from the Control Centre);
// `onStarted` is told once that has been acted on.
export default function MarketView({ market, kind, filmTitle, clientId, filmKey, today, matcher, wrikeParents, decide, onBack, onChanged, startBriefing: briefOnOpen = false, onStarted }) {
  const orders = market.orders;
  // The row being worked in (its dropdown choices are read), and the row opened out.
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(null);
  // The row that was open a moment ago, kept in the table while its details
  // fold away. Opening another row closes the first with the same motion.
  const [closing, setClosing] = useState(null);
  const toggleRow = (i) => {
    setClosing(expanded);
    setExpanded(expanded === i ? null : i);
  };
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
  // Briefing into Wrike: null when off, else what Wrike said about this market
  // ({ loading } | { ok: false, reason } | { ok, folder, status, … }) with the
  // batch name and due date being typed. It shares the tick boxes with edit mode.
  const [briefing, setBriefing] = useState(null);
  const [creating, setCreating] = useState(null); // { done, total }
  // Whether this market has its Wrike folder yet, asked when the market opens
  // so the header can lead with the next step: add the folder, then brief.
  const [wrikeFolder, setWrikeFolder] = useState(null);
  useEffect(() => {
    setWrikeFolder(null);
    if (!filmTitle) return;
    let live = true;
    checkMarketFolder({ filmTitle, kind, marketName: market.name }).then((found) => { if (live) setWrikeFolder(found); }).catch(() => {});
    return () => { live = false; };
  }, [filmTitle, kind, market.name]);
  const setEdit = (i, field, value) => setEdits((prev) => ({ ...prev, [`${i}:${field}`]: value }));
  // What an editable cell shows before anything is typed: a date as its day,
  // anything else as the cell holds it.
  const heldIn = (o, field) => {
    const held = o.cells?.[field];
    return !held ? "" : held.as === "serial" || held.as === "text" ? o[field] || "" : held.was;
  };
  const choicesFor = (held) => (held ? choices[held.at] || choices[`col:${held.at.replace(/\d+$/, "")}`] : null);
  const summary = marketSummary(market, today);
  // The tasks in this market's own Wrike folder, read live when the market
  // opens. TimeHub's task cache only holds what someone on a team is
  // assigned to, so a batch a PM has just made by hand, unassigned, isn't in
  // it and the orders would say "not in Wrike" though they are. Matching
  // tries the cache first and then these.
  const [folderTasks, setFolderTasks] = useState(null);
  useEffect(() => {
    setFolderTasks(null);
    if (wrikeFolder?.state !== "exists") return;
    let live = true;
    fetchTasksUnderFolder(wrikeFolder.folder.id).then((tasks) => { if (live) setFolderTasks(tasks); }).catch(() => {});
    return () => { live = false; };
  }, [wrikeFolder]);
  const folderMatcher = useMemo(() => (folderTasks?.length ? makeMatcher(folderTasks) : null), [folderTasks]);

  // Tasks made from here are trusted only while Wrike still has them. Once
  // the market's folder has been read, a record whose task isn't in it (it
  // was deleted in Wrike), or every record when the folder itself is gone,
  // stops counting, so those orders can be briefed again.
  const liveBriefed = useMemo(() => {
    const briefed = decide?.briefed || {};
    if (wrikeFolder?.state === "missing") return {};
    if (!folderTasks) return briefed;
    const there = new Set(folderTasks.map((t) => t.id));
    return Object.fromEntries(Object.entries(briefed).filter(([, task]) => there.has(task.id)));
  }, [decide?.briefed, wrikeFolder, folderTasks]);
  // And the stale records are dropped from the film, for everyone.
  useEffect(() => {
    const stale = Object.keys(decide?.briefed || {}).filter((k) => !(k in liveBriefed));
    if (stale.length && (folderTasks || wrikeFolder?.state === "missing")) decide?.onUnbriefed?.(stale);
    // Runs when what Wrike says changes, not on every new decide object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveBriefed]);

  const matches = useMemo(() => {
    const found = matcher ? matcher.match(orders, decide?.links, liveBriefed, kind) : orders.map(() => null);
    if (!folderMatcher) return found;
    const taken = new Set(found.filter(Boolean).map((m) => m.task.id));
    const local = folderMatcher.match(orders, {}, {}, kind);
    return found.map((m, i) => {
      if (m || decide?.links?.[orderKey(orders[i])] === "none" || !local[i] || taken.has(local[i].task.id)) return m;
      taken.add(local[i].task.id);
      return local[i];
    });
  }, [matcher, folderMatcher, orders, decide?.links, liveBriefed, kind]);
  // What can be picked by hand: the cache's and the folder's tasks for this
  // film and market, of the film's own kind, nearest first.
  const candidatesFor = (o) => {
    const all = [...(matcher?.candidates(o, kind) || []), ...(folderMatcher?.candidates(o, kind) || [])];
    const seen = new Set();
    return all.filter(({ task }) => !seen.has(task.id) && seen.add(task.id)).sort((a, b) => b.score - a.score);
  };
  const tasks = matches.map((m) => m?.task || null);
  const inWrike = tasks.filter(Boolean).length;

  // The delivery link on each matched task, read from Wrike as the market
  // opens and again after a Refresh. A failed read shows no links; it is not
  // worth an error on a page that works without them.
  const [delivery, setDelivery] = useState({});
  const taskIds = tasks.map((t) => t?.id || "").join(",");
  useEffect(() => {
    const ids = taskIds.split(",").filter(Boolean);
    if (!ids.length) { setDelivery({}); return undefined; }
    let live = true;
    readDeliveryLinks(ids).then(({ links }) => { if (live) setDelivery(links); }).catch(() => { if (live) setDelivery({}); });
    return () => { live = false; };
  }, [taskIds, orders]);
  // Wrike's link where it could be read, else the one already in the sheet:
  // the field is one not everybody can see in Wrike.
  const linkFor = (i) => (tasks[i] && delivery[tasks[i].id]) || deliveryLinkOf(orders[i].xyi?.deliveryLink);
  const delivered = orders.filter((_, i) => linkFor(i)).length;
  const fill = useMemo(() => planDeliveryFill(orders, tasks, delivery), [orders, taskIds, delivery]);
  const setAside = market.setAside || [];
  // Rows that can be ticked: all of them when editing; when briefing, only
  // the ones not in Wrike yet.
  // An order can be briefed when it isn't in Wrike yet and has its artwork.
  const briefable = (i) => !matches[i] && hasArtwork(orders[i]);
  const tickable = orders.map((_, i) => i).filter((i) => !briefing || briefable(i));
  const waitingForArtwork = orders.filter((o, i) => !matches[i] && !hasArtwork(o)).length;
  const toBrief = orders.filter((_, i) => !matches[i] && hasArtwork(orders[i])).length;
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

  useEffect(() => { setSelected(0); setExpanded(null); setEditing(false); setEdits({}); setUndo(null); setTicked(new Set()); setBriefing(null); }, [market.name]);
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

  const startBriefing = async () => {
    // Everything ready to brief starts ticked: that is usually the batch.
    const fresh = new Set(orders.map((_, i) => i).filter(briefable));
    setTicked(fresh);
    setExpanded(null);
    setBriefing({ loading: true });
    try {
      const found = await readMarketForBriefing({ filmTitle, kind, marketName: market.name });
      const mine = [...fresh].map((i) => orders[i]);
      setBriefing(found.ok ? { ...found, name: suggestBatchName(found.existingTitles, mine.length ? mine : orders), due: suggestDue(mine) } : found);
    } catch (err) {
      setBriefing({ ok: false, reason: /\(401\)|not_connected/.test(err.message) ? "Connect Wrike in Profile first." : "Wrike couldn't be reached." });
    }
  };
  const stopBriefing = () => { setBriefing(null); setTicked(new Set()); };

  // Arrived to brief: start once the market is on screen, then forget the
  // instruction so a reload doesn't start it again.
  const briefedOnOpen = useRef(false);
  useEffect(() => {
    if (!briefOnOpen || briefedOnOpen.current || !filmTitle || !orders.length) return;
    briefedOnOpen.current = true;
    startBriefing();
    onStarted?.();
    // Once, on arrival; startBriefing is recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefOnOpen]);

  const createInWrike = async () => {
    const chosen = [...ticked].sort((a, b) => a - b).map((i) => orders[i]);
    const plan = planBatch({ name: briefing.name, due: briefing.due, orders: chosen });
    if (!plan.ok) return notify(plan.problems[0]);
    const ok = await confirmAction({
      title: `Create "${plan.name}" and ${plan.tasks.length} ${plan.tasks.length === 1 ? "subtask" : "subtasks"} in Wrike?`,
      message: `In ${briefing.film} › ${briefing.parentFolder.title} › ${briefing.folder.title}, due ${formatDay(plan.due, today)}${briefing.status ? `, starting as ${briefing.status.name}` : ""}.\n\n${plan.tasks.slice(0, 6).map((t) => t.title).join("\n")}${plan.tasks.length > 6 ? `\nand ${plan.tasks.length - 6} more` : ""}\n\nNobody is assigned; do that in Wrike.`,
      confirmLabel: "Create in Wrike",
    });
    if (!ok) return;
    setCreating({ done: 0, total: plan.tasks.length });
    try {
      const result = await createBatch({ folder: briefing.folder, status: briefing.status, plan, onProgress: (done, total) => setCreating({ done, total }) });
      if (result.made.length) decide?.onBriefed(result.made);
      notify(
        result.failed.length
          ? `${plan.name} created with ${result.made.length} of ${plan.tasks.length} subtasks. Wrike refused ${result.failed.length === 1 ? "row" : "rows"} ${result.failed.map((f) => f.row).join(", ")}.`
          : `${plan.name} created in Wrike with ${result.made.length} ${result.made.length === 1 ? "subtask" : "subtasks"}.`,
        result.failed.length ? "error" : "success"
      );
      stopBriefing();
    } catch (err) {
      notify(/\(401\)|not_connected/.test(err.message) ? "Connect Wrike in Profile first." : "Wrike refused the batch task, so nothing was created.");
    } finally {
      setCreating(null);
    }
  };

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

  // Writes the links found in Wrike into the sheet's Delivery Link column,
  // after showing which rows get one. Empty cells only (planDeliveryFill).
  const fillDeliveryLinks = async () => {
    if (!market.sheetId) return notify("Refresh this market first, so its sheet can be written to from here.");
    if (!market.sheetNative) return notify("This market's sheet is an Excel file, not a Google Sheet, so it can't be written to from here.");
    const rows = fill.changes;
    const ok = await confirmAction({
      title: `Fill ${rows.length} delivery ${rows.length === 1 ? "link" : "links"} in ${market.name}'s sheet?`,
      message: `${rows.slice(0, 6).map((c) => `Row ${c.row} (${c.cell}): ${c.to}`).join("\n")}${rows.length > 6 ? `\nand ${rows.length - 6} more` : ""}${fill.kept ? `\n\n${fill.kept} ${fill.kept === 1 ? "row already holds" : "rows already hold"} something else and will be left alone.` : ""}\n\nThis writes to the sheet the market sees.`,
      confirmLabel: "Fill",
      danger: true,
    });
    if (!ok) return;
    setApplying(true);
    try {
      if (!googleCanWrite()) await connectGoogleForWriting();
      const result = await applyCellChanges(market.sheetId, rows.map((c) => ({ ...c, range: cellRange(c.tab, c.cell) })));
      notify(
        `${result.written} delivery ${result.written === 1 ? "link" : "links"} filled in${result.changed ? `, ${result.changed} left alone because the sheet had been edited since it was read` : ""}`,
        result.changed ? "error" : "success"
      );
      onChanged?.();
    } catch (err) {
      notify(err?.reason === "denied" ? "Google didn't grant edit access to spreadsheets, so nothing was written."
        : err?.reason === "no-access" ? "Your Google account can't edit this sheet."
        : googleMessage(err));
    } finally {
      setApplying(false);
    }
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
        // The delivery link shows with or without a matched task: it can come
        // from the sheet alone.
        return tasks[i] || linkFor(i) ? (
          <span className="flex items-center gap-1.5">
            {tasks[i] ? (
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
            ) : <span className="text-[#b6c3cc]">—</span>}
            {linkFor(i) && (
              <HoverLabel label="Open the delivery link">
                <a
                  href={linkFor(i)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Open the delivery link"
                  className="p-1 rounded-md text-[#1cc1a5] hover:bg-[#1cc1a5]/10 transition-colors"
                >
                  <Link2 className="w-3.5 h-3.5" />
                </a>
              </HoverLabel>
            )}
          </span>
        ) : <span className="text-[#b6c3cc]">—</span>;
      default:
        return <span className="block truncate" title={o[col.id]}>{o[col.id]}</span>;
    }
  };

  return (
    <div className="view-in bg-white border border-[#dce4ec] rounded-2xl shadow-sm overflow-hidden">
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
          {delivered > 0 && ` · ${delivered} with a delivery link`}
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
        ) : briefing ? (
          <button onClick={stopBriefing} disabled={!!creating} className="press px-3 py-1.5 rounded-lg bg-[#122027] hover:bg-[#25373c] text-sm font-bold text-white transition-colors disabled:opacity-60">
            Cancel briefing
          </button>
        ) : (
          <>
            {/* The sheet: open it, or change it from here. */}
            <div className={groupClass}>
              {market.sheetUrl && (
                <a href={market.sheetUrl} target="_blank" rel="noreferrer" title={market.sheetName} className={`group ${sweepClass} ${linkButtonClass}`}>
                  <Sweep />
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 transition-colors duration-300 group-hover/s:!text-white" />
                  Sheet
                  <ExternalLink className="w-3 h-3 text-[#768994] transition-[transform,color] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover/s:!text-white" />
                </a>
              )}
              <button onClick={startEditing} className={`group ${sweepClass} ${linkButtonClass}`}>
                <Sweep />
                <PencilLine className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-rotate-12" />
                Edit
              </button>
              {fill.changes.length > 0 && (
                <HoverLabel label="Copy the delivery links on these orders' Wrike tasks into the sheet's Delivery Link column. You see the rows first.">
                  <button onClick={fillDeliveryLinks} disabled={applying} className={`group ${sweepClass} ${linkButtonClass} disabled:opacity-60`}>
                    <Sweep />
                    {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5 text-[#1cc1a5] transition-colors duration-300 group-hover/s:!text-white" />}
                    Fill {fill.changes.length} {fill.changes.length === 1 ? "link" : "links"}
                  </button>
                </HoverLabel>
              )}
            </div>

            {/* Wrike: the market's folder, then its orders. Whichever is next
                is the one that stands out. */}
            <div className="flex items-center gap-2">
              <WrikeFolderButton
                filmTitle={filmTitle}
                kind={kind}
                marketName={market.name}
                driveUrl={market.folderUrl}
                known={wrikeFolder}
                onMade={(folder) => setWrikeFolder({ state: "exists", folder })}
              />
              {orders.length > 0 && (toBrief === 0 && waitingForArtwork > 0 ? (
                <span title="Choose their artwork in the sheet, or with Edit, to brief them" className="px-3 py-1.5 text-sm font-bold text-amber-700">
                  {waitingForArtwork} waiting for artwork
                </span>
              ) : toBrief === 0 ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-emerald-600">
                  <Check className="pop-in w-4 h-4" strokeWidth={3} />
                  All in Wrike
                </span>
              ) : (
                <HoverLabel label={wrikeFolder?.state === "missing" ? "Add this market's folder to Wrike first" : undefined}>
                  <button
                    onClick={startBriefing}
                    className={`group press flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-bold transition-[box-shadow,opacity] ${
                      wrikeFolder?.state === "missing"
                        ? "border border-[#dce4ec] text-[#768994]"
                        : "bg-gradient-to-r from-[#12a0e1] to-[#1cc1a5] text-white shadow-md shadow-[#12a0e1]/20 hover:shadow-lg hover:shadow-[#12a0e1]/30"
                    }`}
                  >
                    <Send className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    Brief {toBrief} into Wrike
                  </button>
                </HoverLabel>
              ))}
            </div>
          </>
        ))}
        {!filmTitle && market.sheetUrl && (
          <a href={market.sheetUrl} target="_blank" rel="noreferrer" title={market.sheetName} className={`${groupClass} ${linkButtonClass}`}>
            <ExternalLink className="w-3.5 h-3.5" />
            Sheet
          </a>
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

      {briefing && (
        <div className="px-5 py-3 border-b border-[#dce4ec] bg-slate-50 animate-in fade-in slide-in-from-top-1 duration-200">
          {briefing.loading ? (
            <p className="flex items-center gap-2 text-sm text-[#768994]"><Loader2 className="w-4 h-4 animate-spin" /> Looking at this market in Wrike…</p>
          ) : !briefing.ok ? (
            <p role="alert" className="text-sm font-medium text-amber-700">{briefing.reason}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <p className="text-sm font-bold text-[#122027] pb-2 mr-1">
                  {ticked.size} {ticked.size === 1 ? "order" : "orders"} to brief
                </p>
                <label className="w-72">
                  <span className="block mb-1 text-[10px] font-black uppercase tracking-widest text-[#768994]">Batch task name</span>
                  <input
                    value={briefing.name}
                    onChange={(e) => setBriefing((b) => ({ ...b, name: e.target.value }))}
                    className={`${cellInputClass} border-[#dce4ec] py-1.5 font-mono`}
                  />
                </label>
                <div className="w-44">
                  <span className="block mb-1 text-[10px] font-black uppercase tracking-widest text-[#768994]">Due</span>
                  <DateField floating compact value={briefing.due} onChange={(due) => setBriefing((b) => ({ ...b, due }))} ariaLabel="Batch due date" placeholder="Pick a date" allowClear={false} />
                </div>
                <button
                  onClick={createInWrike}
                  disabled={!!creating || ticked.size === 0}
                  className="press flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  {creating ? `Creating ${creating.done} of ${creating.total}` : `Create ${ticked.size + 1} tasks in Wrike`}
                </button>
              </div>
              {waitingForArtwork > 0 && (
                <p className="mt-2 text-[11px] font-bold text-amber-700">
                  {waitingForArtwork} {waitingForArtwork === 1 ? "order has" : "orders have"} no artwork selected, so {waitingForArtwork === 1 ? "it can't" : "they can't"} be briefed yet. Choose the artwork in the sheet (or with Edit), then brief {waitingForArtwork === 1 ? "it" : "them"}.
                </p>
              )}
              <p className="mt-2 text-[11px] text-[#768994]">
                One batch task in {briefing.film} › {briefing.parentFolder.title} › <span className="font-bold text-[#122027]">{briefing.folder.title}</span>, with a subtask for each ticked order, named as the sheet names it.{" "}
                {briefing.status ? `They start as ${briefing.status.name} in the ${briefing.status.workflow} workflow.` : "No Backlog status was found in the Studio workflow, so they start in Wrike's default status."}{" "}
                You're shown the full list before anything is created.
              </p>
            </>
          )}
        </div>
      )}

      {editing && ticked.size > 0 && (
        <div className="flex flex-wrap items-end gap-3 px-5 py-3 border-b border-[#dce4ec] bg-slate-50 animate-in fade-in slide-in-from-top-1 duration-200">
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
              <col style={{ width: editing || briefing?.ok ? 84 : 64 }} />
              {columns.map((col) => <col key={col.id} style={col.width ? { width: col.width } : undefined} />)}
            </colgroup>
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-[#768994]">
                <th className="px-3 py-2.5 bg-slate-50 border-b border-[#dce4ec] font-black">
                  <span className="flex items-center gap-2">
                    {(editing || briefing?.ok) && (
                      <input
                        type="checkbox"
                        aria-label="Tick every order"
                        checked={tickable.length > 0 && ticked.size === tickable.length}
                        onChange={() => setTicked(ticked.size === tickable.length ? new Set() : new Set(tickable))}
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
                      onClick={() => { if (!editing) toggleRow(i); setSelected(i); }}
                      title={editing ? undefined : "Open this order's details"}
                      style={{ "--i": i }}
                      className={`list-row-in group ${editing ? "" : "cursor-pointer"} ${open ? "bg-[#12a0e1]/10" : "hover:bg-slate-50"}`}
                    >
                      <td className="px-3 py-2 border-b border-slate-100">
                        <span className="flex items-center gap-2">
                        {(editing || briefing?.ok) && (
                          <input
                            type="checkbox"
                            aria-label={`Tick row ${o.row}`}
                            // An order already in Wrike isn't briefed again, and
                            // one without its artwork isn't ready to be.
                            disabled={!!briefing && !briefable(i)}
                            title={briefing && matches[i] ? "Already in Wrike" : briefing && !hasArtwork(o) ? "No artwork selected yet" : undefined}
                            checked={ticked.has(i)}
                            onChange={() => setTicked((prev) => { const next = new Set(prev); if (!next.delete(i)) next.add(i); return next; })}
                            className="accent-indigo-600 shrink-0"
                          />
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleRow(i); setSelected(i); }}
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
                    {(open || closing === i) && (
                      <tr>
                        <td colSpan={columns.length + 1} className="p-0">
                          {/* The details open out and fold away; they don't
                              snap. The height is animated to what they need. */}
                          <AnimatePresence initial onExitComplete={() => setClosing((c) => (c === i ? null : c))}>
                          {open && (
                          <motion.div
                            key="details"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ height: { duration: 0.28, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.2 } }}
                            className="overflow-hidden border-b border-[#dce4ec]"
                          >
                            <OrderDetail
                              order={o}
                              task={tasks[i]}
                              deliveryLink={linkFor(i)}
                              how={matches[i]?.how}
                              parent={wrikeParents?.get(tasks[i]?.id)}
                              today={today}
                              matching={decide && matcher ? {
                                link: decide.links?.[orderKey(o)],
                                candidates: candidatesFor(o),
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
                          </motion.div>
                          )}
                          </AnimatePresence>
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
