import React, { useState, useEffect } from "react";
import { useLegacyRows } from "../hooks/useLegacyRows";
import { setWrikeUserId as stampWrikeUserId, fetchExistingTimelogIds } from "../lib/supabaseClient";
import {
  RefreshCw,
  XCircle,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  Lock,
  LayoutList,
  X,
  AlertCircle,
  Copy,
  Plus,
} from "lucide-react";
import {
  DEFAULT_JOBS,
  TERRITORIES,
  CATEGORIES,
  TERRITORY_FLAGS,
  REGION_ALIASES,
} from "../constants.js";

const COLUMNS = [
  "Job Number",
  "Client",
  "Film Title",
  "Project Description",
  "Country",
  "Category",
  "Client Amends",
  "More Info",
  "3D",
  "Time Spent",
  "Additional Time",
];

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const TIME_OPTIONS = [
  "none",
  ...Array.from({ length: 48 }, (_, i) => ((i + 1) * 0.5).toString()),
];

// --- HELPER: Dark Mode Dynamic Status Tags ---
const getDarkTagStyle = (tag) => {
  const baseStyle =
    "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border whitespace-nowrap inline-flex items-center justify-center shadow-sm";

  if (!tag)
    return `${baseStyle} bg-slate-800/50 text-slate-400 border-slate-700/50`;

  const lowerTag = String(tag).toLowerCase();

  if (lowerTag.includes("to amend"))
    return `${baseStyle} bg-rose-500/10 text-rose-400 border-rose-500/20`;
  if (lowerTag.includes("render review"))
    return `${baseStyle} bg-indigo-500/10 text-indigo-400 border-indigo-500/20`;
  if (lowerTag.includes("revised"))
    return `${baseStyle} bg-teal-500/10 text-teal-400 border-teal-500/20`;
  if (lowerTag.includes("creative approved"))
    return `${baseStyle} bg-blue-500/10 text-blue-400 border-blue-500/20`;
  if (lowerTag.includes("content approved"))
    return `${baseStyle} bg-purple-500/10 text-purple-400 border-purple-500/20`;
  if (lowerTag.includes("client review") || lowerTag.includes("content review"))
    return `${baseStyle} bg-yellow-500/10 text-yellow-400 border-yellow-500/20`;
  if (lowerTag.includes("motion"))
    return `${baseStyle} bg-emerald-500/10 text-emerald-400 border-emerald-500/20`;
  if (lowerTag.includes("digital"))
    return `${baseStyle} bg-cyan-500/10 text-cyan-400 border-cyan-500/20`;
  if (lowerTag.includes("prep for delivery"))
    return `${baseStyle} bg-orange-500/10 text-orange-400 border-orange-500/20`;
  if (lowerTag === "delivering" || lowerTag === "delivery")
    return `${baseStyle} bg-amber-500/10 text-amber-400 border-amber-500/20`;
  if (lowerTag.includes("on hold"))
    return `${baseStyle} bg-red-500/10 text-red-400 border-red-500/20`;
  if (lowerTag.includes("pm"))
    return `${baseStyle} bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20`;
  if (lowerTag.includes("completed") || lowerTag.includes("delivered"))
    return `${baseStyle} bg-emerald-500/10 text-emerald-400 border-emerald-500/20`;

  return `${baseStyle} bg-slate-800/50 text-slate-300 border-slate-700/80`;
};

// --- MODERN SEARCHABLE SELECT FOR TABLE ROWS ---
const TableSearchableSelect = ({
  options,
  value,
  onChange,
  placeholder,
  getPrefix,
  isGrouped = false,
  dropdownId,
  activeDropdown,
  setActiveDropdown,
  isCountry = false,
  isTime = false,
  isCategory = false,
  isJob = false,
  disabled = false,
  isDarkModal = false,
}) => {
  const isOpen = activeDropdown === dropdownId && !disabled;
  const [searchTerm, setSearchTerm] = useState(value || "");

  useEffect(() => {
    setSearchTerm(value || "");
  }, [value]);

  const filteredOptions = options.filter((opt) => {
    if (searchTerm === value) return true;
    return opt.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const groupedOptions = {};
  if (isGrouped) {
    filteredOptions.forEach((opt) => {
      let group = "Misc / General";
      if (opt.includes(" : ")) group = opt.split(" : ")[0];
      else if (opt.includes(" - ")) group = opt.split(" - ")[0];
      else if (opt.startsWith("XYi")) group = "XYi Internal";

      if (!groupedOptions[group]) groupedOptions[group] = [];
      groupedOptions[group].push(opt);
    });
  }

  const getDisplayLabel = (opt) => {
    if (isJob) return opt;
    if (isGrouped && opt.includes(" : "))
      return opt.split(" : ").slice(1).join(" : ");
    if (isGrouped && opt.includes(" - "))
      return opt.split(" - ").slice(1).join(" - ");
    return opt;
  };

  let containerClass = "min-w-[300px] w-full left-0";
  let gridClass = "grid-cols-1";

  if (isCountry) {
    containerClass = "w-[400px] lg:w-[800px] left-0";
    gridClass = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";
  } else if (isCategory) {
    containerClass = `w-[300px] sm:w-[500px] lg:w-[750px] ${
      isDarkModal ? "left-0" : "right-0"
    }`;
  } else if (isTime) {
    containerClass = "w-[160px] right-0";
    gridClass = "grid-cols-2";
  }

  return (
    <div className={`relative w-full ${isOpen ? "z-[999999]" : "z-50"}`}>
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onMouseDown={(e) => {
            e.stopPropagation();
            setActiveDropdown(null);
            onChange(searchTerm);
          }}
        />
      )}

      <div
        className={`relative flex items-center border rounded-xl z-50 transition-all ${
          disabled
            ? "opacity-45 cursor-not-allowed bg-transparent border-transparent"
            : isOpen
            ? `border-[#12a0e1] ring-4 ring-[#12a0e1]/10 ${
                isDarkModal ? "bg-[#1e2530]" : "bg-white"
              }`
            : `border-transparent ${
                isDarkModal
                  ? "hover:border-[#384252] hover:bg-[#1e2530]"
                  : "hover:border-slate-300 hover:bg-white/50 bg-transparent"
              }`
        }`}
      >
        {getPrefix && getPrefix(searchTerm) && (
          <span
            className={`pl-2.5 text-sm leading-none ${
              disabled ? "opacity-50" : ""
            }`}
          >
            {getPrefix(searchTerm)}
          </span>
        )}
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            if (disabled) return;
            setSearchTerm(e.target.value);
            if (!isOpen) setActiveDropdown(dropdownId);
          }}
          onFocus={() => {
            if (!disabled) setActiveDropdown(dropdownId);
          }}
          disabled={disabled}
          placeholder={placeholder}
          title={searchTerm}
          className={`w-full py-2 px-2.5 bg-transparent text-[12px] font-semibold outline-none truncate ${
            isDarkModal
              ? "text-slate-100 placeholder:text-slate-600"
              : "text-slate-800 placeholder:text-slate-400"
          } ${isCountry && !isDarkModal ? "text-[#3b5998]" : ""} ${
            isTime ? "text-center" : ""
          } ${disabled ? "cursor-not-allowed" : ""}`}
        />
        <ChevronDown
          className={`w-3.5 h-3.5 mr-2 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          } ${
            disabled
              ? "text-slate-300"
              : isDarkModal
              ? "text-slate-500 hover:text-slate-400 cursor-pointer"
              : "text-slate-400 cursor-pointer"
          }`}
          onClick={() =>
            !disabled && setActiveDropdown(isOpen ? null : dropdownId)
          }
        />
      </div>

      {isOpen && (
        <div
          className={`absolute top-full mt-1.5 border shadow-2xl z-[999999] max-h-[350px] overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-200 rounded-2xl ${containerClass} ${
            isDarkModal
              ? "bg-[#19202b] border-[#2d3748]"
              : "bg-white border-slate-200"
          }`}
        >
          {filteredOptions.length > 0 ? (
            isGrouped ? (
              Object.entries(groupedOptions)
                .sort(([groupA], [groupB]) => {
                  const aIsMatch = value && value.includes(groupA);
                  const bIsMatch = value && value.includes(groupB);
                  if (aIsMatch && !bIsMatch) return -1;
                  if (!aIsMatch && bIsMatch) return 1;
                  return 0;
                })
                .map(([groupName, items]) => (
                  <div
                    key={groupName}
                    className={`border-b last:border-0 ${
                      isDarkModal ? "border-[#263143]" : "border-slate-100"
                    }`}
                  >
                    <div
                      className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest sticky top-0 z-10 flex items-center justify-between ${
                        isDarkModal
                          ? "bg-[#202938] text-[#4ea8de]"
                          : "bg-slate-50 text-[#12a0e1]"
                      }`}
                    >
                      <span>{groupName}</span>
                      {value && value.includes(groupName) && (
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[9px] font-black tracking-normal ${
                            isDarkModal
                              ? "bg-[#4ea8de]/20 text-[#4ea8de]"
                              : "bg-[#12a0e1]/10 text-[#12a0e1]"
                          }`}
                        >
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div
                      className={`grid gap-x-4 gap-y-1 p-2.5 ${
                        isCategory
                          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                          : "grid-cols-1"
                      }`}
                    >
                      {items.map((opt, i) => (
                        <button
                          type="button"
                          key={i}
                          onClick={() => {
                            setSearchTerm(opt);
                            onChange(opt);
                            setActiveDropdown(null);
                          }}
                          className={`w-full text-left px-3 py-2 text-[11px] font-semibold transition-all rounded-xl flex items-start leading-tight ${
                            value === opt
                              ? isDarkModal
                                ? "bg-[#12a0e1]/20 text-white font-bold"
                                : "bg-[#12a0e1]/10 text-[#12a0e1]"
                              : isDarkModal
                              ? "text-slate-300 hover:bg-[#253042] hover:text-white"
                              : "text-slate-700 hover:bg-[#12a0e1]/10 hover:text-[#12a0e1]"
                          }`}
                          title={opt}
                        >
                          <span
                            className={
                              isJob
                                ? "whitespace-normal break-words"
                                : "truncate"
                            }
                          >
                            {getDisplayLabel(opt)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
            ) : (
              <div className={`grid gap-1 p-2 ${gridClass}`}>
                {[...filteredOptions]
                  .sort((a, b) => {
                    if (a === value) return -1;
                    if (b === value) return 1;
                    return 0;
                  })
                  .map((opt, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => {
                        setSearchTerm(opt);
                        onChange(opt);
                        setActiveDropdown(null);
                      }}
                      className={`w-full text-left py-2 text-[11px] font-semibold transition-all rounded-xl flex items-center ${
                        isTime
                          ? "justify-center font-mono font-bold px-1"
                          : "px-3 truncate"
                      } ${
                        value === opt
                          ? isDarkModal
                            ? "bg-[#12a0e1]/20 text-white font-bold"
                            : "bg-[#12a0e1]/10 text-[#12a0e1]"
                          : isDarkModal
                          ? "text-slate-300 hover:bg-[#253042] hover:text-white"
                          : "text-slate-700 hover:bg-[#12a0e1]/10 hover:text-[#12a0e1]"
                      }`}
                      title={opt}
                    >
                      {getPrefix && getPrefix(opt) && (
                        <span className="mr-2 text-base leading-none shrink-0">
                          {getPrefix(opt)}
                        </span>
                      )}
                      <span className={isTime ? "" : "truncate"}>{opt}</span>
                    </button>
                  ))}
              </div>
            )
          ) : (
            <div
              className={`px-4 py-3 text-xs italic ${
                isDarkModal ? "text-slate-500" : "text-slate-400"
              }`}
            >
              No matches found. Press enter to keep custom text.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function LegacyTimesheet({ wrikeData }) {
  const [activeDay, setActiveDay] = useState(() => {
    return localStorage.getItem("xyi_legacy_activeDay") || "Monday";
  });

  // useLegacyRows is initialised after showToast below

  const [frozenDays, setFrozenDays] = useState(() => {
    const saved = localStorage.getItem("xyi_legacy_frozenDays");
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem("xyi_legacy_activeDay", activeDay);
  }, [activeDay]);

  // rows are now synced to Supabase via useLegacyRows

  useEffect(() => {
    localStorage.setItem("xyi_legacy_frozenDays", JSON.stringify(frozenDays));
  }, [frozenDays]);

  const [isPulling, setIsPulling] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);

  const [wrikeFullName, setWrikeFullName] = useState("");
  const [wrikeUserId, setWrikeUserId] = useState("");

  const [localWrikeTasks, setLocalWrikeTasks] = useState([]);
  const [isSyncingJobs, setIsSyncingJobs] = useState(false);
  const activeWrikeData =
    localWrikeTasks.length > 0 ? localWrikeTasks : wrikeData;

  const [activeDropdown, setActiveDropdown] = useState(null);

  // --- Toast ---
  const [toast, setToast] = useState({ show: false, message: "", type: "error" });
  const showToast = (message, type = "error") => setToast({ show: true, message, type });

  // Initialised here so showToast is available to pass in
  const { rows, setRows, loading: rowsLoading, addRow, addRows, updateRow, deleteRow } = useLegacyRows(showToast, wrikeUserId);
  useEffect(() => {
    if (!toast.show) return;
    const t = setTimeout(() => setToast({ show: false, message: "", type: "error" }), 4000);
    return () => clearTimeout(t);
  }, [toast.show]);

  // Today's real calendar day name (for modal column locking)
  const todayDayName = React.useMemo(() => {
    const d = new Date().getDay();
    return DAYS[d === 0 ? 6 : d - 1];
  }, []);

  // --- Dynamic week date range ---
  const weekDateRange = React.useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    return `${fmt(monday)} – ${fmt(sunday)}`;
  }, []);

  // --- Per-day hour totals ---
  const getDayTotal = (day) =>
    rows
      .filter((r) => r.dayOfWeek === day)
      .reduce((sum, r) => {
        const t = r.timeSpent === "none" || !r.timeSpent ? 0 : parseFloat(r.timeSpent);
        const a = r.additionalTime === "none" || !r.additionalTime ? 0 : parseFloat(r.additionalTime);
        return sum + t + a;
      }, 0);

  // --- Add blank row ---
  const handleAddRow = () => {
    if (frozenDays[activeDay]) return;
    addRow({
      id: Date.now() + Math.floor(Math.random() * 1000),
      taskId: null,
      dayOfWeek: activeDay,
      jobNumber: "",
      client: "",
      filmTitle: "",
      projectDescription: "",
      country: "",
      category: "",
      clientAmends: false,
      moreInfo: "",
      is3D: false,
      timeSpent: "none",
      additionalTime: "none",
      isSaved: false,
    });
  };

  const [isWrikeModalOpen, setIsWrikeModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState("timesheet");
  const [wrikeTimesheetData, setWrikeTimesheetData] = useState({});
  const [wrikeWeeklyLogs, setWrikeWeeklyLogs] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [isFetchingModalData, setIsFetchingModalData] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("wrike_personal_token");
    if (token && !wrikeFullName) {
      fetch("https://www.wrike.com/api/v4/contacts?me=true", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((json) => {
          if (json.data && json.data.length > 0) {
            const user = json.data[0];
            setWrikeFullName(
              `${user.firstName || ""} ${user.lastName || ""}`.trim()
            );
            setWrikeUserId(user.id);
            stampWrikeUserId(user.id);
          }
        })
        .catch(() => console.error("Failed to fetch user name"));
    }
  }, [wrikeFullName]);

  useEffect(() => {
    if (wrikeUserId && localWrikeTasks.length === 0) {
      handleSyncMyJobs(true);
    }
  }, [wrikeUserId]);

  const handleSyncMyJobs = async (silent = false) => {
    const token = localStorage.getItem("wrike_personal_token");
    if (!token || !wrikeUserId) {
      if (!silent)
        showToast("Missing Wrike token or User ID. Please check your connection.");
      return null;
    }

    setIsSyncingJobs(true);
    try {
      const wfRes = await fetch("https://www.wrike.com/api/v4/workflows", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const wfJson = await wfRes.json();
      const statusDict = {};
      if (wfJson.data) {
        wfJson.data.forEach((wf) => {
          if (wf.customStatuses) {
            wf.customStatuses.forEach((st) => {
              statusDict[st.id] = st.name;
            });
          }
        });
      }

      const fieldsFilter = encodeURIComponent(
        "[customFields,parentIds,description]"
      );
      const responsiblesFilter = encodeURIComponent(`["${wrikeUserId}"]`);

      let rawTasks = [];
      let nextPageToken = null;
      let hasMore = true;

      // QUERY 1: Fetch ALL Active Tasks
      const activeStatusFilter = encodeURIComponent('["Active"]');
      while (hasMore) {
        let url = `https://www.wrike.com/api/v4/tasks?responsibles=${responsiblesFilter}&status=${activeStatusFilter}&fields=${fieldsFilter}&pageSize=1000`;
        if (nextPageToken) url += `&nextPageToken=${nextPageToken}`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Wrike API Error: ${res.status}`);

        const json = await res.json();
        rawTasks = [...rawTasks, ...(json.data || [])];
        nextPageToken = json.nextPageToken;
        hasMore = !!nextPageToken;
      }

      // QUERY 2: Fetch Recently Completed Tasks
      const completedStatusFilter = encodeURIComponent('["Completed"]');
      const lookback = new Date();
      lookback.setDate(lookback.getDate() - 7);
      const formattedDate = lookback.toISOString().split(".")[0] + "Z";
      const dateFilter = encodeURIComponent(`{"start":"${formattedDate}"}`);

      nextPageToken = null;
      hasMore = true;
      while (hasMore) {
        let url = `https://www.wrike.com/api/v4/tasks?responsibles=${responsiblesFilter}&status=${completedStatusFilter}&fields=${fieldsFilter}&updatedDate=${dateFilter}&pageSize=1000`;
        if (nextPageToken) url += `&nextPageToken=${nextPageToken}`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Wrike API Error: ${res.status}`);

        const json = await res.json();
        const existingIds = new Set(rawTasks.map((t) => t.id));
        const newCompleted = (json.data || []).filter(
          (t) => !existingIds.has(t.id)
        );

        rawTasks = [...rawTasks, ...newCompleted];
        nextPageToken = json.nextPageToken;
        hasMore = !!nextPageToken;
      }

      const enrichedTasks = rawTasks.map((task) => {
        const parsed = parseWrikeDescription(task.description);
        let projectName = task.title.split(/[_|-]/)[0].trim();
        if (parsed.extractedPathData) {
          const parts = parsed.extractedPathData.split("/");
          const digIdx = parts.findIndex((p) => p === "DIGITAL");
          if (digIdx > 0 && parts[digIdx - 1]) {
            projectName = decodeURIComponent(parts[digIdx - 1])
              .replace(/[_|-]/g, " ")
              .trim();
          }
        }
        return {
          ...task,
          extractedPathData: parsed.extractedPathData,
          notesText: parsed.notesText,
          projectName,
          customStatusName: task.customStatusId
            ? statusDict[task.customStatusId] || task.status
            : task.status,
          assignees: wrikeFullName.split(" ")[0],
          dueDate: task.dates && task.dates.due ? task.dates.due : null,
          createdDate: task.createdDate,
        };
      });

      setLocalWrikeTasks(enrichedTasks);
      return enrichedTasks;
    } catch (err) {
      console.error(err);
      if (!silent)
        showToast("Failed to sync your personal jobs. See console for details.");
      return null;
    } finally {
      setIsSyncingJobs(false);
    }
  };

  const guessFieldsFromTask = (linkedTask) => {
    if (!linkedTask)
      return { jobNumber: "", territory: "", category: "", notes: "" };

    const searchTarget = `${linkedTask.title || ""} ${
      linkedTask.projectName || ""
    } ${linkedTask.extractedPathData || ""} ${
      linkedTask.notesText || ""
    }`.toUpperCase();

    let guessedTerritory = "";
    let earliestIndex = Infinity;
    const boundary = `(?:^|[^a-zA-Z])`;

    // 1. Check direct matches with constants
    const sortedTerritories = [...TERRITORIES].sort(
      (a, b) => b.length - a.length
    );
    for (const terr of sortedTerritories) {
      const escapedTerr = terr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`${boundary}${escapedTerr}${boundary}`, "i");
      const match = searchTarget.match(regex);
      if (match && match.index < earliestIndex) {
        earliestIndex = match.index;
        guessedTerritory = terr;
      }
    }

    // 2. Check aliases from constants file
    for (const [abbr, targetTerritory] of Object.entries(REGION_ALIASES)) {
      const regex = new RegExp(`${boundary}${abbr}${boundary}`, "i");
      const match = searchTarget.match(regex);
      if (match && match.index < earliestIndex) {
        earliestIndex = match.index;
        guessedTerritory = targetTerritory;
      }
    }

    let guessedJob = "";
    let rawPrefix = "";

    if (linkedTask.customFields && linkedTask.customFields.length > 0) {
      const jobField = linkedTask.customFields.find(
        (cf) =>
          cf.value &&
          typeof cf.value === "string" &&
          cf.value.match(/(XY\d{5,6})/i)
      );
      if (jobField) {
        const cfMatch = jobField.value.match(/(XY\d{5,6})/i);
        rawPrefix = cfMatch[1].toUpperCase();
        const matchingOption = DEFAULT_JOBS.find((job) =>
          job.toUpperCase().includes(rawPrefix)
        );
        guessedJob = matchingOption ? matchingOption : rawPrefix;
      }
    }

    if (!rawPrefix) {
      const xyMatch = searchTarget.match(/(XY\d{5,6})/i);
      if (xyMatch) {
        rawPrefix = xyMatch[1].toUpperCase();
        const matchingOption = DEFAULT_JOBS.find((job) =>
          job.toUpperCase().includes(rawPrefix)
        );
        guessedJob = matchingOption ? matchingOption : rawPrefix;
      } else {
        const rawSplit = linkedTask.title?.split(/[_|-]/)[0]?.trim();
        for (const job of DEFAULT_JOBS) {
          const shortJob = job.split("-")[0].trim().toUpperCase();
          if (shortJob.length > 3 && searchTarget.includes(shortJob)) {
            guessedJob = job;
            rawPrefix = shortJob;
            break;
          }
        }
        if (!rawPrefix) rawPrefix = rawSplit || "";
      }
    }

    let guessedCategory =
      linkedTask.customStatusName || linkedTask.status || "";
    if (!CATEGORIES.includes(guessedCategory)) {
      if (searchTarget.includes("PRINT"))
        guessedCategory = "Print - Production/Localisation";
      else if (
        searchTarget.includes("REVISION") ||
        searchTarget.includes("AMEND")
      )
        guessedCategory = "Digital - Client Revisions/Amends";
      else guessedCategory = "Digital - Production/Localisation";
    }

    let cleanDescription = linkedTask.title || "";
    if (guessedJob && guessedJob.includes(",")) {
      cleanDescription = guessedJob
        .substring(guessedJob.indexOf(",") + 1)
        .trim();
    } else if (rawPrefix) {
      const escapedPrefix = rawPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const prefixRegex = new RegExp(`^.*?${escapedPrefix}[,\\s:\\-]*`, "i");
      cleanDescription = cleanDescription.replace(prefixRegex, "").trim();
    }

    if (!cleanDescription) cleanDescription = linkedTask.title || "";

    return {
      jobNumber: guessedJob,
      territory: guessedTerritory,
      category: guessedCategory,
      notes: cleanDescription,
    };
  };

  const getTimesheetValue = (hours) => {
    if (!hours || hours === 0) return "none";
    let rounded = Math.round(hours * 2) / 2;
    if (rounded === 0 && hours > 0) rounded = 0.5;
    return rounded === 0 ? "none" : rounded.toString();
  };

  const getLogHoursForTaskAndDay = (taskId, targetDay) => {
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    let totalHours = 0;

    wrikeWeeklyLogs.forEach((log) => {
      if (log.taskId === taskId) {
        const logDay = dayNames[new Date(log.trackedDate).getDay()];
        if (logDay === targetDay) {
          totalHours += log.hours;
        }
      }
    });

    return totalHours > 0 ? totalHours.toFixed(1) : null;
  };

  const getTaskSortValues = (t) => {
    const due = t.dueDate ? new Date(t.dueDate).getTime() : Infinity;
    const created = t.createdDate ? new Date(t.createdDate).getTime() : 0;
    return { due, created };
  };

  const handleOpenWrikeModal = async () => {
    if (!wrikeFullName || !wrikeUserId) {
      showToast("Still loading your Wrike profile — please wait a moment.");
      return;
    }

    setIsWrikeModalOpen(true);
    setModalTab("timesheet");
    setIsFetchingModalData(true);

    try {
      const token = localStorage.getItem("wrike_personal_token");
      const now = new Date();

      const toLocalDateStr = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(d.getDate()).padStart(2, "0")}`;
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const todayStr = toLocalDateStr(now);
      const yesterdayStr = toLocalDateStr(yesterday);
      const tomorrowStr = toLocalDateStr(tomorrow);

      const fieldsFilter = encodeURIComponent(
        "[customFields,parentIds,description]"
      );

      // --- STEP 1: Fetch today's timelogs (source of truth for worked-on tasks) ---
      const timelogRes = await fetch(
        `https://www.wrike.com/api/v4/contacts/${wrikeUserId}/timelogs`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const timelogJson = await timelogRes.json();
      const logs = (timelogJson.data || []).filter((l) => {
        const d = l.trackedDate?.split("T")[0];
        return d === todayStr || d === yesterdayStr;
      });
      setWrikeWeeklyLogs(logs);

      const todayLoggedTaskIds = [
        ...new Set(
          logs
            .filter((l) => l.trackedDate?.split("T")[0] === todayStr)
            .map((l) => l.taskId)
        ),
      ];

      // --- STEP 2: Fetch today's timelog tasks directly, one by one ---
      // We fetch each task individually so a single failure never blocks the rest.
      // Strategy per task:
      //   A) Try with fields= (gives custom fields, description, parentIds)
      //   B) If that 400s (e.g. unassigned tasks on some Wrike plans), retry bare
      //      — we still get title/status/dates, which is enough to show the row.
      let timelogTasks = [];
      for (const taskId of todayLoggedTaskIds) {
        try {
          // Attempt A: full fields
          let res = await fetch(
            `https://www.wrike.com/api/v4/tasks/${taskId}?fields=${fieldsFilter}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          // Attempt B: bare fetch if fields caused a 400
          if (!res.ok) {
            res = await fetch(`https://www.wrike.com/api/v4/tasks/${taskId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
          }

          if (res.ok) {
            const json = await res.json();
            if (json.data)
              timelogTasks = [
                ...timelogTasks,
                ...json.data.map(enrichWrikeTask),
              ];
          } else {
            console.warn(
              `Could not fetch timelog task ${taskId}: ${res.status}`
            );
          }
        } catch (err) {
          console.warn(`Failed to fetch timelog task ${taskId}:`, err);
        }
      }

      // --- STEP 3: Fetch assigned tasks due today/tomorrow ---
      const myFirstName = wrikeFullName.split(" ")[0];
      let assignedTasks = await handleSyncMyJobs(true);
      if (!assignedTasks) assignedTasks = activeWrikeData || [];

      const assignedFiltered = assignedTasks.filter((t) => {
        const isAssigned = Array.isArray(t.assignees)
          ? t.assignees.includes(myFirstName)
          : t.assignees === myFirstName;
        if (!isAssigned) return false;

        const customStatus = (
          t.customStatusName ||
          t.status ||
          ""
        ).toLowerCase();
        const isDone =
          customStatus.includes("delivered") ||
          customStatus.includes("completed") ||
          customStatus === "cancelled";

        const dueStr = t.dueDate ? t.dueDate.split("T")[0] : null;

        if (isDone) return dueStr === todayStr || dueStr === tomorrowStr;
        if (t.status !== "Active") return false;
        if (dueStr) return dueStr >= yesterdayStr && dueStr <= tomorrowStr;

        const createdStr = t.createdDate ? t.createdDate.split("T")[0] : null;
        return createdStr === todayStr;
      });

      // --- STEP 4: Merge — timelog tasks take priority, assigned tasks fill the rest ---
      const timelogTaskIds = new Set(timelogTasks.map((t) => t.id));
      const mergedTasks = [
        ...timelogTasks,
        ...assignedFiltered.filter((t) => !timelogTaskIds.has(t.id)),
      ];

      const myTasks = mergedTasks;

      const grouped = {};
      const newExpanded = {};

      myTasks.forEach((task) => {
        const fields = guessFieldsFromTask(task);
        const groupName = fields.jobNumber || "Others (No Job Number)";

        let client = "";
        let filmTitle = task?.projectName || "";
        const searchTitle = (task?.title || "").toUpperCase();

        const pathUpper = (task.extractedPathData || "").toUpperCase();

        if (pathUpper.includes("UNIVERSAL")) {
          const terr = (fields.territory || "").toUpperCase();
          if (terr === "UK" || terr === "UNITED KINGDOM")
            client = "Universal Pictures UK";
          else if (terr === "AUSTRALIA" || terr === "AU" || terr === "AUS")
            client = "Universal Pictures Australia";
          else client = "Universal Pictures International";
        } else if (pathUpper.includes("PARAMOUNT"))
          client = "Paramount Pictures";
        else if (pathUpper.includes("SONY")) client = "Sony Pictures";

        if (
          !filmTitle ||
          filmTitle === "Unknown Project" ||
          searchTitle.includes("SHOWREEL") ||
          searchTitle.includes("INTERNAL") ||
          searchTitle.includes("PITCH")
        ) {
          filmTitle = "XYi Unbilled";
          if (!client) client = "Internal";
        }

        if (!grouped[groupName]) {
          grouped[groupName] = [];
          newExpanded[groupName] = true;
        }

        grouped[groupName].push({
          ...task,
          wrikeCategory: fields.category,
          wrikeJob: fields.jobNumber,
          wrikeLocation: fields.territory,
          wrikeStatus: task.customStatusName || task.status,
          client: client,
          filmTitle: filmTitle,
          projectDescription: fields.notes,
          dueDate: task.dueDate,
          createdDate: task.createdDate,
        });
      });

      setWrikeTimesheetData(grouped);
      setExpandedGroups(newExpanded);
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch Wrike data. Check your token and connection.");
    } finally {
      setIsFetchingModalData(false);
    }
  };

  const toggleGroup = (groupName) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  const handleModalCategoryChange = (groupName, taskId, newCategory) => {
    setWrikeTimesheetData((prev) => {
      const groupTasks = prev[groupName].map((t) =>
        t.id === taskId ? { ...t, wrikeCategory: newCategory } : t
      );
      return { ...prev, [groupName]: groupTasks };
    });

    rows
      .filter((r) => r.taskId === taskId)
      .forEach((r) => updateRow(r.id, "category", newCategory));
  };

  const handleModalTimeChange = (task, dayOfWeek, value) => {
    const existingRow = rows.find(
      (r) => r.taskId === task.id && r.dayOfWeek === dayOfWeek
    );

    if (value === "none") {
      if (existingRow && !existingRow.isSaved) {
        deleteRow(existingRow.id);
      }
      return;
    }

    if (existingRow) {
      updateRow(existingRow.id, "timeSpent", value);
      updateRow(existingRow.id, "category", task.wrikeCategory);
    } else {
      const newRow = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        taskId: task.id,
        dayOfWeek,
        jobNumber: task.wrikeJob,
        client: task.client,
        filmTitle: task.filmTitle,
        projectDescription: task.projectDescription,
        country: task.wrikeLocation,
        category: task.wrikeCategory,
        clientAmends: false,
        moreInfo: "Added from Wrike View",
        is3D: false,
        timeSpent: value,
        additionalTime: "none",
        isSaved: false,
      };
      addRow(newRow);
    }
  };

  const unloggedTasks = React.useMemo(() => {
    if (Object.keys(wrikeTimesheetData).length === 0) return [];

    const allModalTasks = Object.values(wrikeTimesheetData).flat();
    return allModalTasks.filter((task) => {
      const wrikeHours = getLogHoursForTaskAndDay(task.id, activeDay);
      const localRow = rows.find(
        (r) => r.taskId === task.id && r.dayOfWeek === activeDay
      );

      return !wrikeHours && (!localRow || localRow.timeSpent === "none");
    });
  }, [wrikeTimesheetData, rows, wrikeWeeklyLogs, activeDay]);

  const renderDayCell = (task, dayOfWeek) => {
    const wrikeHours = getLogHoursForTaskAndDay(task.id, dayOfWeek);
    const localRow = rows.find(
      (r) => r.taskId === task.id && r.dayOfWeek === dayOfWeek
    );
    const localValue = localRow ? localRow.timeSpent : "none";
    const isActive = localValue !== "none";
    const isToday = dayOfWeek === todayDayName;
    const isLocked = !isToday;

    return (
      <td
        className={`px-1 py-1.5 border-r border-[#263143] text-center relative group/cell transition-all ${
          isToday
            ? "bg-[#12a0e1]/8"
            : isActive
            ? "bg-[#1e293b]/40"
            : "opacity-30"
        }`}
        title={isLocked ? `Can only log time for today (${todayDayName})` : undefined}
      >
        {wrikeHours && (
          <div
            className="absolute top-0.5 left-1 text-[8px] font-bold text-emerald-400/50"
            title="Wrike Synced Time"
          >
            {wrikeHours}h
          </div>
        )}
        <div className="mx-auto w-11 h-7 relative flex items-center justify-center">
          {isLocked ? (
            <span className={`text-[11px] font-bold ${isActive ? "text-slate-500" : "text-slate-700"}`}>
              {isActive ? localValue : "—"}
            </span>
          ) : (
            <select
              value={localValue}
              onChange={(e) =>
                handleModalTimeChange(task, dayOfWeek, e.target.value)
              }
              className={`w-full h-full text-center outline-none cursor-pointer appearance-none text-[11px] font-bold rounded-lg border transition-all ${
                isActive
                  ? "text-[#0284c7] bg-[#e0f2fe] border-[#bae6fd] shadow-sm"
                  : "text-[#38bdf8]/50 bg-[#12a0e1]/10 border-[#12a0e1]/20 hover:bg-[#12a0e1]/20 hover:text-[#38bdf8]/80"
              }`}
            >
              <option value="none" className="bg-[#19202b] text-slate-500">
                +
              </option>
              {TIME_OPTIONS.filter((o) => o !== "none").map((opt) => (
                <option
                  key={opt}
                  value={opt}
                  className="bg-[#19202b] text-slate-200"
                >
                  {opt}
                </option>
              ))}
            </select>
          )}
        </div>
      </td>
    );
  };

  // Shared helper: parses Wrike HTML description into plain text + path data
  const parseWrikeDescription = (htmlString) => {
    if (!htmlString) return { notesText: "", extractedPathData: "" };
    let extractedPathData = "";
    const plainText = htmlString.replace(/<[^>]*>?/gm, " ");
    const folderMatches = plainText.match(/\/Volumes\/[^\s]+/gi);
    if (folderMatches) extractedPathData = folderMatches.join(" ");
    const xyMatch = plainText.match(/(XY\d{5,6})/i);
    if (xyMatch && !extractedPathData.includes(xyMatch[1]))
      extractedPathData += " " + xyMatch[1];
    const rawText = htmlString
      .replace(/<table[\s\S]*?<\/table>/i, "")
      .replace(/<[^>]*>/g, "")
      .trim();
    return {
      notesText: rawText,
      extractedPathData: extractedPathData.toUpperCase(),
    };
  };

  // Shared helper: enrich a raw Wrike task object the same way handleSyncMyJobs does
  const enrichWrikeTask = (task) => {
    const parsed = parseWrikeDescription(task.description);
    let projectName = task.title.split(/[_|-]/)[0].trim();
    if (parsed.extractedPathData) {
      const parts = parsed.extractedPathData.split("/");
      const digIdx = parts.findIndex((p) => p === "DIGITAL");
      if (digIdx > 0 && parts[digIdx - 1])
        projectName = decodeURIComponent(parts[digIdx - 1])
          .replace(/[_|-]/g, " ")
          .trim();
    }
    return {
      ...task,
      extractedPathData: parsed.extractedPathData,
      notesText: parsed.notesText,
      projectName,
      customStatusName: task.status,
      // Mark as unassigned-recovery so we know this task was fetched because
      // the user was removed from it — keeps all metadata intact
      assignees: ["__recovered__"],
      dueDate: task.dates?.due ?? null,
      createdDate: task.createdDate,
    };
  };

  // Fetch task details for IDs missing from the local task list (e.g. user
  // logged time then was removed as a responsible). Returns an updated copy of
  // the task array with the recovered tasks appended.
  const fetchMissingTasks = async (currentTasks, logEntries, token) => {
    const existingIds = new Set(currentTasks.map((t) => t.id));
    const missingIds = [...new Set(logEntries.map((l) => l.taskId))].filter(
      (id) => !existingIds.has(id)
    );
    if (missingIds.length === 0) return currentTasks;

    const fieldsFilter = encodeURIComponent(
      "[customFields,parentIds,description]"
    );
    let recovered = [...currentTasks];

    for (let i = 0; i < missingIds.length; i += 100) {
      const chunk = missingIds.slice(i, i + 100);
      try {
        const res = await fetch(
          `https://www.wrike.com/api/v4/tasks/${chunk.join(
            ","
          )}?fields=${fieldsFilter}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const json = await res.json();
        if (json.data) {
          recovered = [...recovered, ...json.data.map(enrichWrikeTask)];
        }
      } catch (err) {
        console.warn("Failed to recover missing tasks chunk:", chunk, err);
        // Don't abort the whole pull — continue with whatever we have
      }
    }
    return recovered;
  };

  const handlePullTimes = async () => {
    const token = localStorage.getItem("wrike_personal_token");
    if (!token) {
      showToast("Please set your Wrike token in the API tab first.");
      return;
    }
    if (!wrikeUserId) {
      showToast("Loading your Wrike profile — please wait a moment.");
      return;
    }

    setIsPulling(true);
    try {
      let currentTasks = await handleSyncMyJobs(true);
      if (!currentTasks) currentTasks = activeWrikeData;

      // Use contacts-scoped endpoint — avoids the broken trackedDate query param
      // Filter to today client-side using local date string
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(
        now.getMonth() + 1
      ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      const res = await fetch(
        `https://www.wrike.com/api/v4/contacts/${wrikeUserId}/timelogs`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await res.json();
      // Filter to today only using local date string (avoids UTC-midnight shift)
      const logs = (json.data || []).filter(
        (l) => l.trackedDate?.split("T")[0] === todayStr
      );

      // Recover any tasks where the user was removed as a responsible —
      // their timelogs still exist but the task won't appear in handleSyncMyJobs
      currentTasks = await fetchMissingTasks(currentTasks, logs, token);

      // Fetch existing timelog IDs across ALL sources so we don't duplicate
      // entries that were already pulled in Tracker (or vice versa)
      const existingTimelogIds = await fetchExistingTimelogIds(wrikeUserId);

      const newRows = [];

      logs.forEach((log) => {
        if (existingTimelogIds.has(log.id)) return;

        const task = currentTasks.find((t) => t.id === log.taskId);
        const guessed = guessFieldsFromTask(task);

        let client = "";
        let filmTitle = task?.projectName || "";
        const searchTitle = (task?.title || "").toUpperCase();

        if (task) {
          const pathUpper = (task.extractedPathData || "").toUpperCase();

          if (pathUpper.includes("UNIVERSAL")) {
            const terr = (guessed.territory || "").toUpperCase();
            if (terr === "UK" || terr === "UNITED KINGDOM")
              client = "Universal Pictures UK";
            else if (terr === "AUSTRALIA" || terr === "AU" || terr === "AUS")
              client = "Universal Pictures Australia";
            else client = "Universal Pictures International";
          } else if (pathUpper.includes("PARAMOUNT"))
            client = "Paramount Pictures";
          else if (pathUpper.includes("SONY")) client = "Sony Pictures";
        }

        if (
          !filmTitle ||
          filmTitle === "Unknown Project" ||
          searchTitle.includes("SHOWREEL") ||
          searchTitle.includes("INTERNAL") ||
          searchTitle.includes("PITCH")
        ) {
          filmTitle = "XYi Unbilled";
          if (!client) client = "Internal";
        }

        const dayNames = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ];
        // Use the log's own trackedDate parsed in local time (avoids UTC-midnight shift)
        const [ly, lm, ld] = log.trackedDate
          .split("T")[0]
          .split("-")
          .map(Number);
        const logDate = new Date(ly, lm - 1, ld);
        const dayOfWeek = dayNames[logDate.getDay()];

        if (frozenDays[dayOfWeek]) return;

        newRows.push({
          id: Date.now() + Math.floor(Math.random() * 1000),
          wrikeTimelogId: log.id,
          taskId: task?.id,
          dayOfWeek,
          jobNumber: guessed.jobNumber,
          client: client,
          filmTitle: filmTitle,
          projectDescription: guessed.notes,
          country: guessed.territory,
          category: guessed.category,
          clientAmends: false,
          moreInfo: log.comment || "Wrike Timelog Pull",
          is3D: false,
          timeSpent: getTimesheetValue(log.hours),
          additionalTime: "none",
          isSaved: true,
        });
      });

      if (newRows.length > 0) {
        addRows(newRows);
        showToast(`Pulled ${newRows.length} row${newRows.length !== 1 ? "s" : ""} from Wrike.`, "success");
      } else {
        showToast("No new or unfrozen times found for today.");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to pull times: " + err.message);
    } finally {
      setIsPulling(false);
    }
  };

  const handleExportExcel = () => {
    if (rows.length === 0) {
      showToast("No data to export yet.");
      return;
    }

    const headers = ["Day", ...COLUMNS].join(",");
    const csvRows = rows.map((row) => {
      return [
        row.dayOfWeek,
        `"${row.jobNumber}"`,
        `"${row.client}"`,
        `"${row.filmTitle}"`,
        `"${row.projectDescription?.replace(/"/g, '""') || ""}"`,
        `"${row.country}"`,
        `"${row.category}"`,
        row.clientAmends ? "Yes" : "No",
        `"${row.moreInfo?.replace(/"/g, '""') || ""}"`,
        row.is3D ? "Yes" : "No",
        row.timeSpent,
        row.additionalTime,
      ].join(",");
    });

    const csvContent = [headers, ...csvRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Timesheet_Export_${
      new Date().toISOString().split("T")[0]
    }.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyJSON = async () => {
    if (rows.length === 0) {
      showToast("No data to copy yet.");
      return;
    }

    try {
      const mappedTasks = rows.map((row) => {
        const rawSecs =
          row.timeSpent === "none" || !row.timeSpent
            ? 0
            : parseFloat(row.timeSpent) * 3600;
        const addSecs =
          row.additionalTime === "none" || !row.additionalTime
            ? 0
            : parseFloat(row.additionalTime) * 3600;

        let exportTerritory = row.country || "";
        if (exportTerritory === "UK") exportTerritory = "United Kingdom";
        else if (exportTerritory === "USA" || exportTerritory === "US")
          exportTerritory = "United States";
        else if (exportTerritory === "UAE")
          exportTerritory = "United Arab Emirates";

        return {
          id: row.id,
          taskId: row.taskId,
          jobNumber: row.jobNumber || "",
          territory: exportTerritory,
          category: row.category || "",
          notes:
            (row.projectDescription || "") +
            (row.moreInfo &&
            row.moreInfo !== "Wrike Timelog Pull" &&
            row.moreInfo !== "Added from Wrike View"
              ? ` | ${row.moreInfo}`
              : ""),
          dayOfWeek: row.dayOfWeek || activeDay,
          rawSeconds: rawSecs,
          additionalSeconds: addSecs,
          is3D: !!row.is3D,
          clientAmends: !!row.clientAmends,
        };
      });

      const getConsolidatedTasks = (taskList) => {
        const consolidated = {};
        taskList.forEach((t) => {
          const key = `${t.dayOfWeek}|${t.jobNumber}|${t.territory}|${t.category}`;
          if (!consolidated[key]) {
            consolidated[key] = {
              ...t,
              rawSeconds: 0,
              additionalSeconds: 0,
              notesArray: [],
              subtaskCount: 0,
            };
          }
          consolidated[key].rawSeconds += t.rawSeconds || 0;
          consolidated[key].additionalSeconds += t.additionalSeconds || 0;
          consolidated[key].subtaskCount += 1;
          if (t.notes && !consolidated[key].notesArray.includes(t.notes)) {
            consolidated[key].notesArray.push(t.notes);
          }
        });

        return Object.values(consolidated).map((c) => ({
          ...c,
          notes: c.notesArray.filter(Boolean).join(" | "),
        }));
      };

      const exportData = {
        version: 5,
        exportDate: new Date().toISOString(),
        tasks: getConsolidatedTasks(mappedTasks),
        rawTasks: mappedTasks,
        jobOptions: DEFAULT_JOBS,
      };

      const jsonString = JSON.stringify(exportData);

      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(jsonString);
      } else {
        const tempTextArea = document.createElement("textarea");
        tempTextArea.value = jsonString;
        tempTextArea.style.position = "absolute";
        tempTextArea.style.left = "-999999px";
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        document.execCommand("copy");
        document.body.removeChild(tempTextArea);
      }

      setJsonCopied(true);
      setTimeout(() => setJsonCopied(false), 3000);
    } catch (err) {
      console.error("Failed to copy JSON", err);
      showToast("Failed to copy JSON. Check browser clipboard permissions.");
    }
  };

  // updateRow(id, field, value) and deleteRow(id) are provided by useLegacyRows
  const handleUpdateRow = (id, field, value) => {
    if (frozenDays[activeDay]) return;
    // Auto-fill projectDescription from jobNumber if it contains a comma
    if (field === "jobNumber" && value && value.includes(",")) {
      updateRow(id, "projectDescription", value.substring(value.indexOf(",") + 1).trim());
    }
    updateRow(id, field, value);
  };

  const handleDeleteRow = (id) => {
    if (frozenDays[activeDay]) return;
    deleteRow(id);
  };

  const toggleFreeze = () => {
    setFrozenDays((prev) => ({
      ...prev,
      [activeDay]: !prev[activeDay],
    }));
  };

  const currentDayRows = rows.filter((r) => r.dayOfWeek === activeDay);
  const isDayFrozen = frozenDays[activeDay] || false;

  const textAreaClass = `w-full bg-transparent border border-transparent hover:border-slate-300 focus:border-[#12a0e1] focus:ring-2 focus:ring-[#12a0e1]/20 outline-none text-[12px] text-slate-800 font-medium p-2 transition-all rounded-md resize-none overflow-hidden leading-tight ${
    isDayFrozen ? "opacity-60 cursor-not-allowed" : ""
  }`;

  return (
    <div className="min-h-screen bg-slate-100 p-4 font-sans selection:bg-[#12a0e1]/30">
      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-5 right-5 z-[99999] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-bold transition-all animate-in fade-in slide-in-from-top-2 duration-300 ${
          toast.type === "error"
            ? "bg-rose-500 text-white"
            : "bg-[#1cc1a5] text-white"
        }`}>
          {toast.type === "error" ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
          {toast.message}
        </div>
      )}
      {/* --- DESIGN PACK: PREMIUM MODERN WRIKE TIMESHEET MODAL --- */}
      {isWrikeModalOpen && (
        <div className="fixed inset-0 z-[99999] bg-[#0b0f17]/95 backdrop-blur-xl flex flex-col text-slate-300 animate-in fade-in duration-200">
          {/* Header */}
          <div className="bg-[#121824]/90 border-b border-[#222f3e] px-8 py-5 flex justify-between items-center shrink-0 shadow-lg relative z-10 backdrop-blur-md">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-[#12a0e1] shadow-[0_0_12px_#12a0e1]"></div>
                <h1 className="text-xl font-black text-white tracking-tight uppercase">
                  Wrike Hub
                </h1>
              </div>
              <div className="flex gap-1.5 p-1 bg-[#090d14] rounded-xl border border-[#1e293b]">
                <button
                  onClick={() => setModalTab("timesheet")}
                  className={`px-4 py-1.5 text-xs font-black tracking-wide uppercase transition-all rounded-lg ${
                    modalTab === "timesheet"
                      ? "bg-[#12a0e1] text-white shadow-md"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  My Timesheet
                </button>
                <button
                  onClick={() => setModalTab("reminders")}
                  className={`px-4 py-1.5 text-xs font-black tracking-wide uppercase transition-all rounded-lg flex items-center gap-2 ${
                    modalTab === "reminders"
                      ? "bg-[#12a0e1] text-white shadow-md"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Reminders
                  {unloggedTasks.length > 0 && (
                    <span className="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full leading-none shadow-sm shadow-rose-500/20 animate-pulse">
                      {unloggedTasks.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
            <button
              onClick={() => setIsWrikeModalOpen(false)}
              className="p-2.5 bg-[#1a2333] hover:bg-[#253247] border border-[#2d3d52] text-slate-400 hover:text-white rounded-xl transition-all shadow-md active:scale-95"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Sub Header */}
          {modalTab === "timesheet" && (
            <div className="bg-[#121824]/50 border-b border-[#222f3e] px-8 py-3 flex items-center justify-between gap-6 text-xs font-bold uppercase tracking-wider shrink-0 text-slate-400">
              <span className="flex items-center gap-2.5">
                <div className="w-6 h-6 bg-gradient-to-tr from-[#12a0e1] to-[#1cc1a5] rounded-lg flex items-center justify-center text-white text-xs font-black shadow-md shadow-[#12a0e1]/10">
                  {wrikeFullName.charAt(0)}
                </div>
                <span className="text-slate-200">{wrikeFullName}</span>
              </span>
              <span className="flex items-center gap-2 bg-[#090d14] px-3 py-1.5 rounded-lg border border-[#1e293b]">
                <RefreshCw
                  className={`w-3.5 h-3.5 text-[#1cc1a5] ${
                    isFetchingModalData ? "animate-spin" : ""
                  }`}
                />
                Current Reporting Week
              </span>
            </div>
          )}

          {/* Table Container */}
          <div className="flex-1 overflow-auto bg-[#0b0f17] custom-scrollbar">
            {/* TIMESHEET TAB */}
            {modalTab === "timesheet" && (
              <table className="w-full text-left text-[12px] border-collapse whitespace-nowrap min-w-max">
                <thead className="bg-[#121824] text-slate-400 font-bold uppercase tracking-wider sticky top-0 z-20 shadow-md border-b border-[#222f3e]">
                  <tr>
                    <th className="px-5 py-3.5 border-r border-[#222f3e] w-[320px]">
                      Assignment Title
                    </th>
                    <th className="px-5 py-3.5 border-r border-[#222f3e] w-[140px]">
                      Status
                    </th>
                    <th className="px-5 py-3.5 border-r border-[#222f3e] w-[240px]">
                      Category Link
                    </th>
                    <th className="px-5 py-3.5 border-r border-[#222f3e]">
                      Job Key
                    </th>
                    <th className="px-5 py-3.5 border-r border-[#222f3e] w-[110px]">
                      Due Date
                    </th>
                    <th className="px-5 py-3.5 border-r border-[#222f3e]">
                      Location
                    </th>
                    {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d, i) => {
                      const dayName = DAYS[i];
                      const isCurrent = todayDayName === dayName;
                      const isEnd = d === "Sa" || d === "Su";
                      return (
                        <th
                          key={d}
                          className={`px-4 py-3.5 border-r border-[#222f3e] text-center w-16 last:border-r-0 ${
                            isCurrent
                              ? "bg-[#12a0e1]/15 text-[#38bdf8] font-black"
                              : isEnd
                              ? "text-rose-400/60"
                              : ""
                          }`}
                        >
                          {d}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e293b]/60">
                  {isFetchingModalData ? (
                    <tr>
                      <td
                        colSpan="12"
                        className="text-center py-24 text-slate-500 font-medium italic"
                      >
                        Synchronizing week metrics with Wrike...
                      </td>
                    </tr>
                  ) : Object.keys(wrikeTimesheetData).length === 0 ? (
                    <tr>
                      <td
                        colSpan="12"
                        className="text-center py-24 text-slate-500 font-medium italic"
                      >
                        No workspace records detected.
                      </td>
                    </tr>
                  ) : (
                    Object.entries(wrikeTimesheetData)
                      // --- SMART SORTING ALGORITHM FOR GROUPS ---
                      .sort((a, b) => {
                        const minDueA = Math.min(
                          ...a[1].map((t) => getTaskSortValues(t).due)
                        );
                        const minDueB = Math.min(
                          ...b[1].map((t) => getTaskSortValues(t).due)
                        );

                        if (minDueA !== minDueB) return minDueA - minDueB;

                        const maxCreatedA = Math.max(
                          ...a[1].map((t) => getTaskSortValues(t).created)
                        );
                        const maxCreatedB = Math.max(
                          ...b[1].map((t) => getTaskSortValues(t).created)
                        );

                        if (maxCreatedA !== maxCreatedB)
                          return maxCreatedB - maxCreatedA;

                        return a[0].localeCompare(b[0]);
                      })
                      .map(([groupName, tasks]) => {
                        // --- SMART SORTING ALGORITHM FOR TASKS INSIDE GROUPS ---
                        const sortedTasks = [...tasks].sort((tA, tB) => {
                          const datesA = getTaskSortValues(tA);
                          const datesB = getTaskSortValues(tB);

                          if (datesA.due !== datesB.due)
                            return datesA.due - datesB.due;
                          return datesB.created - datesA.created;
                        });

                        return (
                          <React.Fragment key={groupName}>
                            {/* Group Header Row */}
                            <tr
                              className="bg-[#141b27] hover:bg-[#1a2436] transition-all cursor-pointer border-y border-[#222f3e]"
                              onClick={() => toggleGroup(groupName)}
                            >
                              <td
                                colSpan="6"
                                className="px-5 py-2.5 border-r border-[#222f3e] font-black text-slate-200 tracking-tight text-xs"
                              >
                                <div className="flex items-center gap-2.5">
                                  {expandedGroups[groupName] ? (
                                    <ChevronDown className="w-4 h-4 text-[#12a0e1]" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-slate-500" />
                                  )}
                                  <span>{groupName}</span>
                                  <span className="bg-[#090d14] text-slate-500 font-bold px-2 py-0.5 rounded-full text-[10px] border border-[#1e293b]">
                                    {tasks.length}
                                  </span>
                                </div>
                              </td>
                              {DAYS.map((d) => (
                                <td
                                  key={d}
                                  className={`border-r border-[#222f3e] last:border-r-0 ${
                                    todayDayName === d
                                      ? "bg-[#12a0e1]/8"
                                      : "bg-[#0f141f] opacity-40"
                                  }`}
                                ></td>
                              ))}
                            </tr>

                            {/* Child Rows */}
                            {expandedGroups[groupName] &&
                              sortedTasks.map((task) => {
                                const isAddedToActiveDay = rows.some(
                                  (r) =>
                                    r.taskId === task.id &&
                                    r.dayOfWeek === activeDay
                                );

                                return (
                                  <tr
                                    key={task.id}
                                    className={`transition-all group border-b border-[#1e293b]/40 ${
                                      isAddedToActiveDay
                                        ? "bg-[#10b981]/15 hover:bg-[#10b981]/25 border-l-2 border-l-[#10b981] shadow-[inset_0_0_15px_rgba(52,211,153,0.05)] text-emerald-100"
                                        : "hover:bg-[#121824]"
                                    }`}
                                  >
                                    <td
                                      className="px-5 py-3 border-r border-[#222f3e] truncate max-w-[320px] pl-10 font-medium"
                                      title={task.title}
                                    >
                                      {task.permalink ? (
                                        <a
                                          href={task.permalink}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="hover:text-[#12a0e1] transition-colors hover:underline underline-offset-2"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {task.title}
                                        </a>
                                      ) : (
                                        task.title
                                      )}
                                    </td>
                                    <td className="px-5 py-3 border-r border-[#222f3e] align-middle">
                                      <span
                                        className={getDarkTagStyle(
                                          task.wrikeStatus
                                        )}
                                      >
                                        {task.wrikeStatus}
                                      </span>
                                    </td>
                                    <td className="px-3 py-1 border-r border-[#222f3e] align-middle w-[240px]">
                                      <TableSearchableSelect
                                        options={CATEGORIES}
                                        value={task.wrikeCategory}
                                        onChange={(val) =>
                                          handleModalCategoryChange(
                                            groupName,
                                            task.id,
                                            val
                                          )
                                        }
                                        placeholder="Category"
                                        isGrouped={true}
                                        dropdownId={`modal-category-${task.id}`}
                                        activeDropdown={activeDropdown}
                                        setActiveDropdown={setActiveDropdown}
                                        isCategory={true}
                                        isDarkModal={true}
                                      />
                                    </td>
                                    <td className="px-5 py-3 border-r border-[#222f3e] font-mono text-[11px] text-slate-500 font-semibold">
                                      {task.wrikeJob}
                                    </td>
                                    <td className="px-5 py-3 border-r border-[#222f3e] w-[110px]">
                                      {task.dueDate ? (
                                        (() => {
                                          const [y, m, d] = task.dueDate
                                            .split("T")[0]
                                            .split("-")
                                            .map(Number);
                                          const due = new Date(y, m - 1, d);
                                          const today = new Date();
                                          today.setHours(0, 0, 0, 0);
                                          const diffDays = Math.round(
                                            (due - today) / 86400000
                                          );
                                          const label = due.toLocaleDateString(
                                            "en-GB",
                                            { day: "numeric", month: "short" }
                                          );
                                          const isOverdue = diffDays < 0;
                                          const isToday = diffDays === 0;
                                          const isTomorrow = diffDays === 1;
                                          return (
                                            <span
                                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border w-fit ${
                                                isOverdue
                                                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                                  : isToday
                                                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                                  : isTomorrow
                                                  ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                                                  : "bg-[#1e2530] text-slate-400 border-[#2d3748]"
                                              }`}
                                            >
                                              {label}
                                              {isOverdue && (
                                                <span className="text-[9px] font-black uppercase tracking-wider text-rose-500">
                                                  overdue
                                                </span>
                                              )}
                                              {isToday && (
                                                <span className="text-[9px] font-black uppercase tracking-wider text-amber-500">
                                                  today
                                                </span>
                                              )}
                                              {isTomorrow && (
                                                <span className="text-[9px] font-black uppercase tracking-wider text-yellow-500">
                                                  tmrw
                                                </span>
                                              )}
                                            </span>
                                          );
                                        })()
                                      ) : (
                                        <span className="text-slate-600 text-[11px]">
                                          —
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-5 py-3 border-r border-[#222f3e]">
                                      {task.wrikeLocation !==
                                        "⚠️ Unassigned" && (
                                        <span className="bg-[#1e2530] text-slate-300 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-[#2d3748] shadow-sm flex items-center gap-1.5 w-fit">
                                          {TERRITORY_FLAGS[task.wrikeLocation]}{" "}
                                          {task.wrikeLocation}
                                        </span>
                                      )}
                                    </td>

                                    {renderDayCell(task, "Monday")}
                                    {renderDayCell(task, "Tuesday")}
                                    {renderDayCell(task, "Wednesday")}
                                    {renderDayCell(task, "Thursday")}
                                    {renderDayCell(task, "Friday")}
                                    {renderDayCell(task, "Saturday")}
                                    {renderDayCell(task, "Sunday")}
                                  </tr>
                                );
                              })}
                          </React.Fragment>
                        );
                      })
                  )}
                </tbody>
              </table>
            )}

            {/* REMINDERS TAB */}
            {modalTab === "reminders" && (
              <div className="p-8 md:p-12 max-w-4xl mx-auto w-full animate-in fade-in slide-in-from-bottom-3 duration-300">
                <div className="mb-10 text-center space-y-2">
                  <h2 className="text-2xl font-black text-white tracking-tight">
                    Active Cross-Check •{" "}
                    <span className="text-[#38bdf8]">{activeDay}</span>
                  </h2>
                  <p className="text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
                    The framework auto-detected missing time metrics on the
                    following active items for{" "}
                    <span className="text-slate-200 font-semibold">
                      {activeDay}
                    </span>
                    . Update your row records below:
                  </p>
                </div>

                {unloggedTasks.length === 0 ? (
                  <div className="bg-[#121824] border border-[#222f3e] rounded-2xl p-12 text-center flex flex-col items-center shadow-xl">
                    <div className="bg-emerald-500/10 p-4 rounded-full mb-4 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                      <CheckCircle className="w-10 h-10 text-[#10b981]" />
                    </div>
                    <p className="text-white text-lg font-black tracking-tight">
                      Logs fully synchronized!
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
                      No allocated tasks are currently missing matching log
                      hours for this target day.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {unloggedTasks.map((task) => (
                      <div
                        key={task.id}
                        className="bg-[#121824] border border-[#222f3e] hover:border-[#2d3d52] rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 transition-all shadow-md relative overflow-hidden"
                      >
                        <div className="absolute top-0 bottom-0 left-0 w-1 bg-rose-500/50"></div>
                        <div className="flex items-start gap-4 flex-1 min-w-0 pl-1">
                          <div className="bg-rose-500/10 p-2 rounded-xl shrink-0 mt-0.5 border border-rose-500/20">
                            <AlertCircle className="w-4 h-4 text-rose-400" />
                          </div>
                          <div className="flex-1 min-w-0 space-y-2">
                            <h3
                              className="text-sm font-bold text-white truncate"
                              title={task.title}
                            >
                              {task.title}
                            </h3>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={getDarkTagStyle(task.wrikeStatus)}
                              >
                                {task.wrikeStatus}
                              </span>
                              <span className="bg-[#0b0f17] text-slate-400 px-2.5 py-0.5 rounded-md text-[11px] border border-[#1e293b] font-mono">
                                {task.wrikeJob}
                              </span>
                              <span className="bg-[#0b0f17] text-slate-400 px-2.5 py-0.5 rounded-md text-[11px] border border-[#1e293b] truncate max-w-[200px]">
                                {task.wrikeCategory}
                              </span>
                              {task.wrikeLocation !== "⚠️ Unassigned" && (
                                <span className="bg-[#0b0f17] text-slate-400 px-2.5 py-0.5 rounded-md text-[11px] border border-[#1e293b] flex items-center gap-1">
                                  {TERRITORY_FLAGS[task.wrikeLocation]}{" "}
                                  {task.wrikeLocation}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 bg-[#090d14] p-2.5 rounded-xl border border-[#1e293b] w-full md:w-auto">
                          <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest pl-2">
                            Hours:
                          </span>
                          <div className="w-24">
                            <TableSearchableSelect
                              options={TIME_OPTIONS}
                              value={"none"}
                              onChange={(val) =>
                                handleModalTimeChange(task, activeDay, val)
                              }
                              placeholder="none"
                              dropdownId={`reminder-time-${task.id}`}
                              activeDropdown={activeDropdown}
                              setActiveDropdown={setActiveDropdown}
                              isTime={true}
                              isDarkModal={true}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- STANDARD UI --- */}
      <div className="max-w-[1600px] mx-auto bg-white shadow-2xl rounded-2xl relative min-h-[800px] flex flex-col border border-slate-200">
        {/* --- MODERN HEADER --- */}
        <div className="bg-slate-900 text-white p-6 flex justify-between items-center border-b border-slate-800 rounded-t-2xl">
          <div>
            <div className="flex items-center gap-4 mb-1">
              <h1 className="text-2xl font-black tracking-tight text-white">
                Weekly Timesheet
              </h1>
              <span className="text-[13px] font-bold text-slate-400 bg-slate-800 px-3 py-1 rounded-full">
                {weekDateRange}
              </span>
            </div>
            <div className="text-[13px] text-slate-300 font-medium flex items-center gap-4 mt-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Welcome Back, {wrikeFullName ? wrikeFullName : "Loading..."}
              </div>

              {wrikeUserId && (
                <button
                  onClick={() => handleSyncMyJobs()}
                  disabled={isSyncingJobs}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 px-3 py-1 rounded-lg text-[11px] font-bold transition-all border border-slate-700 active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      isSyncingJobs ? "animate-spin text-emerald-500" : ""
                    }`}
                  />
                  {isSyncingJobs ? "Syncing..." : "Sync My Jobs"}
                </button>
              )}
            </div>
          </div>

          <div className="text-right">
            <img
              src="https://timesheet.xyi.com/img/xyi_logo_banner.png"
              alt="XYi Design"
              className="h-10 object-contain drop-shadow-md"
            />
          </div>
        </div>

        {/* --- MODERN TABS --- */}
        <div className="flex px-4 pt-4 bg-slate-50 border-b border-slate-200 gap-2">
          {DAYS.map((day) => {
            const isWeekend = day === "Saturday" || day === "Sunday";
            const isActive = activeDay === day;

            let tabColors = "";
            if (isActive) {
              tabColors = isWeekend
                ? "bg-white text-rose-500 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] border-t border-x border-slate-200"
                : "bg-white text-[#12a0e1] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] border-t border-x border-slate-200";
            } else {
              tabColors = isWeekend
                ? "bg-rose-50 text-rose-400 hover:bg-rose-100 hover:text-rose-600 border-t border-x border-transparent"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 border-t border-x border-transparent";
            }

            return (
              <button
                key={day}
                onClick={() => setActiveDay(day)}
                className={`flex-1 py-3 text-[13px] font-bold text-center rounded-t-xl transition-all ${tabColors} ${
                  isActive ? "relative z-10 top-[1px]" : ""
                }`}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <div className="flex items-center justify-center gap-1.5">
                    {frozenDays[day] && <Lock className="w-3 h-3 opacity-60" />}
                    {day}
                    {rows.filter((r) => r.dayOfWeek === day).length > 0 && (
                      <span
                        className={`ml-1.5 text-[10px] px-2 py-0.5 rounded-full ${
                          isActive
                            ? isWeekend
                              ? "bg-rose-100 text-rose-600"
                              : "bg-[#12a0e1]/10 text-[#12a0e1]"
                            : isWeekend
                            ? "bg-rose-200/50 text-rose-500"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {rows.filter((r) => r.dayOfWeek === day).length}
                      </span>
                    )}
                  </div>
                  {getDayTotal(day) > 0 && (
                    <span className={`text-[10px] font-mono font-bold ${
                      isActive
                        ? isWeekend ? "text-rose-500" : "text-[#12a0e1]"
                        : "text-slate-400"
                    }`}>
                      {getDayTotal(day)}h
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Freeze toggle strip */}
        <div className="bg-white border-b border-slate-100 px-4 py-1.5 flex items-center justify-end gap-2">
          <span className={`text-[11px] font-bold transition-colors ${isDayFrozen ? "text-amber-500" : "text-slate-400"}`}>
            {isDayFrozen ? `${activeDay} is locked` : `Lock ${activeDay}`}
          </span>
          <button
            onClick={toggleFreeze}
            title={isDayFrozen ? "Unlock day" : "Lock day to prevent edits"}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
              isDayFrozen ? "bg-amber-400" : "bg-slate-200 hover:bg-slate-300"
            }`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              isDayFrozen ? "translate-x-4" : "translate-x-0.5"
            }`} />
          </button>
          {isDayFrozen && <Lock className="w-3.5 h-3.5 text-amber-400" />}
        </div>

        {/* --- TABLE AREA --- */}
        <div className="flex-1 bg-white relative overflow-x-auto w-full">
          <table className="w-full text-left text-[12px] border-collapse min-w-max">
            <thead>
              <tr className="bg-slate-800 text-slate-200 shadow-sm">
                {COLUMNS.map((col, idx) => (
                  <th
                    key={col}
                    className={`p-3 border-r border-slate-700 font-bold whitespace-nowrap tracking-wide ${
                      idx === COLUMNS.length - 1 ? "border-r-0" : ""
                    }`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentDayRows.map((row) => (
                <tr
                  key={row.id}
                  className={`timesheet-row transition-colors group relative ${
                    isDayFrozen ? "frozen-row" : ""
                  }`}
                >
                  <td className="p-2 border-r border-slate-100 align-middle min-w-[240px]">
                    <div className="flex items-start gap-2 pl-1">
                      <button
                        onClick={() => handleDeleteRow(row.id)}
                        disabled={isDayFrozen}
                        className={`mt-1.5 transition-opacity ${
                          isDayFrozen
                            ? "opacity-20 cursor-not-allowed"
                            : "opacity-50 hover:opacity-100"
                        }`}
                      >
                        <XCircle
                          className={`w-5 h-5 ${
                            isDayFrozen
                              ? "text-slate-400"
                              : "text-rose-500 fill-rose-100"
                          }`}
                        />
                      </button>
                      <div className="flex flex-col w-full">
                        <TableSearchableSelect
                          options={DEFAULT_JOBS}
                          value={row.jobNumber}
                          onChange={(val) =>
                            handleUpdateRow(row.id, "jobNumber", val)
                          }
                          placeholder="Select Job..."
                          isGrouped={true}
                          dropdownId={`job-${row.id}`}
                          activeDropdown={activeDropdown}
                          setActiveDropdown={setActiveDropdown}
                          isJob={true}
                          disabled={isDayFrozen}
                        />
                        {row.isSaved && (
                          <span className="text-[10px] font-bold text-emerald-600 ml-2 mt-0.5 flex items-center gap-1 opacity-80">
                            <CheckCircle className="w-3 h-3" /> Wrike Synced
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="p-2 border-r border-slate-100 align-middle w-[140px]">
                    <div
                      className={`text-[12px] leading-tight font-semibold px-2 ${
                        isDayFrozen ? "text-slate-500" : "text-slate-700"
                      }`}
                    >
                      {row.client}
                    </div>
                  </td>

                  <td className="p-2 border-r border-slate-100 align-middle w-[150px]">
                    <div
                      className={`text-[12px] leading-tight font-black px-2 ${
                        isDayFrozen ? "text-slate-600" : "text-slate-900"
                      }`}
                    >
                      {row.filmTitle}
                    </div>
                  </td>

                  <td className="p-2 border-r border-slate-100 align-middle w-[220px]">
                    <textarea
                      rows={2}
                      value={row.projectDescription}
                      onChange={(e) =>
                        handleUpdateRow(row.id, "projectDescription", e.target.value)
                      }
                      className={textAreaClass}
                      placeholder="Project description..."
                      disabled={isDayFrozen}
                    />
                  </td>

                  <td className="p-2 border-r border-slate-100 align-middle w-[140px]">
                    <TableSearchableSelect
                      options={TERRITORIES}
                      value={row.country}
                      onChange={(val) => handleUpdateRow(row.id, "country", val)}
                      placeholder="Country"
                      getPrefix={(val) => TERRITORY_FLAGS[val]}
                      dropdownId={`country-${row.id}`}
                      activeDropdown={activeDropdown}
                      setActiveDropdown={setActiveDropdown}
                      isCountry={true}
                      disabled={isDayFrozen}
                    />
                  </td>

                  <td className="p-2 border-r border-slate-100 align-middle w-[180px]">
                    <TableSearchableSelect
                      options={CATEGORIES}
                      value={row.category}
                      onChange={(val) => handleUpdateRow(row.id, "category", val)}
                      placeholder="Category"
                      isGrouped={true}
                      dropdownId={`category-${row.id}`}
                      activeDropdown={activeDropdown}
                      setActiveDropdown={setActiveDropdown}
                      isCategory={true}
                      disabled={isDayFrozen}
                    />
                  </td>

                  <td className="p-2 border-r border-slate-100 align-middle w-[70px] text-center">
                    <input
                      type="checkbox"
                      checked={row.clientAmends}
                      onChange={(e) =>
                        handleUpdateRow(row.id, "clientAmends", e.target.checked)
                      }
                      className={`w-4 h-4 rounded text-[#12a0e1] focus:ring-[#12a0e1] ${
                        isDayFrozen
                          ? "opacity-50 cursor-not-allowed"
                          : "cursor-pointer"
                      }`}
                      disabled={isDayFrozen}
                    />
                  </td>

                  <td className="p-2 border-r border-slate-100 align-middle w-[140px]">
                    <textarea
                      value={row.moreInfo || ""}
                      onChange={(e) => handleUpdateRow(row.id, "moreInfo", e.target.value)}
                      placeholder="Notes…"
                      rows={2}
                      disabled={isDayFrozen}
                      className={`w-full text-[11px] bg-transparent border border-transparent rounded-lg px-2 py-1 resize-none transition-colors leading-relaxed placeholder:text-slate-300 ${
                        isDayFrozen
                          ? "text-slate-400 cursor-not-allowed"
                          : "text-slate-700 hover:border-slate-200 focus:border-[#12a0e1] focus:bg-[#12a0e1]/5 outline-none"
                      }`}
                    />
                  </td>

                  <td className="p-2 border-r border-slate-100 align-middle w-[50px] text-center">
                    <input
                      type="checkbox"
                      checked={row.is3D}
                      onChange={(e) =>
                        handleUpdateRow(row.id, "is3D", e.target.checked)
                      }
                      className={`w-4 h-4 rounded text-[#12a0e1] focus:ring-[#12a0e1] ${
                        isDayFrozen
                          ? "opacity-50 cursor-not-allowed"
                          : "cursor-pointer"
                      }`}
                      disabled={isDayFrozen}
                    />
                  </td>

                  <td className="p-2 border-r border-slate-100 align-middle w-[90px] text-center">
                    <TableSearchableSelect
                      options={TIME_OPTIONS}
                      value={row.timeSpent}
                      onChange={(val) => handleUpdateRow(row.id, "timeSpent", val)}
                      placeholder="none"
                      dropdownId={`time-${row.id}`}
                      activeDropdown={activeDropdown}
                      setActiveDropdown={setActiveDropdown}
                      isTime={true}
                      disabled={isDayFrozen}
                    />
                  </td>
                  <td className="p-2 align-middle w-[90px] text-center">
                    <TableSearchableSelect
                      options={TIME_OPTIONS}
                      value={row.additionalTime}
                      onChange={(val) =>
                        handleUpdateRow(row.id, "additionalTime", val)
                      }
                      placeholder="none"
                      dropdownId={`addTime-${row.id}`}
                      activeDropdown={activeDropdown}
                      setActiveDropdown={setActiveDropdown}
                      isTime={true}
                      disabled={isDayFrozen}
                    />
                  </td>
                </tr>
              ))}
              {/* Ghost Add Row */}
              {!isDayFrozen && (
                <tr
                  className="group/addrow border-t border-dashed border-slate-200 cursor-pointer"
                  onClick={handleAddRow}
                >
                  <td
                    colSpan={COLUMNS.length + 1}
                    className="px-4 py-3 text-center"
                  >
                    <span className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-300 group-hover/addrow:text-[#12a0e1] transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                      Add row
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {currentDayRows.length === 0 && !isPulling && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 w-full left-0 right-0 absolute">
              <RefreshCw className="w-10 h-10 mb-4 opacity-20" />
              <p className="text-sm font-bold text-slate-500 font-sans">
                No time logged for {activeDay}.
              </p>
              <p className="text-xs mt-1">Hit pull below to sync with Wrike.</p>
            </div>
          )}
        </div>

        {/* Bottom Action Bar */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex flex-wrap gap-3 justify-between items-center">
          <button
            onClick={handleOpenWrikeModal}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-[#1b202a] hover:bg-[#252a33] text-emerald-400 border border-[#2d3342] rounded-xl shadow-lg transition-all active:scale-95"
          >
            <LayoutList className="w-4 h-4" />
            Wrike Timesheets
          </button>
          <div className="flex gap-3 flex-wrap">
          <button
            onClick={handlePullTimes}
            disabled={isPulling || isDayFrozen}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold border rounded-xl shadow-lg transition-all ${
              isDayFrozen
                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-70"
                : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200 active:scale-95"
            }`}
          >
            <RefreshCw
              className={`w-4 h-4 ${
                isPulling ? "animate-spin text-[#12a0e1]" : ""
              }`}
            />
            {isPulling ? "Pulling..." : "Pull Wrike Times"}
          </button>

          <button
            onClick={handleCopyJSON}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl shadow-lg transition-all active:scale-95 ${
              jsonCopied
                ? "bg-[#1cc1a5] text-white shadow-[#1cc1a5]/30"
                : "bg-indigo-500 hover:bg-indigo-600 text-white shadow-indigo-500/30"
            }`}
          >
            {jsonCopied ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            {jsonCopied ? "JSON Copied!" : "Copy JSON"}
          </button>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 text-sm font-bold rounded-xl shadow-lg shadow-emerald-500/30 transition-all active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export to Excel
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}