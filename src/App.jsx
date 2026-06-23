import React, { useState, useEffect, useMemo } from "react";
import {
  Clock, LayoutList, Layout, Sparkles, Server, Moon, Copy, Zap,
  Command, Search,
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

    const ddaTask = globalWrikeData.find((t) => t.title?.toUpperCase().includes("DDA_ASSET_MATRIX"));
    if (ddaTask) {
      console.log("✅ DDA Matrix IS in the data!", ddaTask);
    } else {
      console.log("❌ DDA Matrix is completely MISSING from the raw API fetch.");
    }

    return globalWrikeData.filter((task) =>
      task.title?.toUpperCase().includes("MATRIX")
    );
  }, [globalWrikeData, folderDictionary]);

  // --- Global command palette ---
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState("");

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
      if (e.key === "Escape") setIsPaletteOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const PALETTE_ACTIONS = [
    { id: "nav-timesheet",  title: "Go to Timesheeter",          type: "Navigation", icon: Clock },
    { id: "nav-board",      title: "Go to Motion Board",         type: "Navigation", icon: LayoutList },
    { id: "nav-canvas",     title: "Go to Campaign Canvas",      type: "Navigation", icon: Layout },
    { id: "nav-xyigotchi",  title: "Go to XYi-Gotchi",           type: "Fun",        icon: Sparkles },
    { id: "nav-wriker",     title: "Go to Wriker API Settings",  type: "Navigation", icon: Server },
    { id: "action-dark",    title: "Toggle Dark Theme",          type: "System",     icon: Moon },
    { id: "action-copy-ts", title: "Copy Timesheet Data",        type: "Data",       icon: Copy },
    { id: "action-sync",    title: "Sync Wrike Statuses",        type: "Data",       icon: Zap },
  ];

  const paletteResults = useMemo(() => {
    const query = paletteSearch.toLowerCase();
    if (!query) return PALETTE_ACTIONS;
    return PALETTE_ACTIONS.filter(
      (a) => a.title.toLowerCase().includes(query) || a.type.toLowerCase().includes(query)
    );
  }, [paletteSearch]);

  const handleExecuteAction = (action) => {
    setIsPaletteOpen(false);
    setPaletteSearch("");

    if (action.id.startsWith("nav-")) {
      setActivePage(action.id.replace("nav-", ""));
    } else if (action.id === "action-dark") {
      document.documentElement.classList.toggle("dark-theme");
    } else if (action.id === "action-copy-ts") {
      const data = localStorage.getItem("xyi_timesheet_tasks_v5");
      if (data) {
        navigator.clipboard.writeText(JSON.stringify({ version: 5, exportDate: new Date().toISOString(), rawTasks: JSON.parse(data) }));
        alert("Timesheet JSON copied to clipboard!");
      } else {
        alert("No timesheet data found in memory.");
      }
    } else if (action.id === "action-sync") {
      setActivePage("todayslist");
      setTimeout(() => alert("Routing to Motion Board. Hit the 'Sync Statuses' button!"), 100);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 transition-colors duration-300">
      <PillNav activePage={activePage} setActivePage={setActivePage} />

      {/* Command palette */}
      {isPaletteOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] p-4 bg-[#122027]/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsPaletteOpen(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col border border-[#dce4ec] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[#dce4ec] flex items-center gap-3 bg-slate-50/50">
              <Command className="w-6 h-6 text-[#12a0e1]" />
              <input
                autoFocus
                type="text"
                value={paletteSearch}
                onChange={(e) => setPaletteSearch(e.target.value)}
                placeholder="Search global commands, navigation, actions..."
                className="flex-1 bg-transparent text-lg font-medium text-[#122027] outline-none placeholder:text-[#768994]"
              />
              <div className="text-[10px] font-black text-[#768994] bg-white px-2 py-1 rounded-md border border-[#dce4ec] shadow-sm">ESC</div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2">
              {paletteResults.length === 0 ? (
                <div className="p-10 text-center text-[#768994] flex flex-col items-center gap-2">
                  <Search className="w-8 h-8 opacity-30" />
                  <p className="text-sm font-medium">No actions found for "{paletteSearch}"</p>
                </div>
              ) : (
                paletteResults.map((result) => {
                  const ActionIcon = result.icon;
                  return (
                    <button
                      key={result.id}
                      onClick={() => handleExecuteAction(result)}
                      className="w-full text-left p-4 hover:bg-slate-50 rounded-2xl flex items-center justify-between group transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-[1rem] bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shadow-sm shrink-0">
                          <ActionIcon className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-base font-black text-[#122027] group-hover:text-[#12a0e1] tracking-tight transition-colors">{result.title}</h4>
                          <p className="text-[11px] font-bold text-[#768994] mt-0.5 uppercase tracking-widest">{result.type}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#768994] bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg group-hover:text-[#12a0e1] group-hover:border-[#12a0e1]/30 group-hover:bg-[#12a0e1]/5 transition-colors flex items-center gap-1.5 shadow-sm">
                        Execute <Layout className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  );
                })
              )}
            </div>
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
