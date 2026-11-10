// The Job Book: every job, with filters, editing and the Studio
// Scan. Also used by the PMs' Job Book page.
//
// Part of Administration. Split out of components/Management.jsx, which is
// still the entry point and re-exports what other screens import.
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Plus, Pencil, Trash2, Check, Search, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, ArrowUp, ArrowDown, CheckCircle2 } from "lucide-react";
import { supabase, selectAll } from "../../lib/supabaseClient";
import { confirmAction } from "../../lib/confirm";
import { notify } from "../../lib/toast";
import { useColumnResize } from "../../lib/useColumnResize";
import { STUDIOS } from "../../lib/studios";
import { PRINT_DIGITAL, annotateJob, filterJobs, isSortable, monthApplies, relabelJob, sortJobs } from "../../lib/jobBook";
import { timeAgo } from "../../lib/systemStatus";
import { useWrikeJobCheck } from "../../hooks/useWrikeJobCheck";
import { isoToday } from "../../utils/dates";
import { layoutRect, layoutViewport } from "../../utils/zoom";
import DateField from "../shared/DateField";
import MonthPicker from "../shared/MonthPicker";
import { JOB_STATUSES } from "./constants";
import { FeedSelect } from "./fields";
import { JobModal } from "./JobForm";
import { StudioJobScanModal } from "./StudioJobScanModal";

const STATUS_BADGE = { Inactive: "bg-slate-100 text-slate-500", Active: "bg-[#1cc1a5]/15 text-[#0f766e]", Closed: "bg-[#122027] text-white" };
const STATUS_DOT = { Inactive: "bg-slate-300", Active: "bg-[#1cc1a5]", Closed: "bg-[#122027]" };
const PD_BADGE = { Digital: "bg-cyan-100 text-cyan-700", Print: "bg-orange-100 text-orange-700", Both: "bg-violet-100 text-violet-700" };
const PER_PAGE = 50;
// Bulk-editing either of these also rewrites the job's label, which repeats them.
const LABEL_FIELDS = new Set(["film_title", "project_description"]);

const gbp = (n) => `£${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
const COST_KINDS = [["fixed_cost", "fixed"], ["estimated_cost", "est."], ["third_party_cost", "3rd party"]];
const monthLabel = (iso) =>
  new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, 1)
    .toLocaleDateString("en-GB", { month: "long", year: "numeric" });

function Pager({ page, totalPages, setPage }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
        aria-label="Previous page" className="press p-1 disabled:opacity-30 hover:bg-slate-100 rounded-lg">
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <span className="text-xs font-bold text-[#768994] tabular-nums">{page + 1} / {totalPages}</span>
      <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page === totalPages - 1}
        aria-label="Next page" className="press p-1 disabled:opacity-30 hover:bg-slate-100 rounded-lg">
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// A button that opens a small menu of choices. Portalled and fixed so a table's
// clipped cells can't cut it off; it opens upwards when there's no room below.
// `options` are { value, label, dot? }.
function MenuSelect({ value, options, onChange, label, placeholder = "Choose…", className = "" }) {
  const [rect, setRect] = useState(null);
  const btnRef = useRef(null);
  const open = !!rect;

  useEffect(() => {
    if (!open) return;
    const close = () => setRect(null);
    const onKey = (e) => { if (e.key === "Escape") { close(); btnRef.current?.focus(); } };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const MENU_H = Math.min(options.length * 32 + 10, 330);
  const above = open && rect.bottom + MENU_H + 8 > layoutViewport().vh;
  const current = options.find((o) => o.value === value);

  return (
    <>
      <button ref={btnRef} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label}
        onClick={() => setRect(open ? null : layoutRect(btnRef.current))}
        className={`press inline-flex items-center justify-between gap-1 outline-none focus-visible:ring-2 focus-visible:ring-[#1cc1a5]/50 ${className}`}>
        <span className={current ? "truncate" : "truncate opacity-60"}>{current ? current.label : placeholder}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 opacity-60 transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? "rotate-180" : ""}`} />
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setRect(null)} />
          <div role="menu" aria-label={label}
            className="pop-in fixed z-[9999] bg-white border border-[#dce4ec] rounded-xl shadow-xl p-1 overflow-y-auto"
            style={{ "--pop-origin": above ? "bottom left" : "top left", left: rect.left, minWidth: Math.max(150, rect.width), maxHeight: MENU_H,
                     ...(above ? { top: rect.top - MENU_H - 4 } : { top: rect.bottom + 4 }) }}>
            {options.map((o) => (
              <button key={o.value} type="button" role="menuitemradio" aria-checked={o.value === value} autoFocus={o.value === value}
                onClick={() => { setRect(null); if (o.value !== value) onChange(o.value); }}
                className="w-full h-8 flex items-center gap-2 px-2.5 rounded-lg text-xs font-bold text-[#122027] whitespace-nowrap transition-colors duration-100 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-slate-100 focus-visible:bg-slate-100 outline-none">
                {o.dot && <span className={`w-2 h-2 rounded-full ${o.dot}`} />}
                {o.label}
                {o.value === value && <Check className="ml-auto w-3.5 h-3.5 text-[#1cc1a5]" />}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  );
}

// Where the Job Book stands against Wrike, checked without being asked.
function WrikeStrip({ check, onOpen }) {
  const { state, waiting, treeAt, lastEventAt, health } = check;
  const behind = health === "ok" ? null : (
    <span className="w-full text-amber-800">
      TimeHub&rsquo;s copy of Wrike may be behind:{" "}
      {health === "old"
        ? `it was last read in full ${timeAgo(treeAt, new Date())}.`
        : `Wrike hasn't sent a live update since ${timeAgo(lastEventAt, new Date())}.`}{" "}
      <button onClick={() => onOpen("live")} className="font-bold underline underline-offset-2 hover:text-[#122027]">Read Wrike again</button>
    </span>
  );
  const box = "fade-in-fast mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-2.5 text-xs";
  if (state === "checking") {
    return (
      <div key="checking" className={`${box} border-[#dce4ec] text-[#768994]`}>
        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Checking Wrike for new jobs…
      </div>
    );
  }
  if (state === "unavailable") {
    return (
      <div className={`${box} border-[#dce4ec] text-[#768994]`}>
        <span>Couldn&rsquo;t check Wrike for new jobs by itself.</span>
        <button onClick={() => onOpen("live")} className="font-bold text-[#0f766e] hover:underline">Check now</button>
      </div>
    );
  }
  const fresh = waiting.newJobs.length;
  const mismatched = waiting.corrections.length + waiting.redundant.length;
  if (!fresh && !mismatched) {
    return (
      <div key="in-step" className={`${box} border-[#dce4ec] text-[#768994]`}>
        <CheckCircle2 className="settle-in w-4 h-4 text-[#1cc1a5]" />
        <span className="font-bold text-[#122027]">In step with Wrike</span>
        {treeAt && !behind && <span>Wrike&rsquo;s folders were last read in full {timeAgo(treeAt, new Date())}</span>}
        <button onClick={() => onOpen("saved")} className="ml-auto font-bold text-[#0f766e] hover:underline">Open the comparison</button>
        {behind}
      </div>
    );
  }
  return (
    <div key="waiting" className={`${box} border-[#1cc1a5]/40 bg-[#1cc1a5]/[0.06] text-[#122027]`}>
      <span className="font-bold">
        {fresh > 0 && `${fresh} new job${fresh === 1 ? "" : "s"} in Wrike ${fresh === 1 ? "isn't" : "aren't"} in the Job Book yet`}
        {fresh > 0 && mismatched > 0 && " · "}
        {mismatched > 0 && `${mismatched} job${mismatched === 1 ? "" : "s"} here ${mismatched === 1 ? "doesn't" : "don't"} match Wrike`}
      </span>
      <button onClick={() => onOpen("saved")}
        className="ml-auto px-3.5 py-1.5 bg-[#1cc1a5] hover:bg-[#17a892] text-white font-bold rounded-lg press">
        {fresh > 0 ? "Review and add" : "Review"}
      </button>
      {behind}
    </div>
  );
}

const STATUS_OPTIONS = JOB_STATUSES.map((s) => ({ value: s, label: s, dot: STATUS_DOT[s] }));

function Chip({ on, onClick, children, title }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={on}
      className={`px-3 py-2 text-xs font-bold rounded-xl border press ${
        on ? "bg-[#1cc1a5]/10 border-[#1cc1a5]/50 text-[#0f766e]" : "bg-white border-[#dce4ec] text-[#768994] hover:text-[#122027] hover:border-slate-300"
      }`}>
      {children}
    </button>
  );
}

// ── Job Book Section ───────────────────────────────────────────────────────────
// Exported: also rendered standalone as the PMs' "Job Book" page (JobBook.jsx).
export function JobBookSection({ setActiveTab }) {
  const JOBBOOK_COLS = [
    { key: "job_number",  label: "Job #",               px: 110 },
    { key: "date",        label: "Date",                px: 90  },
    { key: "client",      label: "Client",              px: 140 },
    { key: "office",      label: "Office",              px: 70  },
    { key: "pd",          label: "P/D",                 px: 60  },
    { key: "film",        label: "Film Title",          px: 160 },
    { key: "project",     label: "Project Description", px: 220 },
    { key: "costs",       label: "Costs",               px: 110 },
    { key: "ordered_by",  label: "Ordered By",          px: 120 },
    { key: "billed_to",   label: "Billed To",           px: 120 },
    { key: "status",      label: "Status",              px: 110 },
    { key: "done",        label: "Done",                px: 70  },
    { key: "actions",     label: "",                    px: 90  },
  ];
  const { widths: jbWidths, resizeHandle: jbHandle } = useColumnResize("mgmt-jobbook-cols", JOBBOOK_COLS);

  const [jobs, setJobs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  // Local, not UTC: toISOString() rolls back a day west of Greenwich, which on
  // the 1st of a month would default this filter to the previous month.
  const [monthFilter, setMonthFilter] = useState(() => isoToday().slice(0, 7));
  const [statusFilter, setStatusFilter] = useState("");
  const [studioFilter, setStudioFilter] = useState("");
  const [pdFilter, setPdFilter] = useState("");
  const [undated, setUndated]   = useState(false);
  const [attention, setAttention] = useState(false);
  const [sort, setSort]         = useState({ key: "date", dir: "desc" });
  const [showModal, setShowModal] = useState(false);
  const [showScan, setShowScan] = useState(null); // null | "saved" | "live"
  const [editJob, setEditJob]   = useState(null);
  const [saving, setSaving]     = useState(false);
  const [clients, setClients]   = useState([]);
  const [films, setFilms]       = useState([]);
  const [workCategories, setWorkCategories] = useState([]);
  const [descs, setDescs]       = useState([]);
  const [page, setPage]         = useState(0);

  // ── Bulk edit ────────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkField, setBulkField] = useState("client");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkBusy, setBulkBusy]   = useState(false);

  const loadRef = useCallback(async () => {
    const [c, f, cat, d] = await Promise.all([
      supabase.from("clients").select("name").order("name"),
      supabase.from("films").select("title, created_at").order("created_at", { ascending: false }),
      supabase.from("job_work_categories").select("name").order("name"),
      supabase.from("project_descriptions").select("description").order("description"),
    ]);
    setClients((c.data || []).map(x => x.name));
    setFilms((f.data || []).map(x => x.title));
    setWorkCategories((cat.data || []).map(x => x.name));
    setDescs((d.data || []).map(x => x.description));
  }, []);

  // The whole book in one read: search has to reach every month, and the
  // filters and sort all run in the browser.
  const loadJobs = useCallback(async () => {
    try {
      const data = await selectAll("jobs", "*");
      setJobs(data.map(annotateJob));
    } catch (e) {
      notify("Couldn't load the Job Book: " + (e.message || e), "error");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadRef(); }, [loadRef]);
  useEffect(() => { loadJobs(); }, [loadJobs]);

  const wrikeCheck = useWrikeJobCheck(jobs, !loading);

  const filters = useMemo(
    () => ({ search, month: monthFilter, undated, attention, status: statusFilter, studio: studioFilter, pd: pdFilter }),
    [search, monthFilter, undated, attention, statusFilter, studioFilter, pdFilter]
  );
  const filtered = useMemo(
    () => sortJobs(filterJobs(jobs, filters), sort.key, sort.dir),
    [jobs, filters, sort]
  );
  const monthOn = monthApplies(filters);

  // A selection only ever covers rows the current filters show, so a bulk edit
  // or delete can't reach a job that has since scrolled out of the list.
  useEffect(() => { setSelectedIds(new Set()); setPage(0); }, [filters]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const paginated = filtered.slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE);

  const undatedCount = useMemo(() => jobs.filter((j) => !j.start_date).length, [jobs]);
  const attentionCount = useMemo(() => jobs.filter((j) => j._missing.length).length, [jobs]);
  const studioOptions = useMemo(() => {
    const present = new Set(jobs.map((j) => j._studio));
    return [...STUDIOS.map((s) => s.studio), "Other"].filter((s) => present.has(s)).map((s) => ({ value: s, label: s }));
  }, [jobs]);

  const activeFilters = [
    search.trim() && `“${search.trim()}”`,
    monthOn && monthLabel(monthFilter),
    undated && "no date",
    attention && "needs attention",
    statusFilter, studioFilter, pdFilter,
  ].filter(Boolean);
  const clearFilters = () => {
    setSearch(""); setMonthFilter(""); setUndated(false); setAttention(false);
    setStatusFilter(""); setStudioFilter(""); setPdFilter("");
  };

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "desc" : "asc" }));

  const handleSave = async (form) => {
    setSaving(true);
    const payload = {
      ...form,
      start_date: form.start_date || null,
      completed_date: form.completed_date || null,
      fixed_cost: form.fixed_cost === "" ? null : parseFloat(form.fixed_cost),
      third_party_cost: form.third_party_cost === "" ? null : parseFloat(form.third_party_cost),
      estimated_cost: form.estimated_cost === "" ? null : parseFloat(form.estimated_cost),
    };
    // supabase-js resolves rather than throws on a database error, so the
    // result has to be checked or a rejected row closes the modal in silence.
    const { error } = editJob?.id
      ? await supabase.from("jobs").update(payload).eq("id", editJob.id)
      : await supabase.from("jobs").insert(payload);
    setSaving(false);
    if (error) {
      notify(
        error.code === "23505"
          ? `Job number “${form.job_number}” clashes with a job already in the book — the same XY code can only be filed once.`
          : "Couldn't save the job: " + error.message,
        "error"
      );
      return;
    }
    setShowModal(false); setEditJob(null);
    await loadJobs();
  };

  // One-field writes from the row itself. The row changes at once and goes
  // back if the database refuses.
  const patchJob = async (job, patch, what) => {
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, ...patch } : j)));
    const { error } = await supabase.from("jobs").update(patch).eq("id", job.id);
    if (!error) return;
    const undo = Object.fromEntries(Object.keys(patch).map((k) => [k, job[k]]));
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, ...undo } : j)));
    notify(`Couldn't change ${what}: ${error.message}`, "error");
  };

  const deleteJob = async (job) => {
    const ok = await confirmAction({
      title: `Delete ${job._code || "this job"}?`,
      message: `“${job.job_number}” will be removed from the Job Book. This can't be undone.`,
      confirmLabel: "Delete job",
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("jobs").delete().eq("id", job.id);
    if (error) { notify("Couldn't delete the job: " + error.message, "error"); return; }
    await loadJobs();
  };

  // Columns that can be set across many rows at once. `type` drives the value
  // control; `list` supplies a datalist of existing values for free-text fields.
  const BULK_FIELDS = [
    { key: "client",              label: "Client",              type: "text",   list: clients },
    { key: "status",              label: "Status",              type: "select", opts: JOB_STATUSES, noClear: true },
    { key: "print_digital",       label: "Print / Digital",     type: "select", opts: PRINT_DIGITAL },
    { key: "office",              label: "Office",              type: "text" },
    { key: "film_title",          label: "Film Title",          type: "text",   list: films },
    { key: "project_description", label: "Project Description", type: "text",   list: descs },
    { key: "ordered_by",          label: "Ordered By",          type: "text" },
    { key: "billed_to",           label: "Billed To",           type: "text" },
    { key: "start_date",          label: "Start Date",          type: "date" },
    { key: "job_done",            label: "Done",                type: "bool" },
  ];
  const activeBulkField = BULK_FIELDS.find((f) => f.key === bulkField) || BULK_FIELDS[0];
  // Status is NOT NULL and Done is yes or no: neither has a "clear".
  const bulkNeedsValue = activeBulkField.noClear || activeBulkField.type === "bool";

  // The header box ticks the page in front of you. Reaching every match on
  // every page is a second, spelled-out step in the bar.
  const pageIds = paginated.map((j) => j.id);
  const pageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const toggleRow = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const togglePage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      pageIds.forEach((id) => (pageSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  const selectAllMatching = () => setSelectedIds(new Set(filtered.map((j) => j.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const applyBulk = async () => {
    if (!selectedIds.size) return;
    let val;
    if (activeBulkField.type === "bool") val = bulkValue === "yes";
    else if (activeBulkField.type === "date") val = bulkValue || null;
    else val = bulkValue.trim() === "" ? null : bulkValue.trim();

    const relabels = LABEL_FIELDS.has(bulkField);
    const n = selectedIds.size;
    const ok = await confirmAction({
      title: `Set ${activeBulkField.label} on ${n} job${n === 1 ? "" : "s"}?`,
      message:
        (val === null
          ? `This clears ${activeBulkField.label} on every selected row.`
          : `Every selected row's ${activeBulkField.label} becomes “${activeBulkField.type === "bool" ? (val ? "Done" : "Not done") : val}”.`)
        + (relabels ? " Each job's label is rebuilt to match." : ""),
      confirmLabel: "Apply to all",
    });
    if (!ok) return;

    setBulkBusy(true);
    const same = [], relabelled = [];
    for (const j of jobs) {
      if (!selectedIds.has(j.id)) continue;
      const label = relabels ? relabelJob(j, { [bulkField]: val }) : j.job_number;
      if (label === j.job_number) same.push(j.id); else relabelled.push({ id: j.id, label });
    }
    let failure = null;
    for (let i = 0; i < same.length && !failure; i += 200) {
      const { error } = await supabase.from("jobs").update({ [bulkField]: val }).in("id", same.slice(i, i + 200));
      failure = error;
    }
    // A new label is different for every row, so these go one write each.
    for (let i = 0; i < relabelled.length && !failure; i += 8) {
      const results = await Promise.all(relabelled.slice(i, i + 8).map((r) =>
        supabase.from("jobs").update({ [bulkField]: val, job_number: r.label }).eq("id", r.id)));
      failure = results.find((r) => r.error)?.error || null;
    }
    setBulkBusy(false);
    if (failure) notify("The bulk edit stopped part-way: " + failure.message, "error");
    else { clearSelection(); setBulkValue(""); }
    await loadJobs();
  };

  const bulkDelete = async () => {
    if (!selectedIds.size) return;
    const n = selectedIds.size;
    const ok = await confirmAction({
      title: `Delete ${n} job${n === 1 ? "" : "s"}?`,
      message: `${n} Job Book row${n === 1 ? "" : "s"} will be permanently removed. This can't be undone. (Rescanning Wrike re-imports them.)`,
      confirmLabel: `Delete ${n}`,
      danger: true,
    });
    if (!ok) return;
    setBulkBusy(true);
    const ids = [...selectedIds];
    let failure = null;
    for (let i = 0; i < ids.length && !failure; i += 200) {
      const { error } = await supabase.from("jobs").delete().in("id", ids.slice(i, i + 200));
      failure = error;
    }
    setBulkBusy(false);
    if (failure) notify("The delete stopped part-way: " + failure.message, "error");
    else clearSelection();
    await loadJobs();
  };

  const bulkInput = "text-[12px] font-bold border border-[#dce4ec] rounded-lg px-2 py-1.5 bg-white outline-none focus:border-[#1cc1a5]";

  return (
    <div>
      <WrikeStrip check={wrikeCheck} onOpen={setShowScan} />

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#768994]" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search the whole book — try “Eben Titles”…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-[#dce4ec] rounded-xl outline-none focus:border-[#1cc1a5] bg-white"
          />
        </div>
        <button onClick={() => setActiveTab?.("jobsSetup")}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#1cc1a5] hover:bg-[#17a892] text-white text-sm font-bold rounded-xl press shrink-0">
          <Plus className="w-4 h-4" /> Add Jobs
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <MonthPicker value={monthFilter} onChange={setMonthFilter}
          className={monthFilter && !monthOn ? "opacity-50" : ""} />
        <FeedSelect value={statusFilter} onChange={setStatusFilter} allLabel="Any status" className="w-[140px]"
          options={JOB_STATUSES.map((s) => ({ value: s, label: s }))} />
        <FeedSelect value={studioFilter} onChange={setStudioFilter} allLabel="Any studio" className="w-[150px]"
          options={studioOptions} />
        <FeedSelect value={pdFilter} onChange={setPdFilter} allLabel="Print & digital" className="w-[150px]"
          options={PRINT_DIGITAL.map((s) => ({ value: s, label: s }))} />
        <Chip on={undated} onClick={() => setUndated((v) => !v)} title="Jobs with no start date">
          No date · {undatedCount}
        </Chip>
        <Chip on={attention} onClick={() => setAttention((v) => !v)} title="Jobs missing a client, a start date or a film">
          Needs attention · {attentionCount}
        </Chip>
        {activeFilters.length > 0 && (
          <button onClick={clearFilters} className="px-2 py-2 text-xs font-bold text-[#768994] hover:text-rose-500">
            Clear filters
          </button>
        )}
      </div>

      {showScan && (
        <StudioJobScanModal
          startFrom={showScan}
          onClose={() => { setShowScan(null); wrikeCheck.recheck(); }}
          onApplied={async () => { setShowScan(null); wrikeCheck.recheck(); await loadJobs(); }}
        />
      )}

      <div className="flex items-center justify-between mb-2 min-h-[24px]">
        <p className="text-[11px] font-bold text-[#768994]">
          <span className="font-black uppercase tracking-widest text-[10px]">{filtered.length} job{filtered.length === 1 ? "" : "s"}</span>
          {monthFilter && !monthOn && (
            <span className="ml-2 normal-case">
              · {search.trim() ? "searching every month" : "showing every month"}, not just {monthLabel(monthFilter)}
            </span>
          )}
        </p>
        <Pager page={safePage} totalPages={totalPages} setPage={setPage} />
      </div>

      {selectedIds.size > 0 && (
        <div className="rise-in mb-3 flex flex-wrap items-center gap-2 bg-[#1cc1a5]/[0.06] border border-[#1cc1a5]/30 rounded-2xl px-4 py-2.5">
          <span className="text-[11px] font-black text-[#0f766e]">
            {allSelected && totalPages > 1
              ? `All ${selectedIds.size} matching jobs selected, across ${totalPages} pages`
              : `${selectedIds.size} selected`}
          </span>
          {!allSelected && pageSelected && filtered.length > pageIds.length && (
            <button onClick={selectAllMatching} className="text-[11px] font-bold text-[#0f766e] underline underline-offset-2 hover:text-[#122027]">
              Select all {filtered.length} that match
            </button>
          )}
          <button onClick={clearSelection} className="text-[11px] font-bold text-[#768994] hover:text-rose-500">Clear</button>
          <span className="text-[11px] font-bold text-[#768994] ml-2">Set</span>
          <MenuSelect value={bulkField} label="Field to change" className={`${bulkInput} min-w-[150px]`}
            options={BULK_FIELDS.map((f) => ({ value: f.key, label: f.label }))}
            onChange={(v) => { setBulkField(v); setBulkValue(""); }} />
          <span className="text-[11px] font-bold text-[#768994]">to</span>
          {activeBulkField.type === "select" ? (
            <MenuSelect value={bulkValue} onChange={setBulkValue} label={`New ${activeBulkField.label}`}
              className={`${bulkInput} min-w-[130px]`}
              options={[
                ...(activeBulkField.noClear ? [] : [{ value: "", label: "Nothing (clear it)" }]),
                ...activeBulkField.opts.map((o) => ({ value: o, label: o, dot: activeBulkField.key === "status" ? STATUS_DOT[o] : undefined })),
              ]} />
          ) : activeBulkField.type === "bool" ? (
            <MenuSelect value={bulkValue} onChange={setBulkValue} label="Done or not" className={`${bulkInput} min-w-[130px]`}
              options={[{ value: "yes", label: "Done" }, { value: "no", label: "Not done" }]} />
          ) : activeBulkField.type === "date" ? (
            <DateField value={bulkValue} onChange={setBulkValue} compact floating className="w-[150px]"
              placeholder="No date (clear it)" ariaLabel="New start date" />
          ) : (
            <>
              <input list={`bulk-${activeBulkField.key}`} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
                placeholder="value (blank = clear)"
                className="text-[12px] font-medium border border-[#dce4ec] rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-[#1cc1a5] min-w-[180px]" />
              {activeBulkField.list && (
                <datalist id={`bulk-${activeBulkField.key}`}>
                  {activeBulkField.list.map(v => <option key={v} value={v} />)}
                </datalist>
              )}
            </>
          )}
          <button onClick={applyBulk} disabled={bulkBusy || (bulkNeedsValue && !bulkValue)}
            className="ml-auto flex items-center gap-1.5 px-4 py-1.5 bg-[#1cc1a5] hover:bg-[#17a892] disabled:bg-slate-200 disabled:text-slate-400 text-white text-[12px] font-bold rounded-lg press">
            {bulkBusy ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Applying…</> : `Apply to ${selectedIds.size}`}
          </button>
          <button onClick={bulkDelete} disabled={bulkBusy} title="Delete selected rows"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 hover:border-rose-300 disabled:opacity-40 text-rose-600 text-[12px] font-bold rounded-lg press">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-[#768994]">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading jobs…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#dce4ec]">
          <table className="w-full text-xs [&_td]:overflow-hidden" style={{ tableLayout: "fixed", minWidth: `${JOBBOOK_COLS.reduce((s, c) => s + jbWidths[c.key], 0)}px` }}>
            <colgroup>
              {JOBBOOK_COLS.map(c => <col key={c.key} style={{ width: jbWidths[c.key] }} />)}
            </colgroup>
            <thead>
              <tr className="bg-[#0d1b22] border-b border-white/10">
                {JOBBOOK_COLS.map(c => {
                  const sorted = sort.key === c.key;
                  const Arrow = sort.dir === "asc" ? ArrowUp : ArrowDown;
                  return (
                    <th key={c.key}
                      aria-sort={sorted ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                      className="relative px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-white border-r border-white/5 last:border-r-0 whitespace-nowrap overflow-hidden">
                      <span className="flex items-center gap-2">
                        {c.key === "job_number" && (
                          <input type="checkbox" checked={pageSelected} onChange={togglePage}
                            title="Select this page" aria-label="Select this page" className="accent-[#1cc1a5]" />
                        )}
                        {isSortable(c.key) ? (
                          <button type="button" onClick={() => toggleSort(c.key)} title={`Sort by ${c.label}`}
                            className={`flex items-center gap-1 uppercase tracking-widest font-black transition-colors ${sorted ? "text-[#5eead4]" : "hover:text-[#5eead4]"}`}>
                            {c.label}
                            {sorted && <Arrow className="w-3 h-3" />}
                          </button>
                        ) : c.label}
                      </span>
                      {jbHandle(c.key)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={JOBBOOK_COLS.length} className="text-center py-12 text-[#768994]">
                    {jobs.length === 0 ? (
                      <p className="italic">The Job Book is empty.</p>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-[#122027]">No jobs match</p>
                        <p className="mt-1">Filtered by {activeFilters.join(" · ")}</p>
                        <button onClick={clearFilters}
                          className="mt-3 px-4 py-1.5 text-xs font-bold text-[#0f766e] border border-[#1cc1a5]/40 hover:bg-[#1cc1a5]/10 rounded-lg transition-colors">
                          Clear filters
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ) : paginated.map(j => {
                const costs = COST_KINDS.filter(([field]) => j[field] != null && Number(j[field]) > 0);
                const status = j.status || "Inactive";
                return (
                  <tr key={j.id} className={`border-b border-[#dce4ec] last:border-0 transition-colors ${selectedIds.has(j.id) ? "bg-[#1cc1a5]/5" : "hover:bg-slate-50/50"} ${j.job_done ? "opacity-50" : ""}`}>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <input type="checkbox" checked={selectedIds.has(j.id)} onChange={() => toggleRow(j.id)}
                          aria-label={`Select ${j._code || j.job_number}`} className="accent-[#1cc1a5] shrink-0" />
                        <span title={j.job_number} className="font-black text-[#0f766e] font-mono truncate">{j._code || j.job_number}</span>
                        {j._missing.length > 0 && (
                          <span title={`Missing: ${j._missing.join(", ")}`} aria-label={`Missing: ${j._missing.join(", ")}`}
                            className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-[#768994] tabular-nums">
                      {j.start_date ? new Date(j.start_date).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"2-digit" }) : "—"}
                    </td>
                    <td className="px-3 py-2.5 truncate text-[#122027]" title={j.client || undefined}>{j.client || "—"}</td>
                    <td className="px-3 py-2.5 text-[#768994]">{j.office || "—"}</td>
                    <td className="px-3 py-2.5">
                      {j.print_digital
                        ? <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${PD_BADGE[j.print_digital] || "bg-slate-100 text-slate-500"}`}>{j.print_digital}</span>
                        : <span className="text-[#768994]">—</span>}
                    </td>
                    <td className="px-3 py-2.5 truncate font-bold text-[#122027]" title={j.film_title || undefined}>{j.film_title || "—"}</td>
                    <td className="px-3 py-2.5 truncate text-[#33454f]" title={j.project_description || undefined}>{j.project_description || "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-[#122027] tabular-nums">
                      {costs.length === 0 ? <span className="text-[#768994]">—</span> : costs.map(([field, kind]) => (
                        <div key={field}><span className="font-bold">{gbp(j[field])}</span> <span className="text-[10px] text-[#768994]">{kind}</span></div>
                      ))}
                    </td>
                    <td className="px-3 py-2.5 truncate text-[#768994]" title={j.ordered_by || undefined}>{j.ordered_by || "—"}</td>
                    <td className="px-3 py-2.5 truncate text-[#768994]" title={j.billed_to || undefined}>{j.billed_to || "—"}</td>
                    <td className="px-3 py-2.5">
                      <MenuSelect value={status} options={STATUS_OPTIONS} label={`Status of ${j._code || j.job_number}`}
                        onChange={(s) => patchJob(j, { status: s }, "the status")}
                        className={`text-[10px] font-black pl-2.5 pr-1.5 py-1 rounded-full ${STATUS_BADGE[status]}`} />
                    </td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => patchJob(j, { job_done: !j.job_done }, "the done tick")}
                        title={j.job_done ? "Mark as not done" : "Mark as done"} aria-pressed={!!j.job_done} className="press p-1 -m-1">
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${j.job_done ? "bg-[#1cc1a5] border-[#1cc1a5]" : "border-[#dce4ec] hover:border-[#1cc1a5]"}`}>
                          {j.job_done && <Check className="settle-in w-2.5 h-2.5 text-white" />}
                        </div>
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setEditJob(j); setShowModal(true); }} title="Edit job" aria-label={`Edit ${j._code || j.job_number}`}
                          className="press p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-[#122027]">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteJob(j)} title="Delete job" aria-label={`Delete ${j._code || j.job_number}`}
                          className="press p-1.5 hover:bg-rose-100 rounded-lg text-slate-400 hover:text-rose-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-end mt-3">
          <Pager page={safePage} totalPages={totalPages} setPage={setPage} />
        </div>
      )}

      {showModal && (
        <JobModal
          job={editJob}
          clients={clients} films={films} workCategories={workCategories} descs={descs}
          onSave={handleSave} onClose={() => { setShowModal(false); setEditJob(null); }}
          saving={saving}
        />
      )}
    </div>
  );
}
