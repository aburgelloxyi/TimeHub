import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Clock, LayoutList, Layout, Server, Moon, Copy, Zap,
  Command, Search, Database, FileDown, Trash2, RefreshCw,
} from "lucide-react";
import "./Timesheeter.css";
import PillNav from "./components/NavPill";
import ThemeToggle from "./components/shared/ThemeToggle";
import Tracker from "./components/tracker/Tracker";
import TodaysList from "./components/TodaysList";
import CampaignCanvas from "./components/Canvas";
import WrikeTest from "./components/WrikeTest";
import LegacyTimesheet from "./components/LegacyTimesheets";

export default function App() {
  const [activePage, setActivePage] = useState("timesheet");
  const [globalWrikeData, setGlobalWrikeData] = useState([]);
  const [folderDictionary, setFolderDictionary] = useState({});

  // Only MATRIX tasks go to the Canvas
  const filteredData = useMemo(() => {
    if (!globalWrikeData || !folderDictionary) return [];

    return globalWrikeData.filter((task) =>
      task.title?.toUpperCase().includes("MATRIX")
    );
  }, [globalWrikeData, folderDictionary]);

  // --- Global command palette ---
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [paletteStatus, setPaletteStatus] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef(null);

  const closePalette = () => {
    setIsPaletteOpen(false);
    setPaletteSearch("");
    setPaletteStatus(null);
    setSelectedIndex(0);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
        if (!isPaletteOpen) setSelectedIndex(0);
      }
      if (e.key === "Escape") closePalette();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPaletteOpen]);

  // type → icon bg/text colour
  const TYPE_STYLES = {
    Navigation: "bg-indigo-50 text-indigo-600 border-indigo-100",
    Data:       "bg-emerald-50 text-emerald-600 border-emerald-100",
    System:     "bg-purple-50 text-purple-600 border-purple-100",
    Timer:      "bg-amber-50 text-amber-600 border-amber-100",
  };

  const PALETTE_ACTIONS = [
    { id: "nav-timesheet", title: "Timesheeter",        desc: "Open the time tracker",          type: "Navigation", icon: Clock,      hint: "1" },
    { id: "nav-todayslist",title: "Motion Board",       desc: "Team task allocation board",     type: "Navigation", icon: LayoutList, hint: "2" },
    { id: "nav-canvas",    title: "Campaign Canvas",    desc: "MATRIX task visualiser",         type: "Navigation", icon: Layout,     hint: "3" },
    { id: "nav-wriketest", title: "Wrike API",          desc: "Fetch and explore Wrike data",   type: "Navigation", icon: Server,     hint: "4" },
    { id: "nav-legacy",    title: "Legacy Sandbox",     desc: "Old timesheet database view",    type: "Navigation", icon: Database,   hint: "5" },
    { id: "action-copy-ts",title: "Copy JSON",          desc: "Copy timesheet to clipboard",    type: "Data",       icon: Copy },
    { id: "action-csv",    title: "Download CSV",       desc: "Export all tasks as a CSV file", type: "Data",       icon: FileDown },
    { id: "action-sync",   title: "Sync Wrike Statuses",desc: "Go to Motion Board → Sync",      type: "Data",       icon: Zap },
    { id: "action-fetch",  title: "Fetch Wrike Data",   desc: "Go to Wrike API and fetch",      type: "Data",       icon: RefreshCw },
    { id: "action-dark",   title: "Toggle Dark Mode",   desc: "Switch between light and dark",  type: "System",     icon: Moon },
    { id: "action-clear",  title: "Clear Week's Data",  desc: "Delete all logged tasks — careful!", type: "System", icon: Trash2 },
  ];

  const paletteResults = useMemo(() => {
    const query = paletteSearch.toLowerCase();
    if (!query) return PALETTE_ACTIONS;
    return PALETTE_ACTIONS.filter(
      (a) =>
        a.title.toLowerCase().includes(query) ||
        a.desc.toLowerCase().includes(query) ||
        a.type.toLowerCase().includes(query)
    );
  }, [paletteSearch]);

  const handlePaletteKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, paletteResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && paletteResults[selectedIndex]) {
      handleExecuteAction(paletteResults[selectedIndex]);
    }
  };

  // Reset selection when search changes
  useEffect(() => { setSelectedIndex(0); }, [paletteSearch]);

  const flashStatus = (msg) => {
    setPaletteStatus(msg);
    setTimeout(closePalette, 900);
  };

  const handleExecuteAction = (action) => {
    if (action.id.startsWith("nav-")) {
      setActivePage(action.id.replace("nav-", ""));
      closePalette();
    } else if (action.id === "action-dark") {
      document.documentElement.classList.toggle("dark-theme");
      closePalette();
    } else if (action.id === "action-copy-ts") {
      const data = localStorage.getItem("xyi_timesheet_tasks_v5");
      if (data) {
        navigator.clipboard.writeText(JSON.stringify({ version: 5, exportDate: new Date().toISOString(), rawTasks: JSON.parse(data) }));
        flashStatus("✓ JSON copied to clipboard");
      } else {
        flashStatus("No timesheet data found");
      }
    } else if (action.id === "action-csv") {
      const data = localStorage.getItem("xyi_timesheet_tasks_v5");
      if (!data) { flashStatus("No timesheet data found"); return; }
      const tasks = JSON.parse(data);
      const fmtSecs = (s) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h}h ${m}m`; };
      const headers = ["Day","Date","Job","Territory","Category","Time","Notes"];
      const rows = tasks.map((t) => [t.dayOfWeek??'',t.date??'',t.jobNumber??'',t.territory??'',t.category??'',fmtSecs((t.rawSeconds??0)+(t.additionalSeconds??0)),(t.notes??'').replace(/"/g,'""')]);
      const csv = [headers,...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a"); a.href = url; a.download = `Timesheet_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      flashStatus("✓ CSV downloaded");
    } else if (action.id === "action-sync") {
      setActivePage("todayslist");
      closePalette();
    } else if (action.id === "action-fetch") {
      setActivePage("wriketest");
      closePalette();
    } else if (action.id === "action-clear") {
      if (window.confirm("Delete all logged tasks for the week? This cannot be undone.")) {
        localStorage.removeItem("xyi_timesheet_tasks_v5");
        window.location.reload();
      } else {
        closePalette();
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 transition-colors duration-300">
      <PillNav activePage={activePage} setActivePage={setActivePage} />

      {/* Command palette */}
      {isPaletteOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] p-4 bg-[#122027]/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={closePalette}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-xl shadow-2xl flex flex-col border border-[#dce4ec] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search bar */}
            <div className="p-4 border-b border-[#dce4ec] flex items-center gap-3 bg-slate-50/50">
              <Command className="w-5 h-5 text-[#12a0e1] shrink-0" />
              <input
                ref={searchRef}
                autoFocus
                type="text"
                value={paletteSearch}
                onChange={(e) => setPaletteSearch(e.target.value)}
                onKeyDown={handlePaletteKeyDown}
                placeholder="Search commands…"
                className="flex-1 bg-transparent text-base font-medium text-[#122027] outline-none placeholder:text-[#768994]"
              />
              <kbd className="text-[10px] font-black text-[#768994] bg-white px-2 py-1 rounded-md border border-[#dce4ec] shadow-sm">ESC</kbd>
            </div>

            {/* Status flash */}
            {paletteStatus ? (
              <div className="p-6 text-center text-sm font-bold text-[#1cc1a5]">{paletteStatus}</div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto p-2">
                {paletteResults.length === 0 ? (
                  <div className="p-10 text-center text-[#768994] flex flex-col items-center gap-2">
                    <Search className="w-7 h-7 opacity-30" />
                    <p className="text-sm font-medium">No results for "{paletteSearch}"</p>
                  </div>
                ) : (
                  paletteResults.map((result, i) => {
                    const Icon = result.icon;
                    const iconStyle = TYPE_STYLES[result.type] ?? "bg-slate-50 text-slate-500 border-slate-100";
                    const isSelected = i === selectedIndex;
                    return (
                      <button
                        key={result.id}
                        onClick={() => handleExecuteAction(result)}
                        onMouseEnter={() => setSelectedIndex(i)}
                        className={`w-full text-left px-3 py-3 rounded-xl flex items-center gap-3 transition-colors ${
                          isSelected ? "bg-slate-100" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${iconStyle}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-[#122027] tracking-tight">{result.title}</p>
                          <p className="text-[11px] text-[#768994] font-medium truncate">{result.desc}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {result.hint && (
                            <kbd className="text-[10px] font-black text-[#768994] bg-white px-1.5 py-0.5 rounded border border-[#dce4ec]">{result.hint}</kbd>
                          )}
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${iconStyle}`}>
                            {result.type}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {/* Footer hints */}
            {!paletteStatus && (
              <div className="px-4 py-2.5 border-t border-[#dce4ec] bg-slate-50/50 flex items-center gap-4 text-[10px] font-bold text-[#768994]">
                <span><kbd className="bg-white border border-[#dce4ec] px-1.5 py-0.5 rounded text-[9px]">↑↓</kbd> Navigate</span>
                <span><kbd className="bg-white border border-[#dce4ec] px-1.5 py-0.5 rounded text-[9px]">↵</kbd> Execute</span>
                <span><kbd className="bg-white border border-[#dce4ec] px-1.5 py-0.5 rounded text-[9px]">ESC</kbd> Close</span>
                <span className="ml-auto opacity-50">Space = timer toggle</span>
              </div>
            )}
          </div>
        </div>
      )}

      <ThemeToggle />

      {activePage === "timesheet" && <Tracker wrikeData={globalWrikeData} />}
      <div className={activePage === "todayslist" ? "block" : "hidden"}>
        <TodaysList wrikeData={globalWrikeData} />
      </div>
      {activePage === "canvas" && <CampaignCanvas wrikeData={filteredData} />}
      {activePage === "wriketest" && (
        <WrikeTest wrikeData={globalWrikeData} setWrikeData={setGlobalWrikeData} setFolderDictionary={setFolderDictionary} />
      )}
      {activePage === "legacy" && <LegacyTimesheet wrikeData={globalWrikeData} />}
    </div>
  );
}
