import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Briefcase, Film, Users, Tag, AlignLeft, Building2,
  Plus, Pencil, Trash2, X, Check, Search,
  RefreshCw, Shield, AlertTriangle, ChevronLeft, ChevronRight,
  ArrowUpAZ, ArrowDownAZ, LayoutDashboard, TrendingUp, CheckCircle2, UserCog, Activity,
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
  { ids: ["jobs", "feed"],      label: "Jobs"      },
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

// ── Job Form Modal ─────────────────────────────────────────────────────────────
function JobModal({ job, clients, films, categories, descs, onSave, onClose, saving }) {
  const isEdit = !!job?.id;
  const [orderedByOpts, setOrderedByOpts] = useState([]);
  const [billedToOpts, setBilledToOpts]   = useState([]);

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

  const [form, setForm] = useState({
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
    notes: job?.notes || "",
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    // onMouseDown instead of onClick: fires before blur, so the close is instant
    // and never races with a combobox dropdown's state updates.
    <div className="fixed inset-0 z-[9999] bg-[#122027]/60 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-[#dce4ec]"
        onMouseDown={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[#dce4ec] flex items-center justify-between shrink-0">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#12a0e1] mb-0.5">Job Book</p>
            <h2 className="text-xl font-black text-[#122027]">
              {isEdit ? `Edit ${job.job_number}` : "New Job"}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

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
            options={films} placeholder="Search films…" />

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

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#dce4ec] flex justify-end gap-2 shrink-0">
          <button onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-[#768994] hover:text-[#122027] bg-white border border-[#dce4ec] rounded-2xl transition-all">
            Cancel
          </button>
          <button onClick={() => onSave(form)} disabled={saving || !form.client || !form.start_date}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#12a0e1] hover:bg-[#0d8bc4] text-white text-sm font-bold rounded-2xl transition-all disabled:opacity-50 shadow-sm">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {isEdit ? "Save Changes" : "Create Job"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Job Book Section ───────────────────────────────────────────────────────────
function JobBookSection() {
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
        <button onClick={() => { setEditJob(null); setShowModal(true); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#12a0e1] hover:bg-[#0d8bc4] text-white text-sm font-bold rounded-xl transition-all shrink-0">
          <Plus className="w-4 h-4" /> New Job
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
                {["Job #","Date","Client","Office","P/D","Film Title","Project Description","Costs","Ordered By","Billed To","Done",""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-[#768994] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-12 text-[#768994] italic">No jobs found</td></tr>
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
      : allTasks;

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
          {activeTab === "jobs"       && <JobBookSection />}
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