import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Briefcase, Film, Users, Tag, AlignLeft, Building2,
  Plus, Pencil, Trash2, X, Check, Search,
  RefreshCw, Shield, AlertTriangle, ChevronLeft, ChevronRight,
  ArrowUpAZ, ArrowDownAZ, LayoutDashboard, TrendingUp, CheckCircle2, UserCog, Activity,
  FolderPlus, Folder, FolderOpen, Sparkles, Loader2,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { SEED_CLIENTS, SEED_PROJECT_DESCRIPTIONS } from "../data/seedData";
import { DEFAULT_JOBS, CATEGORIES } from "../constants";

// Film titles extracted from DEFAULT_JOBS (everything before " : XY")
const SEED_FILMS = [...new Set(
  DEFAULT_JOBS.map(j => j.split(" : ")[0]?.trim()).filter(f => f && !f.startsWith("XYi "))
)].sort();

// ── Access control ────────────────────────────────────────────────────────────
// Add Wrike user IDs of management users here.
// Your Wrike ID is shown on the Profile Hub page (under your name, first 8 chars).
// Ask Claude to help you find the full ID if needed.
export const MANAGEMENT_IDS = [
  "KUAWDLVN", "KUAQT4JC"
];

const OFFICES = ["LDN", "LA"];
const PRINT_DIGITAL = ["Digital", "Print", "Both"];

const TABS = [
  { id: "overview",  label: "Overview",            icon: LayoutDashboard },
  { id: "jobsSetup", label: "Jobs Setup",          icon: FolderPlus },
  { id: "jobs",      label: "Job Book",            icon: Briefcase },
  { id: "feed",      label: "Jobs Feed",           icon: Activity  },
  { id: "people",    label: "People",              icon: Users     },
  { id: "positions", label: "Positions",           icon: UserCog   },
  { id: "films",     label: "Films",               icon: Film      },
  { id: "clients",   label: "Clients",             icon: Building2 },
  { id: "categories",label: "Item Categories",     icon: Tag       },
  { id: "descs",     label: "Project Descriptions",icon: AlignLeft },
];

const TAB_GROUPS = [
  { ids: ["overview"] },
  { ids: ["jobsSetup", "jobs", "feed"],      label: "Jobs"      },
  { ids: ["people", "positions"], label: "Team"    },
  { ids: ["films", "clients", "categories", "descs"], label: "Reference" },
];

// ── Project Description quick-filter chips ────────────────────────────────────
// keyword uses "<CODE> " (with trailing space) so "UK Something" matches but
// hypothetical "BULK" wouldn't. Gradients mirror DESCRIPTION_GROUPS.
const DESC_QUICK_FILTERS = [
  { label: "AUS", keyword: "AUS ", gradient: "from-green-500 to-emerald-600"   },
  { label: "UK",  keyword: "UK ",  gradient: "from-blue-500 to-blue-700"       },
  { label: "DOM", keyword: "DOM ", gradient: "from-amber-400 to-orange-500"    },
  { label: "INT", keyword: "INT ", gradient: "from-violet-500 to-violet-700"   },
  { label: "IRE", keyword: "IRE ", gradient: "from-emerald-400 to-teal-600"    },
  { label: "XYi", keyword: "XYi ", gradient: "from-[#12a0e1] to-[#0872a0]"   },
];

// ── Department groups (for People tab) ────────────────────────────────────────
const DEPARTMENTS = ["PM", "Motion", "Digital", "AM", "Operations", "Print"];
const DEPT_GROUPS = [
  { label: "PM",         color: "bg-blue-50 text-blue-700 border-blue-200",           gradient: "from-blue-500 to-blue-700"         },
  { label: "Motion",     color: "bg-violet-50 text-violet-700 border-violet-200",     gradient: "from-violet-500 to-violet-700"     },
  { label: "Digital",    color: "bg-cyan-50 text-cyan-700 border-cyan-200",           gradient: "from-cyan-500 to-sky-600"          },
  { label: "AM",         color: "bg-amber-50 text-amber-700 border-amber-200",        gradient: "from-amber-400 to-orange-500"      },
  { label: "Operations", color: "bg-emerald-50 text-emerald-700 border-emerald-200",  gradient: "from-emerald-500 to-teal-600"      },
  { label: "Print",      color: "bg-orange-50 text-orange-700 border-orange-200",     gradient: "from-orange-400 to-orange-600"     },
  { label: "—",          color: "bg-slate-50 text-slate-500 border-slate-200",        gradient: "from-slate-400 to-slate-600"       },
];

// ── Studio quick-filter groups (for Clients tab) ──────────────────────────────
const STUDIO_GROUPS = [
  { label: "Universal", keyword: "Universal", gradient: "from-blue-500 to-indigo-700"   },
  { label: "Paramount", keyword: "Paramount", gradient: "from-sky-400 to-blue-700"      },
  { label: "Sony",      keyword: "Sony",      gradient: "from-slate-600 to-slate-900"   },
  { label: "Disney",    keyword: "Disney",    gradient: "from-blue-400 to-violet-700"   },
  { label: "Warner",    keyword: "Warner",    gradient: "from-cyan-500 to-blue-700"     },
  { label: "Netflix",   keyword: "Netflix",   gradient: "from-red-500 to-red-800"       },
  { label: "Apple",     keyword: "Apple",     gradient: "from-slate-400 to-slate-700"   },
  { label: "Amazon",    keyword: "Amazon",    gradient: "from-amber-400 to-orange-600"  },
  { label: "XYi",      keyword: "XYi",       gradient: "from-[#12a0e1] to-[#0872a0]"  },
];

// ── Category groups ────────────────────────────────────────────────────────────
// Prefix match is first-wins — Misc catches only what Digital/Print/XYi don't.
const CATEGORY_GROUPS = [
  {
    label: "Digital",
    color: "bg-cyan-50 text-cyan-700 border-cyan-200",
    gradient: "from-cyan-500 to-sky-600",
    match: s => s.startsWith("Digital"),
    stripPrefix: "Digital - ",
  },
  {
    label: "Print",
    color: "bg-orange-50 text-orange-700 border-orange-200",
    gradient: "from-orange-400 to-orange-600",
    match: s => s.startsWith("Print"),
    stripPrefix: "Print - ",
  },
  {
    label: "XYi",
    color: "bg-violet-50 text-violet-700 border-violet-200",
    gradient: "from-violet-500 to-violet-700",
    match: s => s.startsWith("XYi"),
    stripPrefix: "XYi - ",
  },
  {
    label: "Misc",
    color: "bg-slate-50 text-slate-600 border-slate-200",
    gradient: "from-slate-500 to-slate-700",
    match: () => true,
    stripPrefix: "",
  },
];

// ── Project Description groups (territory prefix) ─────────────────────────────
const DESCRIPTION_GROUPS = [
  { label: "AUS", color: "bg-green-50 text-green-700 border-green-200",       gradient: "from-green-500 to-emerald-600",  match: s => /^AUS[\s\-]/i.test(s),  stripPrefix: "" },
  { label: "UK",  color: "bg-blue-50 text-blue-700 border-blue-200",          gradient: "from-blue-500 to-blue-700",       match: s => /^UK[\s\-]/i.test(s),   stripPrefix: "" },
  { label: "DOM", color: "bg-amber-50 text-amber-700 border-amber-200",       gradient: "from-amber-400 to-orange-500",    match: s => /^DOM[\s\-]/i.test(s),  stripPrefix: "" },
  { label: "INT", color: "bg-violet-50 text-violet-700 border-violet-200",    gradient: "from-violet-500 to-violet-700",   match: s => /^INT[\s\-]/i.test(s),  stripPrefix: "" },
  { label: "IRE", color: "bg-emerald-50 text-emerald-700 border-emerald-200", gradient: "from-emerald-400 to-teal-600",    match: s => /^IRE[\s\-]/i.test(s),  stripPrefix: "" },
  { label: "XYi", color: "bg-cyan-50 text-cyan-700 border-cyan-200",         gradient: "from-[#12a0e1] to-[#0872a0]",    match: s => /^XYi[\s\-]/i.test(s),  stripPrefix: "" },
  { label: "Other", color: "bg-slate-50 text-slate-600 border-slate-200",    gradient: "from-slate-500 to-slate-700",     match: () => true,                   stripPrefix: "" },
];

// ── Letter avatar colour palette ──────────────────────────────────────────────
const LETTER_PALETTES = [
  ["bg-blue-100 text-blue-700",    "border-blue-200"   ],
  ["bg-violet-100 text-violet-700","border-violet-200" ],
  ["bg-emerald-100 text-emerald-700","border-emerald-200"],
  ["bg-amber-100 text-amber-700",  "border-amber-200"  ],
  ["bg-rose-100 text-rose-700",    "border-rose-200"   ],
  ["bg-cyan-100 text-cyan-700",    "border-cyan-200"   ],
  ["bg-indigo-100 text-indigo-700","border-indigo-200" ],
  ["bg-orange-100 text-orange-700","border-orange-200" ],
  ["bg-teal-100 text-teal-700",    "border-teal-200"   ],
  ["bg-pink-100 text-pink-700",    "border-pink-200"   ],
];
const letterPalette = (l) => {
  const code = (l || "A").toUpperCase().charCodeAt(0);
  return LETTER_PALETTES[Math.abs(code) % LETTER_PALETTES.length];
};

// ── Generic reference-list section ───────────────────────────────────────────
function SimpleListSection({ table, labelField = "name", label, placeholder, isLong = false, quickFilters = [], quickFilterLabel = "Quick filters", groups = [] }) {
  const [items, setItems]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [sort, setSort]                 = useState("asc");
  const [activeLetter, setLetter]       = useState(null);
  const [activeQuickFilter, setQFilter] = useState(null);
  const [adding, setAdding]             = useState(false);
  const [newVal, setNewVal]             = useState("");
  const [editId, setEditId]             = useState(null);
  const [editVal, setEditVal]           = useState("");
  const [saving, setSaving]             = useState(false);
  const [page, setPage]                 = useState(0);
  const PER_PAGE = isLong ? 60 : 300;

  // Editable group labels (persisted per-table in localStorage)
  const [groupLabels, setGroupLabels] = useState(() => {
    try {
      const saved = localStorage.getItem(`mgmt_grp_labels_${table}`);
      const base  = Object.fromEntries(groups.map(g => [g.label, g.label]));
      return saved ? { ...base, ...JSON.parse(saved) } : base;
    } catch { return Object.fromEntries(groups.map(g => [g.label, g.label])); }
  });
  const [editingGrp, setEditingGrp]       = useState(null);
  const [editingGrpVal, setEditingGrpVal] = useState("");
  const saveGroupLabel = (original) => {
    const trimmed = editingGrpVal.trim();
    if (!trimmed) { setEditingGrp(null); return; }
    const next = { ...groupLabels, [original]: trimmed };
    setGroupLabels(next);
    try { localStorage.setItem(`mgmt_grp_labels_${table}`, JSON.stringify(next)); } catch {}
    setEditingGrp(null);
  };

  // Collapsible group sections + per-group "show more" paging (keeps huge lists like
  // Project Descriptions from rendering as one giant scroll)
  const GROUP_PAGE_SIZE = 40;
  const [expandedGroups, setExpandedGroups] = useState({});
  const [groupShowCount, setGroupShowCount] = useState({});
  const toggleGroup = (label) => setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }));

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from(table).select("*").order(labelField);
    setItems(data || []);
    setLoading(false);
  }, [table, labelField]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [search, activeLetter, sort, activeQuickFilter]);

  const add = async () => {
    if (!newVal.trim()) return;
    setSaving(true);
    await supabase.from(table).insert({ [labelField]: newVal.trim() });
    setNewVal(""); setAdding(false);
    await load();
    setSaving(false);
  };

  const saveEdit = async (id) => {
    if (!editVal.trim()) return;
    setSaving(true);
    await supabase.from(table).update({ [labelField]: editVal.trim() }).eq("id", id);
    setEditId(null);
    await load();
    setSaving(false);
  };

  const remove = async (id) => {
    if (!confirm("Delete this item?")) return;
    await supabase.from(table).delete().eq("id", id);
    await load();
  };

  const seedData = async (seedArr) => {
    if (!confirm(`This will insert ${seedArr.length} items. Continue?`)) return;
    setSaving(true);
    const chunks = [];
    for (let i = 0; i < seedArr.length; i += 100) chunks.push(seedArr.slice(i, i + 100));
    for (const chunk of chunks)
      await supabase.from(table).upsert(chunk.map(v => ({ [labelField]: v })), { onConflict: labelField, ignoreDuplicates: true });
    await load();
    setSaving(false);
  };

  // job_categories uses the same CATEGORIES list used across Tracker / Legacy dropdowns
  const seedMap = { films: SEED_FILMS, clients: SEED_CLIENTS, job_categories: CATEGORIES, project_descriptions: SEED_PROJECT_DESCRIPTIONS };
  const seedArr = seedMap[table];

  // sorted list
  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      const av = (a[labelField] || "").toLowerCase();
      const bv = (b[labelField] || "").toLowerCase();
      return sort === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return arr;
  }, [items, sort, labelField]);

  // available letters from full sorted list
  const availableLetters = useMemo(() => {
    const s = new Set();
    sorted.forEach(it => {
      const c = (it[labelField] || "").charAt(0).toUpperCase();
      if (/[A-Z0-9]/.test(c)) s.add(c);
    });
    return [...s].sort();
  }, [sorted, labelField]);

  // filtered: quick-filter → search → letter
  const filtered = useMemo(() => {
    let arr = sorted;
    if (activeQuickFilter) arr = arr.filter(it => (it[labelField] || "").toLowerCase().includes(activeQuickFilter.toLowerCase()));
    if (search) arr = arr.filter(it => (it[labelField] || "").toLowerCase().includes(search.toLowerCase()));
    if (activeLetter) arr = arr.filter(it => (it[labelField] || "").charAt(0).toUpperCase() === activeLetter);
    return arr;
  }, [sorted, search, activeLetter, activeQuickFilter, labelField]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated  = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const inputCls = "flex-1 text-sm border border-[#dce4ec] rounded-lg px-3 py-1.5 outline-none focus:border-[#12a0e1] focus:ring-2 focus:ring-[#12a0e1]/20";

  return (
    <div>
      {/* ── Top controls ── */}
      <div className="flex items-center gap-2.5 mb-4 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#768994]" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setLetter(null); }}
            placeholder={`Search ${label.toLowerCase()}…`}
            className="w-full pl-9 pr-8 py-2 text-sm border border-[#dce4ec] rounded-xl outline-none focus:border-[#12a0e1] focus:ring-2 focus:ring-[#12a0e1]/20 bg-white"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Sort toggle */}
        <button
          onClick={() => setSort(s => s === "asc" ? "desc" : "asc")}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#768994] bg-white border border-[#dce4ec] rounded-xl hover:border-slate-300 hover:text-[#122027] transition-all shrink-0"
          title={sort === "asc" ? "Sorted A → Z" : "Sorted Z → A"}
        >
          {sort === "asc"
            ? <ArrowUpAZ className="w-3.5 h-3.5 text-[#12a0e1]" />
            : <ArrowDownAZ className="w-3.5 h-3.5 text-[#12a0e1]" />}
          {sort === "asc" ? "A → Z" : "Z → A"}
        </button>

        {/* Seed button (only when table is empty) */}
        {seedArr && items.length === 0 && !loading && (
          <button onClick={() => seedData(seedArr)} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-all shrink-0 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${saving ? "animate-spin" : ""}`} />
            Seed ({seedArr.length})
          </button>
        )}

        {/* Add */}
        <button onClick={() => setAdding(a => !a)}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${
            adding ? "bg-slate-100 text-[#768994] border border-[#dce4ec]" : "bg-[#12a0e1] hover:bg-[#0d8bc4] text-white"
          }`}>
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {/* ── Add form ── */}
      {adding && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-[#12a0e1]/5 border border-[#12a0e1]/20 rounded-2xl">
          <input autoFocus value={newVal} onChange={e => setNewVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") add(); if (e.key === "Escape") { setAdding(false); setNewVal(""); } }}
            placeholder={placeholder || `New ${label.toLowerCase()}…`}
            className={inputCls}
          />
          <button onClick={add} disabled={saving || !newVal.trim()}
            className="px-3 py-1.5 bg-[#12a0e1] text-white text-xs font-bold rounded-lg disabled:opacity-40 flex items-center gap-1">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" /> Save</>}
          </button>
          <button onClick={() => { setAdding(false); setNewVal(""); }} className="p-1.5 text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Quick-filter studio cards ── */}
      {quickFilters.length > 0 && (
        <div className="mb-5 pb-5 border-b border-[#dce4ec]">
          <p className="text-[9px] font-black uppercase tracking-widest text-[#768994] mb-2.5">{quickFilterLabel}</p>
          <div className="flex flex-wrap gap-2">
            {quickFilters.map(qf => {
              const isActive = activeQuickFilter === qf.keyword;
              const count = sorted.filter(it => (it[labelField] || "").toLowerCase().includes(qf.keyword.toLowerCase())).length;
              if (count === 0) return null;
              return (
                <button key={qf.label}
                  onClick={() => { setQFilter(isActive ? null : qf.keyword); setSearch(""); setLetter(null); }}
                  className={`group/chip relative flex flex-col items-start gap-0.5 px-4 py-3 min-w-[72px] rounded-2xl overflow-hidden border transition-all duration-200 ${
                    isActive ? "border-transparent shadow-md text-white" : "border-[#dce4ec] text-[#122027] hover:border-transparent hover:text-white hover:shadow-sm"
                  }`}>
                  {/* gradient fill — faint by default, full on hover/active */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${qf.gradient ?? "from-slate-600 to-slate-800"} transition-opacity duration-200 ${
                    isActive ? "opacity-100" : "opacity-15 group-hover/chip:opacity-100"
                  }`} />
                  <span className="relative z-10 text-[11px] font-black leading-tight whitespace-nowrap">{qf.label}</span>
                  <span className={`relative z-10 text-[9px] font-bold px-1.5 py-0.5 rounded-full transition-colors duration-200 ${
                    isActive ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500 group-hover/chip:bg-white/25 group-hover/chip:text-white"
                  }`}>{count}</span>
                </button>
              );
            })}
            {activeQuickFilter && (
              <button onClick={() => setQFilter(null)}
                className="flex items-center gap-1 self-center px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-rose-500 transition-colors">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Alphabet bar (hidden when grouped mode is active) ── */}
      {!search && !activeQuickFilter && !groups.length && availableLetters.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4 pb-4 border-b border-[#dce4ec]">
          <button onClick={() => setLetter(null)}
            className={`px-2.5 py-1 text-[11px] font-black rounded-lg transition-all ${
              !activeLetter ? "bg-[#122027] text-white shadow-sm" : "bg-slate-100 text-[#768994] hover:bg-slate-200 hover:text-[#122027]"
            }`}>All</button>
          {availableLetters.map(l => {
            const [bg] = letterPalette(l);
            const isActive = activeLetter === l;
            return (
              <button key={l} onClick={() => setLetter(isActive ? null : l)}
                className={`px-2.5 py-1 text-[11px] font-black rounded-lg transition-all ${
                  isActive ? `${bg} shadow-sm ring-1 ring-current/30` : "bg-slate-100 text-[#768994] hover:bg-slate-200 hover:text-[#122027]"
                }`}>{l}</button>
            );
          })}
        </div>
      )}

      {/* ── Stats ── */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-black text-[#768994] uppercase tracking-widest">
          {filtered.length} {filtered.length !== items.length ? `of ${items.length} ` : ""}{label.toLowerCase()}
          {activeQuickFilter && <span className="ml-1.5 text-[#12a0e1]">· {quickFilters.find(q => q.keyword === activeQuickFilter)?.label ?? activeQuickFilter}</span>}
          {activeLetter && <span className="ml-1.5 text-[#12a0e1]">· "{activeLetter}"</span>}
        </p>
        {totalPages > 1 && !groups.length && (
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="p-1 disabled:opacity-30 hover:bg-slate-100 rounded-lg text-[#768994]">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-bold text-[#768994]">{page + 1} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
              className="p-1 disabled:opacity-30 hover:bg-slate-100 rounded-lg text-[#768994]">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {groups.length > 0 && !search && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpandedGroups(Object.fromEntries(groups.map(g => [g.label, true])))}
              className="text-[10px] font-bold text-[#768994] hover:text-[#12a0e1] px-1.5 py-0.5 rounded transition-colors">
              Expand all
            </button>
            <span className="text-[10px] text-slate-300">·</span>
            <button
              onClick={() => setExpandedGroups({})}
              className="text-[10px] font-bold text-[#768994] hover:text-[#12a0e1] px-1.5 py-0.5 rounded transition-colors">
              Collapse all
            </button>
          </div>
        )}
      </div>

      {/* ── Item rendering ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-[#768994]">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-[#768994]">
          <Search className="w-8 h-8 opacity-20" />
          <p className="text-sm font-medium">No {label.toLowerCase()} found</p>
        </div>
      ) : groups.length > 0 ? (
        /* ── Grouped mode (first-match-wins) ── */
        (() => {
          // Assign each item to its first matching group only
          const buckets = Object.fromEntries(groups.map(g => [g.label, []]));
          for (const item of filtered) {
            const text  = item[labelField] || "";
            const group = groups.find(g => g.match(text));
            if (group) buckets[group.label].push(item);
          }
          return (
            <div className="space-y-6">
              {groups.map(group => {
                const groupItems  = buckets[group.label] || [];
                if (groupItems.length === 0) return null;
                const displayLabel = groupLabels[group.label] ?? group.label;
                const isOpen      = search ? true : !!expandedGroups[group.label];
                const showCount   = groupShowCount[group.label] || GROUP_PAGE_SIZE;
                const visibleItems = groupItems.slice(0, showCount);
                const remaining    = groupItems.length - visibleItems.length;
                return (
                  <div key={group.label}>
                    {/* Editable, collapsible group header */}
                    <div role="button" tabIndex={0} onClick={() => toggleGroup(group.label)}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") toggleGroup(group.label); }}
                      className={`flex items-center gap-2.5 mb-3 px-3 py-2 rounded-xl border cursor-pointer select-none ${group.color}`}>
                      {editingGrp === group.label ? (
                        <>
                          <input autoFocus value={editingGrpVal} onClick={e => e.stopPropagation()}
                            onChange={e => setEditingGrpVal(e.target.value)}
                            onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") saveGroupLabel(group.label); if (e.key === "Escape") setEditingGrp(null); }}
                            className="text-[11px] font-black uppercase tracking-widest bg-transparent border-b border-current/50 outline-none w-28" />
                          <button onClick={e => { e.stopPropagation(); saveGroupLabel(group.label); }} className="p-0.5 hover:opacity-70">
                            <Check className="w-3 h-3" />
                          </button>
                          <button onClick={e => { e.stopPropagation(); setEditingGrp(null); }} className="p-0.5 hover:opacity-70">
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <>
                          <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                          <span className="text-[11px] font-black uppercase tracking-widest">{displayLabel}</span>
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-black/10">{groupItems.length}</span>
                          <button onClick={e => { e.stopPropagation(); setEditingGrp(group.label); setEditingGrpVal(displayLabel); }}
                            className="ml-auto p-1 rounded hover:bg-black/10 opacity-40 hover:opacity-100 transition-opacity">
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                        </>
                      )}
                    </div>
                    {!isOpen ? null : (<>
                    <div className={isLong ? "space-y-1.5" : "grid grid-cols-2 xl:grid-cols-3 gap-2"}>
                      {visibleItems.map(item => {
                        const text        = item[labelField] || "";
                        const displayText = group.stripPrefix ? text.replace(group.stripPrefix, "") : text;
                        const isEditing   = editId === item.id;
                        return (
                          <div key={item.id}
                            className={`group/item flex items-center gap-2.5 px-3 py-2.5 bg-white border rounded-xl hover:shadow-sm transition-all ${
                              isEditing ? "border-[#12a0e1] ring-2 ring-[#12a0e1]/15" : "border-[#dce4ec] hover:border-slate-300"
                            }`}>
                            {isEditing ? (
                              <>
                                <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") saveEdit(item.id); if (e.key === "Escape") setEditId(null); }}
                                  className={`${inputCls} text-xs`} />
                                <button onClick={() => saveEdit(item.id)} disabled={saving}
                                  className="shrink-0 p-1.5 bg-[#12a0e1] text-white rounded-lg hover:bg-[#0d8bc4] disabled:opacity-40">
                                  <Check className="w-3 h-3" />
                                </button>
                                <button onClick={() => setEditId(null)}
                                  className="shrink-0 p-1 text-slate-400 hover:text-slate-600">
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <>
                                <span className={`flex-1 min-w-0 text-xs font-medium text-[#122027] ${isLong ? "leading-snug" : "truncate"}`}>{displayText}</span>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0">
                                  <button onClick={() => { setEditId(item.id); setEditVal(text); }}
                                    className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-[#122027]">
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button onClick={() => remove(item.id)}
                                    className="p-1 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-500">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {remaining > 0 && (
                      <button onClick={() => setGroupShowCount(prev => ({ ...prev, [group.label]: showCount + GROUP_PAGE_SIZE }))}
                        className="mt-2 w-full text-center text-[11px] font-bold text-[#12a0e1] hover:text-[#0d8bc4] py-2 rounded-lg hover:bg-[#12a0e1]/5 transition-colors">
                        Show {Math.min(GROUP_PAGE_SIZE, remaining)} more · {remaining} left
                      </button>
                    )}
                    </>)}
                  </div>
                );
              })}
            </div>
          );
        })()
      ) : (
        /* ── Flat mode ── */
        <div className={isLong ? "space-y-1.5" : "grid grid-cols-2 xl:grid-cols-3 gap-2"}>
          {paginated.map(item => {
            const text   = item[labelField] || "";
            const first  = text.charAt(0).toUpperCase() || "?";
            const [avatarCls, borderCls] = letterPalette(first);
            const isEditing = editId === item.id;
            return (
              <div key={item.id}
                className={`group flex items-center gap-3 p-3 bg-white border rounded-2xl hover:shadow-sm transition-all ${
                  isEditing ? "border-[#12a0e1] ring-2 ring-[#12a0e1]/15" : "border-[#dce4ec] hover:border-slate-300"
                }`}>
                {!isEditing && (
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-[11px] font-black border ${avatarCls} ${borderCls}`}>
                    {first}
                  </div>
                )}
                {isEditing ? (
                  <>
                    <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveEdit(item.id); if (e.key === "Escape") setEditId(null); }}
                      className={`${inputCls} text-xs`} />
                    <button onClick={() => saveEdit(item.id)} disabled={saving}
                      className="shrink-0 p-1.5 bg-[#12a0e1] text-white rounded-lg hover:bg-[#0d8bc4] disabled:opacity-40">
                      <Check className="w-3 h-3" />
                    </button>
                    <button onClick={() => setEditId(null)}
                      className="shrink-0 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className={`flex-1 min-w-0 text-sm font-medium text-[#122027] ${isLong ? "leading-snug" : "truncate"}`}>
                      {text}
                    </span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => { setEditId(item.id); setEditVal(text); }}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-[#122027]">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => remove(item.id)}
                        className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-500">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Modal field sub-components — defined at module level so React never
//    remounts them mid-keystroke (defining inside a component = new type each render).
const MODAL_INPUT = "w-full border border-[#dce4ec] rounded-2xl px-4 py-2.5 text-sm text-[#122027] outline-none focus:border-[#12a0e1] focus:ring-2 focus:ring-[#12a0e1]/15 bg-white placeholder-[#b0bec5] transition-all";

function FieldLabel({ text, required }) {
  return (
    <p className="text-[10px] font-black uppercase tracking-widest text-[#768994] mb-1.5">
      {text}{required && <span className="text-rose-400 ml-0.5">*</span>}
    </p>
  );
}

// Searchable combobox with optional gradient filter chips.
// onBlur closes immediately (no setTimeout) because item selection uses onMouseDown,
// which fires before blur — so the selection is already committed when blur runs.
function ComboField({ label, value, onChange, options, placeholder, required, filters = [] }) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState(null);

  // Sync display value when parent sets it externally (e.g. opening edit modal)
  useEffect(() => { setQ(value ?? ""); }, [value]);

  const hits = useMemo(() => {
    let list = activeFilter ? options.filter(o => activeFilter.match(o)) : options;
    if (q) list = list.filter(o => o.toLowerCase().includes(q.toLowerCase()));
    return list.slice(0, 60);
  }, [options, q, activeFilter]);

  return (
    <div>
      <FieldLabel text={label} required={required} />
      {filters.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {filters.map(f => {
            const count = options.filter(o => f.match(o)).length;
            if (count === 0) return null;
            const isActive = activeFilter?.label === f.label;
            return (
              <button key={f.label} type="button"
                onMouseDown={e => { e.preventDefault(); setActiveFilter(isActive ? null : f); setOpen(true); }}
                className={`group/fc relative px-3 py-1 rounded-xl text-[11px] font-bold border overflow-hidden transition-all ${
                  isActive ? "border-transparent text-white shadow-sm" : "border-[#dce4ec] text-[#768994] hover:border-transparent hover:text-white"
                }`}>
                <div className={`absolute inset-0 bg-gradient-to-br ${f.gradient} transition-opacity duration-200 ${
                  isActive ? "opacity-100" : "opacity-20 group-hover/fc:opacity-100"
                }`} />
                <span className="relative z-10">{f.label}</span>
              </button>
            );
          })}
          {activeFilter && (
            <button type="button" onMouseDown={e => { e.preventDefault(); setActiveFilter(null); }}
              className="flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-bold text-slate-400 hover:text-rose-500 transition-colors">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      )}
      <div className="relative">
        <input value={q}
          onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder={placeholder || "Search or type…"}
          className={MODAL_INPUT} />
        {open && hits.length > 0 && (
          <div className="absolute z-[100] left-0 right-0 mt-1.5 bg-white border border-[#dce4ec] rounded-2xl shadow-2xl max-h-52 overflow-y-auto">
            {hits.map(o => (
              <button key={o} type="button"
                onMouseDown={e => { e.preventDefault(); onChange(o); setQ(o); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-sm border-b border-[#dce4ec]/60 last:border-0 transition-colors ${
                  o === value ? "bg-[#12a0e1]/10 text-[#12a0e1] font-bold" : "text-[#122027] hover:bg-slate-50"
                }`}>
                {o}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Searchable, selection-only dropdown — same visual language as ComboField's
// popup, but you can't commit free text, only pick an existing option. Use
// for pickers whose values must reference an existing row (e.g. Film Setup's
// film picker), as opposed to ComboField which lets you introduce new values.
function StrictSelect({ value, onChange, options, placeholder, loading, className = "" }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const hits = useMemo(() => {
    if (!q) return options.slice(0, 60);
    return options.filter(o => o.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  }, [options, q]);

  return (
    <div className={`relative ${className}`}>
      <button type="button" disabled={loading}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 border border-[#dce4ec] rounded-xl px-3 py-2.5 text-sm font-bold text-[#122027] outline-none focus:border-[#12a0e1] bg-white disabled:opacity-50 transition-colors hover:border-[#12a0e1]">
        <span className={value ? "" : "text-[#b0bec5] font-medium"}>
          {loading ? "Loading…" : (value || placeholder || "Select…")}
        </span>
        <ChevronRight className={`w-3.5 h-3.5 text-[#768994] shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[99]" onClick={() => setOpen(false)} />
          <div className="absolute z-[100] left-0 right-0 mt-1.5 bg-white border border-[#dce4ec] rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-2 border-b border-[#dce4ec]/60">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#b0bec5]" />
                <input autoFocus value={q} onChange={e => setQ(e.target.value)}
                  placeholder="Search…"
                  className="w-full pl-8 pr-2 py-1.5 text-sm text-[#122027] outline-none bg-slate-50 rounded-xl" />
              </div>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {hits.length === 0 && <p className="px-4 py-3 text-sm text-[#b0bec5]">No matches</p>}
              {hits.map(o => (
                <button key={o} type="button"
                  onClick={() => { onChange(o); setQ(""); setOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm border-b border-[#dce4ec]/60 last:border-0 transition-colors ${
                    o === value ? "bg-[#12a0e1]/10 text-[#12a0e1] font-bold" : "text-[#122027] hover:bg-slate-50"
                  }`}>
                  {o}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PillField({ label, value, onChange, options, colorMap }) {
  return (
    <div>
      <FieldLabel text={label} />
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const active = value === o;
          const activeColor = colorMap?.[o] || "bg-[#122027] border-[#122027]";
          return (
            <button key={o} type="button" onClick={() => onChange(o)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                active
                  ? `${activeColor} text-white shadow-sm`
                  : "bg-white text-[#768994] border-[#dce4ec] hover:border-slate-300 hover:text-[#122027]"
              }`}>
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Filter chip configs (module-level — stable references) ───────────────────
const CLIENT_FILTERS = [
  { label: "Universal", gradient: "from-blue-500 to-indigo-700", match: s => s.toLowerCase().includes("universal") },
  { label: "Paramount", gradient: "from-sky-400 to-blue-700",    match: s => s.toLowerCase().includes("paramount") },
  { label: "Netflix",   gradient: "from-red-500 to-red-800",     match: s => s.toLowerCase().includes("netflix")   },
  { label: "Apple",     gradient: "from-slate-400 to-slate-700", match: s => s.toLowerCase().includes("apple")     },
  { label: "Amazon",    gradient: "from-amber-400 to-orange-600",match: s => s.toLowerCase().includes("amazon")    },
];
const DESC_FILTERS = [
  { label: "AUS", gradient: "from-green-500 to-emerald-600",  match: s => /^AUS[\s\-]/i.test(s) },
  { label: "UK",  gradient: "from-blue-500 to-blue-700",      match: s => /^UK[\s\-]/i.test(s)  },
  { label: "DOM", gradient: "from-amber-400 to-orange-500",   match: s => /^DOM[\s\-]/i.test(s) },
  { label: "INT", gradient: "from-violet-500 to-violet-700",  match: s => /^INT[\s\-]/i.test(s) },
  { label: "IRE", gradient: "from-emerald-400 to-teal-600",   match: s => /^IRE[\s\-]/i.test(s) },
  { label: "XYi", gradient: "from-[#12a0e1] to-[#0872a0]",   match: s => /^XYi[\s\-]/i.test(s) },
];
const CAT_FILTERS = [
  { label: "Digital", gradient: "from-cyan-500 to-sky-600",      match: s => s.startsWith("Digital") },
  { label: "Print",   gradient: "from-orange-400 to-orange-600", match: s => s.startsWith("Print")   },
  { label: "XYi",    gradient: "from-violet-500 to-violet-700",  match: s => s.startsWith("XYi")    },
];
const PD_COLOR_MAP = { Digital: "bg-cyan-600 border-cyan-600", Print: "bg-orange-500 border-orange-500", Both: "bg-violet-600 border-violet-600" };
const JOB_STATUSES = ["Inactive", "Active", "Closed"];
const STATUS_COLOR_MAP = { Inactive: "bg-slate-400 border-slate-400", Active: "bg-[#12a0e1] border-[#12a0e1]", Closed: "bg-[#1cc1a5] border-[#1cc1a5]" };
const STATUS_BADGE = { Inactive: "bg-slate-100 text-slate-500", Active: "bg-[#12a0e1]/10 text-[#12a0e1]", Closed: "bg-[#1cc1a5]/10 text-[#1cc1a5]" };

// ── Job Form ───────────────────────────────────────────────────────────────────
// Fields + footer for creating/editing a Job Book row. Shared by JobModal (edit,
// from Job Book) and the Custom Job tab in Jobs Setup (create) — same form,
// different chrome around it (layout="modal" adds the fixed-footer/scroll
// behaviour a popup needs; layout="inline" just flows in the page).
function JobForm({ job, clients, films, categories, descs, onSave, onCancel, saving, submitLabel, layout = "modal" }) {
  const isEdit = !!job?.id;
  const [orderedByOpts, setOrderedByOpts] = useState([]);
  const [billedToOpts, setBilledToOpts]   = useState([]);
  const [nextCode, setNextCode] = useState(null); // e.g. "XY025999" — allocated once when creating a new job

  useEffect(() => {
    supabase.from("jobs")
      .select("ordered_by, billed_to")
      .not("ordered_by", "is", null)
      .neq("ordered_by", "")
      .then(({ data }) => {
        if (!data) return;
        setOrderedByOpts([...new Set(data.map(r => r.ordered_by).filter(Boolean))].sort());
        setBilledToOpts([...new Set(data.map(r => r.billed_to).filter(Boolean))].sort());
      });
  }, []);

  // New jobs get the next sequential XY code auto-allocated, same source of truth
  // (max across jobs + tasks) as the Bulk Campaign flow — never manually typed.
  useEffect(() => {
    if (isEdit) return;
    Promise.all([
      supabase.from("jobs").select("job_number"),
      supabase.from("tasks").select("job_number"),
    ]).then(([{ data: jobRows }, { data: taskRows }]) => {
      let maxNum = 0;
      [...(jobRows || []), ...(taskRows || [])].forEach(r => {
        const m = (r.job_number || "").match(/XY(\d+)/);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      });
      setNextCode(`XY${String(maxNum + 1).padStart(6, "0")}`);
    });
  }, [isEdit]);

  const [form, setForm] = useState({
    job_number: job?.job_number || "",
    start_date: job?.start_date ? job.start_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    client: job?.client || "",
    film_title: job?.film_title || "",
    office: job?.office || "LDN",
    print_digital: job?.print_digital || "Digital",
    project_description: job?.project_description || "",
    job_work_category: job?.job_work_category || "",
    ordered_by: job?.ordered_by || "",
    billed_to: job?.billed_to || "",
    fixed_cost: job?.fixed_cost ?? "",
    third_party_cost: job?.third_party_cost ?? "",
    estimated_cost: job?.estimated_cost ?? "",
    completed_date: job?.completed_date ? job.completed_date.slice(0, 10) : "",
    job_done: job?.job_done || false,
    status: job?.status || "Inactive",
    notes: job?.notes || "",
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const bodyClass = layout === "modal" ? "overflow-y-auto flex-1 px-6 py-5 space-y-6" : "space-y-6";
  const footerClass = layout === "modal"
    ? "px-6 py-4 border-t border-[#dce4ec] flex justify-end gap-2 shrink-0"
    : "pt-5 border-t border-[#dce4ec] flex justify-end gap-2";

  // Live preview: "Film Title : XY025999, Project Description" — updates as you type
  const livePreview = useMemo(() => {
    if (!nextCode) return "";
    const film = form.film_title.trim();
    const desc = form.project_description.trim();
    let s = film ? `${film} : ${nextCode}` : nextCode;
    if (desc) s += `, ${desc}`;
    return s;
  }, [nextCode, form.film_title, form.project_description]);

  const canSave = isEdit
    ? form.job_number.trim() && form.client && form.start_date
    : nextCode && form.client && form.start_date;

  const handleSave = () => onSave(isEdit ? form : { ...form, job_number: livePreview });

  return (
    <>
      <div className={bodyClass}>
        <div>
          <FieldLabel text="Job Number" required />
          {isEdit ? (
            <input value={form.job_number} onChange={e => set("job_number", e.target.value)}
              placeholder="e.g. The Odyssey : XY025999, Finishing"
              className={`${MODAL_INPUT} font-mono`} />
          ) : (
            <>
              <div className={`${MODAL_INPUT} font-mono bg-slate-50 flex items-center min-h-[42px]`}>
                {nextCode ? livePreview : "Allocating next job number…"}
              </div>
              <p className="text-[10px] text-[#768994] mt-1.5">
                Auto-allocated — updates live as you fill in the film and project description below.
              </p>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div>
            <FieldLabel text="Start Date" required />
            <input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)}
              className={MODAL_INPUT} />
          </div>
          <PillField label="Office" value={form.office} onChange={v => set("office", v)} options={OFFICES} />
        </div>

        <div className="grid grid-cols-2 gap-5">
          <ComboField label="Client" required value={form.client} onChange={v => set("client", v)}
            options={clients} placeholder="Search clients…" filters={CLIENT_FILTERS} />
          <PillField label="Print / Digital" value={form.print_digital} onChange={v => set("print_digital", v)}
            options={PRINT_DIGITAL} colorMap={PD_COLOR_MAP} />
        </div>

        <ComboField label="Film Title" value={form.film_title} onChange={v => set("film_title", v)}
          options={films} placeholder="Search films, or type something else (e.g. Studio Management)…" />

        <ComboField label="Project Description" value={form.project_description}
          onChange={v => set("project_description", v)}
          options={descs} placeholder="Search descriptions or type a new one…"
          filters={DESC_FILTERS} />

        <ComboField label="Item Category" value={form.job_work_category}
          onChange={v => set("job_work_category", v)}
          options={categories} placeholder="Search categories…"
          filters={CAT_FILTERS} />

        <div className="grid grid-cols-2 gap-5">
          <ComboField label="Ordered By" value={form.ordered_by} onChange={v => set("ordered_by", v)}
            options={orderedByOpts} placeholder="Name or type new…" />
          <ComboField label="Billed To" value={form.billed_to} onChange={v => set("billed_to", v)}
            options={billedToOpts} placeholder="Company or name…" />
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#768994] mb-3">Costs</p>
          <div className="grid grid-cols-3 gap-4">
            {[["Fixed", "fixed_cost"], ["3rd Party", "third_party_cost"], ["Estimated", "estimated_cost"]].map(([lbl, field]) => (
              <div key={field}>
                <FieldLabel text={lbl} />
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#768994] text-sm font-bold select-none">£</span>
                  <input type="number" step="0.01" min="0" value={form[field]}
                    onChange={e => set(field, e.target.value)} placeholder="0.00"
                    className={`${MODAL_INPUT} pl-8`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <PillField label="Status" value={form.status} onChange={v => set("status", v)}
          options={JOB_STATUSES} colorMap={STATUS_COLOR_MAP} />

        <div className="grid grid-cols-2 gap-5">
          <div>
            <FieldLabel text="Completed Date" />
            <input type="date" value={form.completed_date} onChange={e => set("completed_date", e.target.value)}
              className={MODAL_INPUT} />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={() => set("job_done", !form.job_done)}
              className={`flex items-center gap-2.5 w-full px-4 py-2.5 rounded-2xl border font-bold text-sm transition-all ${
                form.job_done
                  ? "bg-[#1cc1a5]/10 border-[#1cc1a5] text-[#1cc1a5]"
                  : "bg-white border-[#dce4ec] text-[#768994] hover:border-[#1cc1a5]/50"
              }`}>
              <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${
                form.job_done ? "bg-[#1cc1a5] border-[#1cc1a5]" : "border-[#dce4ec]"
              }`}>
                {form.job_done && <Check className="w-3 h-3 text-white" />}
              </div>
              Job Done
            </button>
          </div>
        </div>

        <div>
          <FieldLabel text="Notes" />
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
            rows={3} placeholder="Any additional notes…"
            className={`${MODAL_INPUT} resize-none`} />
        </div>
      </div>

      <div className={footerClass}>
        {onCancel && (
          <button onClick={onCancel}
            className="px-5 py-2.5 text-sm font-bold text-[#768994] hover:text-[#122027] bg-white border border-[#dce4ec] rounded-2xl transition-all">
            Cancel
          </button>
        )}
        <button onClick={handleSave} disabled={saving || !canSave}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#12a0e1] hover:bg-[#0d8bc4] text-white text-sm font-bold rounded-2xl transition-all disabled:opacity-50 shadow-sm">
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {submitLabel || (isEdit ? "Save Changes" : "Create Job")}
        </button>
      </div>
    </>
  );
}

// ── Job Form Modal (edit only — creation now lives in Jobs Setup > Custom Job) ─
function JobModal({ job, clients, films, categories, descs, onSave, onClose, saving }) {
  return (
    // onMouseDown instead of onClick: fires before blur, so the close is instant
    // and never races with a combobox dropdown's state updates.
    <div className="fixed inset-0 z-[9999] bg-[#122027]/60 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-[#dce4ec]"
        onMouseDown={e => e.stopPropagation()}>

        <div className="px-6 pt-5 pb-4 border-b border-[#dce4ec] flex items-center justify-between shrink-0">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#12a0e1] mb-0.5">Job Book</p>
            <h2 className="text-xl font-black text-[#122027]">Edit {job?.job_number}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <JobForm job={job} clients={clients} films={films} categories={categories} descs={descs}
          onSave={onSave} onCancel={onClose} saving={saving} layout="modal" />
      </div>
    </div>
  );
}

// ── Film Setup: Wrike master-template folder trees ────────────────────────────
// Mirrors each studio's "_STUDIO_MASTER_TEMPLATES" folder in Wrike. Every node
// tagged jobNumber:true gets its own auto-generated job number when a film is
// created — mirrors how the real template's "JOBNUMBER_..." folders are
// currently hand-replaced per new job.
const FOLDER_TEMPLATES = {
  Paramount: {
    label: "_Paramount_MASTER_TEMPLATES",
    children: [
      { label: "_House_Keeping" },
      { label: "Digital" },
      { label: "Launch", children: [
        { label: "Artwork_Launch" },
        { label: "Character_Poster_Launch" },
        { label: "PLF_Launch" },
        { label: "Reporting" },
      ]},
      { label: "Print", children: [
        { label: "DOM" },
        { label: "INT_Creative", children: [
          { label: "JOBNUMBER_Finishing", jobNumber: true },
          { label: "JOBNUMBER_Print_Quad_Creation_OV", jobNumber: true },
          { label: "INTL", children: [
            { label: "JOBNUMBER_CMYK_Conversions", jobNumber: true },
            { label: "JOBNUMBER_INTL_Asset_Chart", jobNumber: true },
            { label: "JOBNUMBER_INTL_Outdoor_Campaign_Bespoke", jobNumber: true },
            { label: "JOBNUMBER_INTL_Outdoor_Campaign_Masters", jobNumber: true },
            { label: "JOBNUMBER_INTL_PRINT_Outdoor_Campaign_Markets", jobNumber: true },
            { label: "JOBNUMBER_Print_OV_Mechs", jobNumber: true },
            { label: "JOBNUMBER_Standee", jobNumber: true },
            { label: "JOBNUMBER_TYPE_Title_Adjustment", jobNumber: true },
            { label: "JOBNUMBER_TYPE_Titles", jobNumber: true },
          ]},
        ]},
      ]},
    ],
  },
};

const STUDIO_OPTIONS = ["Paramount", "Sony", "Universal"];
// Studios we can currently fetch/test live from Wrike (have a master-template folder).
// Paramount also ships a hardcoded fallback tree above; Universal is fetch-only.
const TESTABLE_STUDIOS = new Set(["Paramount", "Universal"]);

const JOBS_SETUP_TABS = [
  { id: "campaign", label: "Bulk Campaign", desc: "Generate a whole campaign's job numbers at once from a studio's Wrike folder template.", icon: FolderPlus, color: "from-blue-500 to-[#12a0e1]" },
  { id: "custom",   label: "Custom Job",    desc: "Add a single one-off job manually, with its own job number and details.", icon: Plus, color: "from-emerald-500 to-teal-600" },
];

function JobsSetupSection({ setActiveTab }) {
  const [innerTab, setInnerTab] = useState("campaign");
  const [studio, setStudio] = useState("Paramount");
  const [filmTitle, setFilmTitle] = useState("");
  const [preview, setPreview] = useState(null); // { template, jobs: [{ label, description, code, jobNumber }] }
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [fetchedTemplate, setFetchedTemplate] = useState(null); // real subtree pulled live from Wrike
  const [fetchingTemplate, setFetchingTemplate] = useState(false);
  const [fetchInfo, setFetchInfo] = useState(null); // { rootLabel, jobCount } | { error }
  const [films, setFilms] = useState([]);
  const [filmsLoading, setFilmsLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [categories, setCategories] = useState([]);
  const [descs, setDescs] = useState([]);
  const [customSaving, setCustomSaving] = useState(false);
  const [customCreated, setCustomCreated] = useState(null); // job_number of the row just created

  // Films are added in the Films tab first — this section only picks from that
  // list, it never creates new films, so the two stay in sync by construction.
  useEffect(() => {
    supabase.from("films").select("title").order("title").then(({ data }) => {
      setFilms((data || []).map(f => f.title));
      setFilmsLoading(false);
    });
    supabase.from("clients").select("name").order("name").then(({ data }) => setClients((data || []).map(c => c.name)));
    supabase.from("job_categories").select("name").order("name").then(({ data }) => setCategories((data || []).map(c => c.name)));
    supabase.from("project_descriptions").select("description").order("description").then(({ data }) => setDescs((data || []).map(d => d.description)));
  }, []);

  const handleCreateCustomJob = async (form) => {
    setCustomSaving(true);
    const payload = {
      ...form,
      start_date: form.start_date || null,
      completed_date: form.completed_date || null,
      fixed_cost: form.fixed_cost === "" ? null : parseFloat(form.fixed_cost),
      third_party_cost: form.third_party_cost === "" ? null : parseFloat(form.third_party_cost),
      estimated_cost: form.estimated_cost === "" ? null : parseFloat(form.estimated_cost),
    };
    const { error } = await supabase.from("jobs").insert(payload);
    setCustomSaving(false);
    if (!error) setCustomCreated(form.job_number);
    else alert(
      error.code === "23505"
        ? `Job number "${form.job_number}" already exists in Job Book.`
        : "Failed to create job: " + error.message
    );
  };

  // Walk the template, collecting every jobNumber:true leaf with a human-readable description
  const collectJobLeaves = (node) => {
    let leaves = node.jobNumber
      ? [{ label: node.label, description: node.label.replace(/^JOBNUMBER_?/i, "").replace(/_/g, " ").trim() || "General" }]
      : [];
    (node.children || []).forEach(c => { leaves = leaves.concat(collectJobLeaves(c)); });
    return leaves;
  };

  // Pull the real master-template folder subtree from Wrike using the personal
  // token already stored for the timesheet pulls. Builds the same
  // { label, children, jobNumber } shape as the hardcoded FOLDER_TEMPLATES,
  // tagging every "JOBNUMBER_..." folder so it gets a generated code.
  const fetchTemplateFromWrike = async () => {
    const token = localStorage.getItem("wrike_personal_token");
    if (!token) { setFetchInfo({ error: "No Wrike token found — add it in Profile → Settings first." }); return; }
    setFetchingTemplate(true);
    setFetchInfo(null);
    setPreview(null);
    setCreated(null);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const FF = encodeURIComponent("[childIds]");
      const fd = {};
      let url = `https://www.wrike.com/api/v4/folders?fields=${FF}`;
      while (url) {
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`Wrike folders fetch failed (${res.status})`);
        const json = await res.json();
        (json.data || []).forEach(f => { fd[f.id] = { id: f.id, title: f.title, childIds: f.childIds || [] }; });
        url = json.nextPageToken
          ? `https://www.wrike.com/api/v4/folders?fields=${FF}&nextPageToken=${json.nextPageToken}`
          : null;
      }
      // Find candidate master-template roots by fuzzy title match. There can be
      // several ("_Paramount_MASTER_TEMPLATES", a "... copy", archived dupes), so
      // build each subtree and pick the one with the most JOBNUMBER folders,
      // penalising obvious duplicates — that's the real, populated template.
      const wanted = studio.toUpperCase();
      const candidates = Object.values(fd).filter(f => {
        const norm = (f.title || "").toUpperCase().replace(/[_\s]+/g, " ");
        return norm.includes(wanted) && norm.includes("MASTER TEMPLATE");
      });
      if (!candidates.length) throw new Error(`No "${studio}" master-template folder found in Wrike.`);

      const buildFrom = (rootId) => {
        const visited = new Set();
        const build = (id) => {
          if (visited.has(id)) return null;
          visited.add(id);
          const node = fd[id];
          if (!node) return null;
          const children = (node.childIds || []).map(build).filter(Boolean);
          const out = { label: node.title };
          if (children.length) out.children = children;
          if (/JOBNUMBER/i.test(node.title || "")) out.jobNumber = true;
          return out;
        };
        return build(rootId);
      };

      let best = null;
      for (const cand of candidates) {
        const tree = buildFrom(cand.id);
        const jobCount = collectJobLeaves(tree).length;
        const isDupe = /\b(COPY|ARCHIVE|ARCHIVED|OLD|BACKUP|BAK)\b/i.test(cand.title || "");
        const score = jobCount - (isDupe ? 1e6 : 0) - (cand.title || "").length * 0.001;
        if (!best || score > best.score) best = { tree, jobCount, title: cand.title, score };
      }
      setFetchedTemplate(best.tree);
      setFetchInfo({ rootLabel: best.title, jobCount: best.jobCount });
    } catch (e) {
      setFetchInfo({ error: e.message });
      setFetchedTemplate(null);
    } finally {
      setFetchingTemplate(false);
    }
  };

  const generatePreview = useCallback(async () => {
    if (!filmTitle.trim()) return;
    const template = fetchedTemplate || FOLDER_TEMPLATES[studio];
    if (!template) return;

    setLoadingPreview(true);
    // Find the highest existing XY###### code across jobs + tasks so new codes
    // continue the real sequence rather than colliding with anything already in use.
    const [{ data: jobRows }, { data: taskRows }] = await Promise.all([
      supabase.from("jobs").select("job_number"),
      supabase.from("tasks").select("job_number"),
    ]);
    let maxNum = 0;
    [...(jobRows || []), ...(taskRows || [])].forEach(r => {
      const m = (r.job_number || "").match(/XY(\d+)/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    });

    const leaves = collectJobLeaves(template);
    let next = maxNum + 1;
    const jobsOut = leaves.map(l => {
      const code = `XY${String(next++).padStart(6, "0")}`;
      return { ...l, code, jobNumber: `${filmTitle.trim()} : ${code}, ${l.description}` };
    });

    setPreview({ template, jobs: jobsOut });
    setCreated(null);
    setLoadingPreview(false);
  }, [filmTitle, studio, fetchedTemplate]);

  const createFilmJobs = async () => {
    if (!preview) return;
    setSaving(true);
    const title = filmTitle.trim();
    const rows = preview.jobs.map(j => ({
      job_number: j.jobNumber,
      film_title: title,
      // Status starts Inactive for every new job — Active/Closed get set later
      // in Job Book as billing info comes in and the job wraps up.
      status: "Inactive",
      // Job Book's default view filters by month on start_date — stamp today so
      // newly-created jobs are visible there immediately instead of vanishing.
      start_date: new Date().toISOString().slice(0, 10),
    }));
    // Film is picked from the Films tab, never created here — the two tables
    // stay in sync by construction (see the films picker below).
    const { error } = await supabase.from("jobs").insert(rows);
    setSaving(false);
    if (!error) setCreated(rows.length);
    else alert("Failed to create jobs: " + error.message);
  };

  const jobMapForTree = useMemo(() => {
    const m = new Map();
    (preview?.jobs || []).forEach(j => m.set(j.label, j));
    return m;
  }, [preview]);

  // Recursive tree renderer — replaces the JOBNUMBER_ prefix with the generated code when previewing.
  // Uses a path-based key since live Wrike data can have repeated folder names across branches.
  // The root folder in Wrike is always renamed to the film itself (e.g. "Passenger",
  // "Angry_Birds_3_Movie") rather than keeping the "_STUDIO_MASTER_TEMPLATES" name —
  // mirror that here once a film is picked.
  const renderTree = (node, depth = 0, path = "0") => {
    const generated = jobMapForTree.get(node.label);
    const displayLabel = depth === 0 && filmTitle.trim()
      ? filmTitle.trim().replace(/\s+/g, "_")
      : generated ? node.label.replace(/^JOBNUMBER/i, generated.code) : node.label;
    return (
      <div key={path}>
        <div className="flex items-center gap-1.5 py-1" style={{ paddingLeft: depth * 18 }}>
          {node.children?.length
            ? <FolderOpen className="w-3.5 h-3.5 text-[#f4b740] shrink-0" />
            : <Folder className="w-3.5 h-3.5 text-[#b0bec5] shrink-0" />}
          <span className={`text-[12px] ${generated ? "font-mono font-bold text-[#12a0e1]" : "text-[#122027]"}`}>
            {displayLabel}
          </span>
        </div>
        {node.children?.map((c, i) => renderTree(c, depth + 1, `${path}-${i}`))}
      </div>
    );
  };

  const reset = () => {
    setFilmTitle("");
    setPreview(null);
    setCreated(null);
    // keep fetchedTemplate so another film can be created from the same pull
  };

  // What to display: the generated preview's tree if present, else the freshly-fetched tree.
  const templateToShow = preview?.template || fetchedTemplate;
  const hasTemplate = !!(fetchedTemplate || FOLDER_TEMPLATES[studio]);
  const pendingLeaves = !preview && fetchedTemplate ? collectJobLeaves(fetchedTemplate) : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        {JOBS_SETUP_TABS.map(t => {
          const Icon = t.icon;
          const active = innerTab === t.id;
          return (
            <button key={t.id} onClick={() => setInnerTab(t.id)}
              className={`text-left rounded-2xl p-5 border-2 transition-all ${
                active
                  ? "border-[#12a0e1] bg-[#12a0e1]/5 shadow-md"
                  : "border-[#dce4ec] bg-white hover:border-slate-300 hover:shadow-sm"
              }`}>
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${t.color} flex items-center justify-center shadow-sm`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                {active && (
                  <div className="w-5 h-5 rounded-full bg-[#12a0e1] flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
              <p className="text-sm font-black text-[#122027] mb-1">{t.label}</p>
              <p className="text-xs text-[#768994] leading-relaxed">{t.desc}</p>
            </button>
          );
        })}
      </div>

      {innerTab === "campaign" && (
    <div className="flex flex-col gap-5">
      <div className="bg-[#f8fafc] border border-[#dce4ec] rounded-2xl p-4">
        <p className="text-xs text-[#768994] leading-relaxed">
          Prototype: add the film in the <span className="font-bold text-[#122027]">Films</span> tab first, then
          come back here — <span className="font-bold text-[#122027]">Fetch Template</span> pulls the studio's
          real master-template folder tree live from Wrike, pick the film, then generate the structure with
          real, sequential job numbers substituted for every
          <span className="font-mono text-[#122027]"> JOBNUMBER_...</span> folder, and create the matching
          Job Book entries. Wrike folder creation isn't wired up yet — this only writes to Job Book for now.
        </p>
      </div>

      <div>
        <label className="block text-[10px] font-black uppercase tracking-widest text-[#768994] mb-1.5">Studio Template</label>
        <div className="flex gap-2">
          {STUDIO_OPTIONS.map(s => {
            const available = TESTABLE_STUDIOS.has(s);
            return (
              <button key={s} disabled={!available}
                onClick={() => { setStudio(s); setPreview(null); setCreated(null); setFetchedTemplate(null); setFetchInfo(null); }}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                  studio === s
                    ? "bg-[#122027] text-white border-[#122027]"
                    : available
                      ? "bg-white text-[#122027] border-[#dce4ec] hover:border-[#12a0e1]"
                      : "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"
                }`}>
                {s}{!available && " (soon)"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={fetchTemplateFromWrike} disabled={fetchingTemplate || !TESTABLE_STUDIOS.has(studio)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-[#12a0e1] text-[#12a0e1] hover:bg-[#12a0e1] hover:text-white text-xs font-bold rounded-xl transition-all disabled:opacity-40">
          {fetchingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {fetchingTemplate ? "Fetching from Wrike…" : `Fetch ${studio} template from Wrike`}
        </button>
        {fetchInfo?.error && <span className="text-xs font-bold text-red-500">{fetchInfo.error}</span>}
        {fetchInfo && !fetchInfo.error && (
          <span className="text-xs font-bold text-[#1cc1a5]">
            Loaded “{fetchInfo.rootLabel}” — {fetchInfo.jobCount} job folder{fetchInfo.jobCount === 1 ? "" : "s"}
          </span>
        )}
        {fetchedTemplate && (
          <span className="text-[10px] font-black uppercase tracking-wider text-[#12a0e1] bg-[#12a0e1]/10 px-2 py-1 rounded-lg">Live Wrike Data</span>
        )}
      </div>

      <div>
        <label className="block text-[10px] font-black uppercase tracking-widest text-[#768994] mb-1.5">Film</label>
        <div className="flex gap-2">
          <StrictSelect value={filmTitle} onChange={v => { setFilmTitle(v); setPreview(null); setCreated(null); }}
            options={films} placeholder="Select a film…" loading={filmsLoading} className="flex-1" />
          <button onClick={generatePreview} disabled={!filmTitle.trim() || loadingPreview || !hasTemplate}
            title={!hasTemplate ? "Fetch the template from Wrike first" : ""}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#122027] hover:bg-[#1a2e38] text-white text-sm font-bold rounded-xl transition-all disabled:opacity-40">
            {loadingPreview && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Generate Preview
          </button>
        </div>
        {!filmsLoading && films.length === 0 && (
          <p className="text-xs text-[#768994] mt-1.5">
            No films yet — add one in the{" "}
            <button onClick={() => setActiveTab?.("films")} className="text-[#12a0e1] font-bold hover:underline">Films</button> tab first.
          </p>
        )}
      </div>

      {templateToShow && (
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-[#dce4ec] rounded-2xl p-4 max-h-[420px] overflow-y-auto">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#768994] mb-2">
              Folder Preview{fetchedTemplate ? " · live from Wrike" : ""}
            </p>
            {renderTree(templateToShow)}
          </div>
          <div className="border border-[#dce4ec] rounded-2xl p-4 max-h-[420px] overflow-y-auto">
            {preview ? (
              <>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#768994] mb-2">
                  {preview.jobs.length} Job Number{preview.jobs.length === 1 ? "" : "s"} To Create
                </p>
                <div className="flex flex-col gap-1.5">
                  {preview.jobs.map(j => (
                    <div key={j.code} className="flex items-center justify-between text-[11px] border-b border-[#f0f4f8] pb-1.5">
                      <span className="font-mono font-bold text-[#12a0e1]">{j.code}</span>
                      <span className="text-[#768994] text-right">{j.description}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#768994] mb-2">
                  {pendingLeaves.length} Job Folder{pendingLeaves.length === 1 ? "" : "s"} Detected
                </p>
                <p className="text-[11px] text-[#768994] mb-2">Enter a film name and hit Generate Preview to assign sequential codes.</p>
                <div className="flex flex-col gap-1">
                  {pendingLeaves.map((l, i) => (
                    <div key={l.label + i} className="text-[11px] font-mono text-[#122027] border-b border-[#f0f4f8] py-1">{l.label}</div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {preview && (
        <div className="flex items-center gap-3">
          {created == null ? (
            <>
              <button onClick={createFilmJobs} disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#1cc1a5] hover:bg-[#17a68d] text-white text-sm font-bold rounded-2xl transition-all disabled:opacity-50 shadow-sm">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Create Film &amp; Jobs
              </button>
              <button disabled
                title="Coming soon — will use the Wrike API to duplicate the template folder automatically"
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-400 text-sm font-bold rounded-2xl cursor-not-allowed">
                <FolderPlus className="w-3.5 h-3.5" /> Push Folders to Wrike (Soon)
              </button>
            </>
          ) : (
            <>
              <span className="flex items-center gap-2 px-4 py-2.5 bg-[#1cc1a5]/10 text-[#1cc1a5] text-sm font-bold rounded-2xl">
                <CheckCircle2 className="w-3.5 h-3.5" /> Created {created} job{created === 1 ? "" : "s"} in Job Book
              </span>
              <button onClick={() => setActiveTab?.("jobs")}
                className="px-4 py-2.5 bg-[#122027] hover:bg-[#1a2e38] text-white text-sm font-bold rounded-2xl transition-all">
                View in Job Book
              </button>
              <button onClick={reset}
                className="px-4 py-2.5 bg-white border border-[#dce4ec] hover:border-[#12a0e1] text-[#122027] text-sm font-bold rounded-2xl transition-all">
                Start Another Film
              </button>
            </>
          )}
        </div>
      )}
    </div>
      )}

      {innerTab === "custom" && (
        <div>
          {customCreated == null ? (
            <JobForm clients={clients} films={films} categories={categories} descs={descs}
              onSave={handleCreateCustomJob} saving={customSaving} submitLabel="Create Job" layout="inline" />
          ) : (
            <div className="flex items-center gap-3 py-4">
              <span className="flex items-center gap-2 px-4 py-2.5 bg-[#1cc1a5]/10 text-[#1cc1a5] text-sm font-bold rounded-2xl">
                <CheckCircle2 className="w-3.5 h-3.5" /> Created {customCreated} in Job Book
              </span>
              <button onClick={() => setActiveTab?.("jobs")}
                className="px-4 py-2.5 bg-[#122027] hover:bg-[#1a2e38] text-white text-sm font-bold rounded-2xl transition-all">
                View in Job Book
              </button>
              <button onClick={() => setCustomCreated(null)}
                className="px-4 py-2.5 bg-white border border-[#dce4ec] hover:border-[#12a0e1] text-[#122027] text-sm font-bold rounded-2xl transition-all">
                Add Another Job
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Job Book Section ───────────────────────────────────────────────────────────
function JobBookSection({ setActiveTab }) {
  const [jobs, setJobs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [monthFilter, setMonthFilter] = useState(() => new Date().toISOString().slice(0, 7));
  const [showModal, setShowModal] = useState(false);
  const [editJob, setEditJob]   = useState(null);
  const [saving, setSaving]     = useState(false);
  const [clients, setClients]   = useState([]);
  const [films, setFilms]       = useState([]);
  const [categories, setCategories] = useState([]);
  const [descs, setDescs]       = useState([]);
  const [page, setPage]         = useState(0);
  const PER_PAGE = 50;

  const loadRef = useCallback(async () => {
    const [c, f, cat, d] = await Promise.all([
      supabase.from("clients").select("name").order("name"),
      supabase.from("films").select("title, created_at").order("created_at", { ascending: false }),
      supabase.from("job_categories").select("name").order("name"),
      supabase.from("project_descriptions").select("description").order("description"),
    ]);
    setClients((c.data || []).map(x => x.name));
    setFilms((f.data || []).map(x => x.title));
    setCategories((cat.data || []).map(x => x.name));
    setDescs((d.data || []).map(x => x.description));
  }, []);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("jobs").select("*").order("id", { ascending: false });
    if (monthFilter) {
      const start = monthFilter + "-01";
      const end = new Date(monthFilter + "-01");
      end.setMonth(end.getMonth() + 1);
      q = q.gte("start_date", start).lt("start_date", end.toISOString().slice(0, 10));
    }
    const { data } = await q;
    setJobs(data || []);
    setLoading(false);
  }, [monthFilter]);

  useEffect(() => { loadRef(); }, [loadRef]);
  useEffect(() => { loadJobs(); setPage(0); }, [loadJobs]);

  const filtered = useMemo(() =>
    jobs.filter(j =>
      !search ||
      (j.job_number || "").toLowerCase().includes(search.toLowerCase()) ||
      (j.client || "").toLowerCase().includes(search.toLowerCase()) ||
      (j.film_title || "").toLowerCase().includes(search.toLowerCase())
    ),
    [jobs, search]
  );

  const paginated = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

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
    if (editJob?.id) {
      await supabase.from("jobs").update(payload).eq("id", editJob.id);
    } else {
      await supabase.from("jobs").insert(payload);
    }
    setShowModal(false); setEditJob(null);
    await loadJobs();
    setSaving(false);
  };

  const toggleDone = async (job) => {
    await supabase.from("jobs").update({ job_done: !job.job_done }).eq("id", job.id);
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, job_done: !j.job_done } : j));
  };

  // Click cycles Inactive -> Active -> Closed -> Inactive, matching the workflow:
  // new jobs start Inactive, go Active once billing info is filled in, Closed when done.
  const cycleStatus = async (job) => {
    const next = JOB_STATUSES[(JOB_STATUSES.indexOf(job.status || "Inactive") + 1) % JOB_STATUSES.length];
    await supabase.from("jobs").update({ status: next }).eq("id", job.id);
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: next } : j));
  };

  const deleteJob = async (id) => {
    if (!confirm("Delete this job?")) return;
    await supabase.from("jobs").delete().eq("id", id);
    await loadJobs();
  };

  const formatCost = (j) => {
    if (j.fixed_cost) return `Fixed: $${parseFloat(j.fixed_cost).toLocaleString()}`;
    if (j.estimated_cost) return `Est: $${parseFloat(j.estimated_cost).toLocaleString()}`;
    if (j.third_party_cost) return `3P: $${parseFloat(j.third_party_cost).toLocaleString()}`;
    return "—";
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2 bg-white border border-[#dce4ec] rounded-xl px-3 py-2">
          <span className="text-[10px] font-black text-[#768994] uppercase tracking-widest">Month</span>
          <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
            className="text-sm font-bold text-[#122027] outline-none bg-transparent" />
          {monthFilter && (
            <button onClick={() => setMonthFilter("")} className="text-slate-400 hover:text-rose-500">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#768994]" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search job number, client, film…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-[#dce4ec] rounded-xl outline-none focus:border-[#12a0e1] bg-white"
          />
        </div>
        <button onClick={() => setActiveTab?.("jobsSetup")}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#12a0e1] hover:bg-[#0d8bc4] text-white text-sm font-bold rounded-xl transition-all shrink-0">
          <Plus className="w-4 h-4" /> Add Jobs
        </button>
      </div>

      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-black text-[#768994] uppercase tracking-widest">
          {filtered.length} jobs
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="p-1 disabled:opacity-30 hover:bg-slate-100 rounded-lg">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-bold text-[#768994]">{page + 1} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
              className="p-1 disabled:opacity-30 hover:bg-slate-100 rounded-lg">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-[#768994]">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading jobs…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#dce4ec]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-[#dce4ec]">
                {["Job #","Date","Client","Office","P/D","Film Title","Project Description","Costs","Ordered By","Billed To","Status","Done",""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-[#768994] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={13} className="text-center py-12 text-[#768994] italic">No jobs found</td></tr>
              ) : paginated.map(j => (
                <tr key={j.id} className={`border-b border-[#dce4ec] last:border-0 hover:bg-slate-50/50 transition-colors ${j.job_done ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2.5">
                    <span className="font-black text-[#12a0e1] font-mono">{j.job_number}</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-[#768994]">
                    {j.start_date ? new Date(j.start_date).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"2-digit" }) : "—"}
                  </td>
                  <td className="px-3 py-2.5 max-w-[120px] truncate font-medium text-[#122027]">{j.client || "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{j.office || "—"}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${j.print_digital === "Digital" ? "bg-cyan-100 text-cyan-700" : j.print_digital === "Print" ? "bg-orange-100 text-orange-700" : "bg-purple-100 text-purple-700"}`}>
                      {j.print_digital || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 max-w-[100px] truncate italic text-[#768994]">{j.film_title || "—"}</td>
                  <td className="px-3 py-2.5 max-w-[160px] truncate text-[#122027]">{j.project_description || "—"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-bold text-[#122027]">{formatCost(j)}</td>
                  <td className="px-3 py-2.5 text-[#768994]">{j.ordered_by || "—"}</td>
                  <td className="px-3 py-2.5 text-[#768994]">{j.billed_to || "—"}</td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => cycleStatus(j)} title="Click to change status"
                      className={`text-[9px] font-black px-2 py-1 rounded-full transition-colors ${STATUS_BADGE[j.status || "Inactive"]}`}>
                      {j.status || "Inactive"}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => toggleDone(j)} title="Toggle done">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${j.job_done ? "bg-[#1cc1a5] border-[#1cc1a5]" : "border-[#dce4ec] hover:border-[#1cc1a5]"}`}>
                        {j.job_done && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditJob(j); setShowModal(true); }}
                        className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-[#122027] transition-colors">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => deleteJob(j.id)}
                        className="p-1 hover:bg-rose-100 rounded-lg text-slate-400 hover:text-rose-600 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <JobModal
          job={editJob}
          clients={clients} films={films} categories={categories} descs={descs}
          onSave={handleSave} onClose={() => { setShowModal(false); setEditJob(null); }}
          saving={saving}
        />
      )}
    </div>
  );
}

// ── Jobs Feed ─────────────────────────────────────────────────────────────────
function JobsFeedSection() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    // "date" is a text column with mixed historical formats (dd/mm/yyyy and
    // ISO), so filtering it with .gte()/.lt() at the DB level is unreliable —
    // it's a lexicographic string compare, not a real date compare. Fetch
    // everything and filter by month client-side after normalising to ISO.
    const { data: allTasks } = await supabase
      .from("tasks")
      .select("*")
      .order("id", { ascending: false })
      .limit(2000);

    const toIso = (d) => {
      if (!d) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
      const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
    };

    const tasks = monthFilter
      ? (allTasks || []).filter(t => (toIso(t.date) || "").startsWith(monthFilter))
      : (allTasks || []);

    // Sort by the job's actual date (not by row id / sync time) — id only
    // reflects when a row was pulled into the app, which can be well after
    // the work date it's tagged with. Rows without a parseable date fall
    // to the bottom; ties break by most-recently-synced first.
    tasks.sort((a, b) => {
      const da = toIso(a.date) || "";
      const db = toIso(b.date) || "";
      if (da !== db) return db.localeCompare(da);
      return (b.id || 0) - (a.id || 0);
    });

    if (!tasks?.length) { setEntries([]); setLoading(false); return; }

    const userIds = [...new Set(tasks.map(t => t.wrike_user_id).filter(Boolean))];
    const jobNums = [...new Set(tasks.map(t => t.job_number).filter(Boolean))];

    const [{ data: profiles }, { data: jobs }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("wrike_user_id, first_name, last_name").in("wrike_user_id", userIds)
        : Promise.resolve({ data: [] }),
      jobNums.length
        ? supabase.from("jobs").select("job_number, office, print_digital, job_work_category, ordered_by, billed_to, fixed_cost").in("job_number", jobNums)
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap = Object.fromEntries(
      (profiles || []).map(p => [p.wrike_user_id, `${p.first_name || ""} ${p.last_name || ""}`.trim()])
    );
    const jobMap = Object.fromEntries((jobs || []).map(j => [j.job_number, j]));

    setEntries(tasks.map(t => ({ ...t, _name: profileMap[t.wrike_user_id] || "—", _job: jobMap[t.job_number] || {} })));
    setLoading(false);
  }, [monthFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter(e =>
      (e.job_number || "").toLowerCase().includes(q) ||
      (e.client || "").toLowerCase().includes(q) ||
      (e.film_title || "").toLowerCase().includes(q) ||
      (e._name || "").toLowerCase().includes(q) ||
      (e.project_description || "").toLowerCase().includes(q)
    );
  }, [entries, search]);

  const fmtDate = (d) => {
    if (!d) return "—";
    try {
      // ISO "2026-06-29" → "29.06.26"
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        const [y, m, day] = d.split("-");
        return `${day}.${m}.${y.slice(2)}`;
      }
      // Legacy "dd/mm/yyyy" → "29.06.26"
      const slash = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (slash) return `${slash[1]}.${slash[2]}.${slash[3].slice(2)}`;
      return d;
    } catch { return d; }
  };
  const fmtNum = (n) => {
    if (n === null || n === undefined || n === "" || n === "none") return "—";
    const s = String(n);
    // New format already stored as "H:MM"
    if (/^\d+:\d{2}$/.test(s)) return s;
    const v = parseFloat(s);
    if (isNaN(v) || v <= 0) return "—";
    // Old decimal hours ("0.5", "1.50") → convert to H:MM
    const mins = s.includes(".") ? Math.round(v * 60) : Math.round(v);
    if (mins <= 0) return "—";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  };

  // Build month options: current + past 11
  const monthOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
  }, []);

  const fmtMonthLabel = (s) => {
    const [y, m] = s.split("-");
    return new Date(+y, +m - 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  };

  const COLS = [
    { key: "job_number",          label: ["Job #"],                    px: 80  },
    { key: "date",                label: ["Date"],                     px: 64  },
    { key: "client",              label: ["Client"],                   px: 130 },
    { key: "office",              label: ["Off."],                     px: 38  },
    { key: "print_digital",       label: ["P/D"],                      px: 44  },
    { key: "film_title",          label: ["Film"],                     px: 120 },
    { key: "job_category",        label: ["Job", "Cat."],              px: 72  },
    { key: "project_description", label: ["Project", "Description"],   px: 140 },
    { key: "category",            label: ["Item", "Category"],         px: 140 },
    { key: "client_amends",       label: ["CA"],                       px: 30  },
    { key: "is_3d",               label: ["3D"],                       px: 28  },
    { key: "costs",               label: ["Costs"],                    px: 68  },
    { key: "ordered_by",          label: ["Ordered", "By"],            px: 100 },
    { key: "billed_to",           label: ["Billed", "To"],             px: 100 },
    { key: "worked_on",           label: ["Worked", "On By"],          px: 100 },
    { key: "hourly_rate",         label: ["Rate"],                     px: 56  },
    { key: "time_spent",          label: ["Time"],                     px: 44  },
    { key: "extra_time",          label: ["Extra"],                    px: 44  },
    { key: "over_time",           label: ["OT"],                       px: 38  },
    { key: "total",               label: ["Total"],                    px: 60  },
  ];

  const getCellValue = (e, key) => {
    const j = e._job || {};
    switch (key) {
      case "job_number": {
        const s = e.job_number || "";
        const colonIdx = s.indexOf(" : ");
        if (colonIdx < 0) return s || "—";
        const after = s.slice(colonIdx + 3);
        const commaIdx = after.indexOf(",");
        return commaIdx > 0 ? after.slice(0, commaIdx).trim() : after.trim();
      }
      case "date":                return fmtDate(e.date);
      case "client":              return e.client || "—";
      case "office":              return j.office || "—";
      case "print_digital":       return j.print_digital || "—";
      case "film_title": {
        // Prefer extracting from job_number "Film Name : XYnnnnnn, ..." — always authoritative
        const colonIdx = (e.job_number || "").indexOf(" : ");
        if (colonIdx > 0) return e.job_number.slice(0, colonIdx).trim();
        return e.film_title || "—";
      }
      case "job_category":        return j.job_work_category || "—";
      case "project_description": return e.project_description || "—";
      case "category":            return e.category || "—";
      case "client_amends":       return e.client_amends ? <Check className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : "";
      case "is_3d":               return e.is_3d ? <Check className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : "";
      case "costs":               return j.fixed_cost != null ? `£${parseFloat(j.fixed_cost).toFixed(2)}` : "—";
      case "ordered_by":          return j.ordered_by || "—";
      case "billed_to":           return j.billed_to || "—";
      case "worked_on":           return e._name;
      case "hourly_rate":         return "—";
      case "time_spent":          return fmtNum(e.time_spent);
      case "extra_time":          return fmtNum(e.additional_time);
      case "over_time":           return "0.00";
      case "total":               return "—";
      default:                    return "—";
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Filters row */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)}
          className="border border-[#dce4ec] rounded-xl px-3 py-2 text-sm font-bold text-[#122027] outline-none focus:border-[#12a0e1] bg-white"
        >
          {monthOptions.map(m => (
            <option key={m} value={m}>{fmtMonthLabel(m)}</option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#b0bec5]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search job, client, film, person…"
            className="w-full pl-9 pr-3 py-2 border border-[#dce4ec] rounded-xl text-sm text-[#122027] outline-none focus:border-[#12a0e1] bg-white"
          />
        </div>
        <span className="text-xs font-bold text-[#b0bec5] ml-auto">
          {loading ? "Loading…" : `${filtered.length} entr${filtered.length === 1 ? "y" : "ies"}`}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[#dce4ec] shadow-sm">
        <table className="border-collapse text-[11px] w-full" style={{ minWidth: `${COLS.reduce((s, c) => s + c.px, 0)}px` }}>
          <thead>
            <tr>
              {COLS.map(c => (
                <th
                  key={c.key}
                  style={{ width: c.px, minWidth: c.px }}
                  className="px-2 py-2.5 text-center font-black uppercase tracking-widest text-[9px] text-white bg-[#0d1b22] border-r border-white/5 last:border-r-0 whitespace-nowrap"
                >
                  {Array.isArray(c.label) ? c.label.map((l, i) => <span key={i} className="block leading-tight">{l}</span>) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={COLS.length} className="px-4 py-8 text-center text-[#b0bec5]">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={COLS.length} className="px-4 py-8 text-center text-[#b0bec5]">No entries for this period</td></tr>
            ) : filtered.map((e, i) => (
              <tr key={e.id} className={`border-b border-[#f0f4f8] align-top ${i % 2 === 0 ? "bg-white" : "bg-[#f8fafc]"} hover:bg-[#edf5fb] transition-colors`}>
                {COLS.map(c => {
                  const val = getCellValue(e, c.key);
                  const isCheck = c.key === "client_amends" || c.key === "is_3d";
                  const isMono = ["time_spent", "extra_time", "over_time", "total", "hourly_rate", "costs"].includes(c.key);
                  const noWrap = ["date", "office", "print_digital", "client_amends", "is_3d", "time_spent", "extra_time", "over_time", "total", "hourly_rate", "costs"].includes(c.key);
                  return (
                    <td
                      key={c.key}
                      style={{ width: c.px, minWidth: c.px }}
                      className={`px-2 py-1.5 border-r border-[#f0f4f8] last:border-r-0 ${isCheck ? "text-center" : ""} ${isMono ? "font-mono text-[10px]" : ""} ${noWrap ? "whitespace-nowrap" : ""} text-[#122027]`}
                    >
                      <span className={`block leading-snug ${c.key === "job_number" ? "font-black text-[#12a0e1]" : "font-medium"}`}>
                        {val}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Overview / Dashboard ───────────────────────────────────────────────────────
function OverviewSection({ setActiveTab }) {
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [feedEntries, setFeedEntries] = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("jobs").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("wrike_user_id", { count: "exact", head: true }),
      supabase.from("films").select("id", { count: "exact", head: true }),
      supabase.from("clients").select("id", { count: "exact", head: true }),
      supabase.from("job_categories").select("id", { count: "exact", head: true }),
      supabase.from("project_descriptions").select("id", { count: "exact", head: true }),
      supabase.from("positions").select("id", { count: "exact", head: true }),
    ]).then(([jobs, people, films, clients, cats, descs, positions]) => {
      setCounts({ jobs: jobs.count ?? 0, people: people.count ?? 0, films: films.count ?? 0, clients: clients.count ?? 0, categories: cats.count ?? 0, descriptions: descs.count ?? 0, positions: positions.count ?? 0 });
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    setFeedLoading(true);
    supabase.from("tasks").select("*").order("id", { ascending: false }).limit(8)
      .then(async ({ data: tasks }) => {
        if (!tasks?.length) { setFeedEntries([]); setFeedLoading(false); return; }
        const userIds = [...new Set(tasks.map(t => t.wrike_user_id).filter(Boolean))];
        const jobNums = [...new Set(tasks.map(t => t.job_number).filter(Boolean))];
        const [{ data: profiles }, { data: jobs }] = await Promise.all([
          userIds.length ? supabase.from("profiles").select("wrike_user_id, first_name, last_name").in("wrike_user_id", userIds) : Promise.resolve({ data: [] }),
          jobNums.length ? supabase.from("jobs").select("job_number, office, print_digital, job_work_category, ordered_by, billed_to, fixed_cost").in("job_number", jobNums) : Promise.resolve({ data: [] }),
        ]);
        const profileMap = Object.fromEntries((profiles || []).map(p => [p.wrike_user_id, `${p.first_name || ""} ${p.last_name || ""}`.trim()]));
        const jobMap = Object.fromEntries((jobs || []).map(j => [j.job_number, j]));
        setFeedEntries(tasks.map(t => ({ ...t, _name: profileMap[t.wrike_user_id] || "—", _job: jobMap[t.job_number] || {} })));
        setFeedLoading(false);
      });
  }, []);

  const fmtDate = (d) => {
    if (!d) return "—";
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { const [y, m, day] = d.split("-"); return `${day}.${m}.${y.slice(2)}`; }
    const slash = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (slash) return `${slash[1]}.${slash[2]}.${slash[3].slice(2)}`;
    return d;
  };

  const getFilmTitle = (e) => {
    const colonIdx = (e.job_number || "").indexOf(" : ");
    if (colonIdx > 0) return e.job_number.slice(0, colonIdx).trim();
    return e.film_title || "—";
  };

  const CARD_GROUPS = [
    {
      label: "Jobs",
      cards: [
        { id: "jobs", label: "Job Book",  icon: Briefcase, color: "from-[#122027] to-[#12a0e1]", light: "bg-[#12a0e1]/10 text-[#12a0e1] border-[#12a0e1]/20", count: counts.jobs },
        { id: "feed", label: "Jobs Feed", icon: Activity,  color: "from-[#0e86be] to-[#12a0e1]", light: "bg-[#12a0e1]/10 text-[#12a0e1] border-[#12a0e1]/20", count: null },
      ],
    },
    {
      label: "Team",
      cards: [
        { id: "people",    label: "People",    icon: Users,   color: "from-teal-500 to-[#1cc1a5]", light: "bg-teal-50 text-teal-700 border-teal-200", count: counts.people },
        { id: "positions", label: "Positions", icon: UserCog, color: "from-rose-500 to-pink-600",  light: "bg-rose-50 text-rose-700 border-rose-200",  count: counts.positions },
      ],
    },
    {
      label: "Reference",
      cards: [
        { id: "films",      label: "Films",           icon: Film,      color: "from-violet-500 to-purple-600", light: "bg-violet-50 text-violet-700 border-violet-200",    count: counts.films },
        { id: "clients",    label: "Clients",         icon: Building2, color: "from-blue-500 to-cyan-600",     light: "bg-blue-50 text-blue-700 border-blue-200",          count: counts.clients },
        { id: "categories", label: "Item Categories", icon: Tag,       color: "from-amber-500 to-orange-500",  light: "bg-amber-50 text-amber-700 border-amber-200",       count: counts.categories },
        { id: "descs",      label: "Descriptions",    icon: AlignLeft, color: "from-emerald-500 to-teal-600",  light: "bg-emerald-50 text-emerald-700 border-emerald-200", count: counts.descriptions },
      ],
    },
  ];

  const NavCard = ({ card }) => {
    const Icon = card.icon;
    return (
      <button onClick={() => setActiveTab(card.id)}
        className="group text-left bg-white border border-[#dce4ec] rounded-2xl p-5 hover:shadow-md hover:border-slate-300 transition-all">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center mb-4 shadow-sm group-hover:scale-105 transition-transform`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[#768994] mb-1">{card.label}</p>
        {card.count === null ? (
          <p className="text-sm font-bold text-[#768994] mt-1">Live feed</p>
        ) : loading ? (
          <div className="h-8 w-12 bg-slate-100 rounded animate-pulse" />
        ) : (
          <p className="text-3xl font-black text-[#122027]">{(card.count ?? 0).toLocaleString()}</p>
        )}
        <p className={`text-[10px] font-bold mt-2 px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${card.light}`}>
          Open →
        </p>
      </button>
    );
  };

  return (
    <div className="space-y-6">

      {/* Grouped nav cards */}
      <div className="space-y-5">
        {/* Jobs + Team side by side */}
        <div className="flex gap-8">
          {["Jobs", "Team"].map(groupLabel => {
            const group = CARD_GROUPS.find(g => g.label === groupLabel);
            return (
              <div key={groupLabel} className="flex-1">
                <p className="text-[9px] font-black uppercase tracking-widest text-[#b0bec8] mb-3 px-1">{groupLabel}</p>
                <div className="grid grid-cols-2 gap-4">
                  {group.cards.map(card => <NavCard key={card.id} card={card} />)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Reference full row */}
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-[#b0bec8] mb-3 px-1">Reference</p>
          <div className="grid grid-cols-4 gap-4">
            {CARD_GROUPS.find(g => g.label === "Reference").cards.map(card => <NavCard key={card.id} card={card} />)}
          </div>
        </div>
      </div>

      {/* Jobs Feed preview */}
      <div className="bg-[#f8fafc] border border-[#dce4ec] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#dce4ec]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#122027] to-[#12a0e1] flex items-center justify-center shadow-sm">
              <Activity className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#768994]">Live</p>
              <p className="text-sm font-black text-[#122027] leading-none">Jobs Feed</p>
            </div>
          </div>
          <button onClick={() => setActiveTab("feed")}
            className="text-[11px] font-black text-[#12a0e1] hover:text-[#0e86be] transition-colors px-3 py-1.5 rounded-lg hover:bg-[#12a0e1]/10">
            View all →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-[#122027]">
                {["Job #", "Date", "Client", "Film", "Description", "Person", "Office"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-black uppercase tracking-wider text-[8.5px] text-white/80 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {feedLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-[#f0f4f8]">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-3 py-2"><div className="h-3 bg-slate-200 rounded animate-pulse" style={{ width: `${50 + Math.random() * 50}%` }} /></td>
                    ))}
                  </tr>
                ))
              ) : feedEntries.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[#b0bec5]">No recent entries</td></tr>
              ) : feedEntries.map((e, i) => (
                <tr key={e.id} className={`border-b border-[#f0f4f8] hover:bg-[#edf5fb] transition-colors ${i % 2 === 0 ? "bg-white" : "bg-[#f8fafc]"}`}>
                  <td className="px-3 py-2 font-black text-[#12a0e1] text-[10px] whitespace-nowrap">
                    {(() => {
                      const s = e.job_number || "";
                      const colonIdx = s.indexOf(" : ");
                      if (colonIdx < 0) return s || "—";
                      const after = s.slice(colonIdx + 3);
                      const commaIdx = after.indexOf(",");
                      return commaIdx > 0 ? after.slice(0, commaIdx).trim() : after.trim();
                    })()}
                  </td>
                  <td className="px-3 py-2 text-[#768994] whitespace-nowrap font-mono">{fmtDate(e.date)}</td>
                  <td className="px-3 py-2 text-[#122027] whitespace-nowrap">{e.client || "—"}</td>
                  <td className="px-3 py-2 text-[#122027] whitespace-nowrap">{getFilmTitle(e)}</td>
                  <td className="px-3 py-2 text-[#768994] max-w-[180px] truncate">{e.project_description || "—"}</td>
                  <td className="px-3 py-2 text-[#122027] whitespace-nowrap">{e._name}</td>
                  <td className="px-3 py-2">
                    {e._job?.office ? (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-[#12a0e1]/10 text-[#12a0e1]">{e._job.office}</span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

// ── People section ──────────────────────────────────────────────────────────
function PeopleSection() {
  const [people, setPeople]         = useState([]);
  const [positions, setPositions]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [syncing, setSyncing]       = useState(false);
  const [syncMsg, setSyncMsg]       = useState("");
  const [expanded, setExpanded]     = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: profiles }, { data: pos }] = await Promise.all([
      supabase.from("profiles").select("*").order("first_name"),
      supabase.from("positions").select("*").order("title"),
    ]);
    setPeople(profiles || []);
    setPositions(pos || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateField = async (wrikeUserId, patch) => {
    setPeople(prev => prev.map(p => p.wrike_user_id === wrikeUserId ? { ...p, ...patch } : p));
    await supabase.from("profiles").update(patch).eq("wrike_user_id", wrikeUserId);
  };

  const syncFromWrike = async () => {
    const token = localStorage.getItem("wrike_personal_token");
    if (!token) { setSyncMsg("No Wrike token found — log in with your personal token first."); return; }
    setSyncing(true);
    setSyncMsg("");
    try {
      // Fetch contacts and groups in parallel
      const headers = { Authorization: `Bearer ${token}` };
      const [contactsRes, groupsRes] = await Promise.all([
        fetch("https://www.wrike.com/api/v4/contacts", { headers }),
        fetch("https://www.wrike.com/api/v4/groups", { headers }),
      ]);
      if (!contactsRes.ok) throw new Error(`Wrike contacts error ${contactsRes.status}`);

      const contacts = ((await contactsRes.json()).data || []).filter(c => c.type === "Person" && !c.deleted);

      // Build wrikeUserId → department map from group membership.
      // Match group title against our DEPARTMENTS list (case-insensitive substring).
      const deptMap = {};
      if (groupsRes.ok) {
        const groups = (await groupsRes.json()).data || [];
        for (const group of groups) {
          const title = group.title || "";
          const dept = DEPARTMENTS.find(d =>
            title.toLowerCase() === d.toLowerCase() ||
            title.toLowerCase().includes(d.toLowerCase()) ||
            d.toLowerCase().includes(title.toLowerCase())
          );
          if (dept) {
            for (const memberId of (group.memberIds || [])) deptMap[memberId] = dept;
          }
        }
      }

      let added = 0;
      for (const c of contacts) {
        const payload = {
          wrike_user_id: c.id,
          first_name: c.firstName || null,
          last_name: c.lastName || null,
          email: c.profiles?.[0]?.email || null,
          avatar_url: c.avatarUrl || null,
        };
        // Only overwrite department when Wrike groups give us a clear answer
        if (deptMap[c.id]) payload.department = deptMap[c.id];
        const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "wrike_user_id" });
        if (!error) added++;
      }
      const deptCount = Object.keys(deptMap).length;
      setSyncMsg(`Synced ${added} members · ${deptCount} department assignments from Wrike groups.`);
      await load();
    } catch (err) {
      setSyncMsg(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // Bucket people into department groups
  const buckets = useMemo(() => {
    const out = Object.fromEntries(DEPT_GROUPS.map(g => [g.label, []]));
    for (const p of people) {
      const key = p.department && DEPARTMENTS.includes(p.department) ? p.department : "—";
      out[key].push(p);
    }
    return out;
  }, [people]);

  const toggleGroup = (label) => setExpanded(prev => ({ ...prev, [label]: !prev[label] }));

  const PersonCard = ({ p }) => {
    const initials = `${p.first_name?.[0] || ""}${p.last_name?.[0] || ""}`.toUpperCase() || "?";
    const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown";
    return (
      <div className="flex items-center gap-3 bg-white border border-[#dce4ec] rounded-2xl p-3.5">
        {p.avatar_url ? (
          <img src={p.avatar_url} alt={fullName} className="w-10 h-10 rounded-xl object-cover shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#12a0e1] to-[#1cc1a5] text-white flex items-center justify-center font-black text-sm shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-[#122027] truncate">{fullName}</p>
          <p className="text-[11px] text-[#768994] truncate">{p.email || p.wrike_user_id}</p>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <select value={p.department || ""} onChange={e => updateField(p.wrike_user_id, { department: e.target.value || null })}
            className="text-[11px] font-bold text-[#122027] border border-[#dce4ec] rounded-lg px-2 py-1 outline-none focus:border-[#12a0e1] bg-white max-w-[110px]">
            <option value="">No dept.</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={p.position_id || ""} onChange={e => updateField(p.wrike_user_id, { position_id: e.target.value ? Number(e.target.value) : null })}
            className="text-[11px] text-[#768994] border border-[#dce4ec] rounded-lg px-2 py-1 outline-none focus:border-[#12a0e1] bg-white max-w-[110px]">
            <option value="">No position</option>
            {positions.map(pos => <option key={pos.id} value={pos.id}>{pos.title}</option>)}
          </select>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-1">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {!loading && (
            <span className="text-[10px] font-black text-[#768994]">
              {people.length} people
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {syncMsg && <span className="text-[11px] font-medium text-[#768994]">{syncMsg}</span>}
          <button onClick={syncFromWrike} disabled={syncing}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#dce4ec] hover:border-slate-300 text-[#122027] text-xs font-bold rounded-xl transition-all disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync from Wrike"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-[#768994]">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : people.length === 0 ? (
        <div className="py-16 text-center text-[#768994] text-sm">
          No people yet — click "Sync from Wrike" to pull everyone in the workspace.
        </div>
      ) : (
        <div className="space-y-6">
          {DEPT_GROUPS.map(group => {
            const items = buckets[group.label] || [];
            if (items.length === 0) return null;
            const isOpen = !!expanded[group.label];
            return (
              <div key={group.label}>
                <div role="button" tabIndex={0} onClick={() => toggleGroup(group.label)}
                  className={`flex items-center gap-2.5 mb-3 px-3 py-2 rounded-xl border cursor-pointer select-none ${group.color}`}>
                  <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  <span className="text-[11px] font-black uppercase tracking-widest">{group.label}</span>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-black/10">{items.length}</span>
                </div>
                {isOpen && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                    {items.map(p => <PersonCard key={p.wrike_user_id} p={p} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Management Page ───────────────────────────────────────────────────────
export default function Management({ wrikeUserId }) {
  const [activeTab, setActiveTab] = useState("overview");

  if (MANAGEMENT_IDS.length > 0 && !MANAGEMENT_IDS.includes(wrikeUserId)) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="bg-white border border-[#dce4ec] rounded-3xl p-10 text-center max-w-sm shadow-xl">
          <div className="w-14 h-14 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-rose-500" />
          </div>
          <h2 className="text-xl font-black text-[#122027] mb-2">Access Restricted</h2>
          <p className="text-sm text-[#768994]">This page is for management only.</p>
          {wrikeUserId && (
            <p className="text-[10px] font-mono mt-3 text-slate-400 bg-slate-50 rounded-lg p-2">
              Your ID: {wrikeUserId}
            </p>
          )}
        </div>
      </div>
    );
  }

  const activeTabMeta = TABS.find(t => t.id === activeTab);

  return (
    <div className="min-h-screen bg-slate-100 text-[#122027] font-sans pb-16">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 pt-8 space-y-6">
        {/* Header */}
        <div className="bg-white border border-[#dce4ec] rounded-[2rem] overflow-hidden shadow-sm">
          <div className="h-1.5 bg-gradient-to-r from-[#122027] to-[#12a0e1]" />
          <div className="p-6 flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#122027] to-[#12a0e1] flex items-center justify-center shadow-lg">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#12a0e1]">Management</p>
              <h1 className="text-3xl font-black tracking-tight text-[#122027]">Job Management</h1>
              <p className="text-xs text-[#768994] mt-0.5">Job Book · Reference Data · Market Codes</p>
            </div>
            {MANAGEMENT_IDS.length === 0 && (
              <div className="ml-auto flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <p className="text-[10px] font-bold text-amber-700">
                  Add your Wrike ID to <code className="font-mono">MANAGEMENT_IDS</code> in Management.jsx
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center">
          {TAB_GROUPS.map((group, gi) => {
            const groupTabs = group.ids.map(id => TABS.find(t => t.id === id)).filter(Boolean);
            const isReference = group.label === "Reference";
            return (
              <React.Fragment key={gi}>
                {gi > 0 && (
                  <div className="flex items-center mx-5">
                    <div className="w-px h-4 bg-[#dce4ec]" />
                  </div>
                )}
                <div className={`flex items-center gap-1 ${isReference ? "ml-auto" : ""}`}>
                  {groupTabs.map(tab => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                      <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                          active
                            ? "bg-white border border-[#dce4ec] text-[#122027] shadow-sm"
                            : "text-[#768994] hover:text-[#122027] hover:bg-white/50"
                        }`}>
                        <Icon className={`w-3.5 h-3.5 ${active ? "text-[#12a0e1]" : ""}`} />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Content */}
        <div className="bg-white border border-[#dce4ec] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-[#dce4ec]">
            {activeTabMeta && <activeTabMeta.icon className="w-4 h-4 text-[#12a0e1]" />}
            <h2 className="text-sm font-black uppercase tracking-widest text-[#122027]">{activeTabMeta?.label}</h2>
          </div>

          {activeTab === "overview"   && <OverviewSection setActiveTab={setActiveTab} />}
          {activeTab === "jobsSetup"  && <JobsSetupSection setActiveTab={setActiveTab} />}
          {activeTab === "jobs"       && <JobBookSection setActiveTab={setActiveTab} />}
          {activeTab === "feed"       && <JobsFeedSection />}
          {activeTab === "people"     && <PeopleSection />}
          {activeTab === "films"      && <SimpleListSection table="films" labelField="title" label="Films" placeholder="Film title…" />}
          {activeTab === "clients"    && <SimpleListSection table="clients" labelField="name" label="Clients" quickFilters={STUDIO_GROUPS} quickFilterLabel="Filter by studio" />}
          {activeTab === "categories" && <SimpleListSection table="job_categories" labelField="name" label="Item Categories" groups={CATEGORY_GROUPS} />}
          {activeTab === "descs"      && <SimpleListSection table="project_descriptions" labelField="description" label="Project Descriptions" isLong quickFilters={DESC_QUICK_FILTERS} quickFilterLabel="Filter by territory" groups={DESCRIPTION_GROUPS} />}
          {activeTab === "positions"  && <SimpleListSection table="positions" labelField="title" label="Positions" placeholder="e.g. Creative Director…" />}
        </div>
      </div>
    </div>
  );
}