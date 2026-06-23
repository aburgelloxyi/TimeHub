import React, { useState } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  Users,
  Briefcase,
  Plus,
  X,
  ArrowRight,
  UserCircle2,
  LayoutList,
  Film,
  ChevronDown,
  RefreshCw,
  GripVertical,
  CalendarDays,
  ListOrdered,
} from "lucide-react";

// --- IMPORT YOUR CONSTANTS ---
import { TERRITORY_FLAGS, MOTION_TEAM_NAME_MAP } from "../constants";

const TEAM_MEMBERS = [
  "Antonio",
  "Aaron",
  "Jacqui",
  "Maria",
  "Nicholas",
  "Luke",
  "Turk",
];

const TEAM_COLORS = {
  Antonio: {
    light: "bg-blue-50 text-blue-700 border-blue-100",
    solid: "bg-blue-500 hover:bg-blue-600 text-white",
  },
  Aaron: {
    light: "bg-emerald-50 text-emerald-700 border-emerald-100",
    solid: "bg-emerald-500 hover:bg-emerald-600 text-white",
  },
  Jacqui: {
    light: "bg-pink-50 text-pink-700 border-pink-100",
    solid: "bg-pink-500 hover:bg-pink-600 text-white",
  },
  Maria: {
    light: "bg-yellow-50 text-yellow-800 border-yellow-100",
    solid: "bg-yellow-500 hover:bg-yellow-600 text-yellow-900",
  },
  Nicholas: {
    light: "bg-purple-50 text-purple-700 border-purple-100",
    solid: "bg-purple-500 hover:bg-purple-600 text-white",
  },
  Luke: {
    light: "bg-orange-50 text-orange-700 border-orange-100",
    solid: "bg-orange-500 hover:bg-orange-600 text-white",
  },
  Turk: {
    light: "bg-cyan-50 text-cyan-700 border-cyan-100",
    solid: "bg-cyan-500 hover:bg-cyan-600 text-white",
  },
};

const INITIAL_CAMPAIGNS = [];

// --- EXTENDED FLAG DICTIONARY ---
const FALLBACK_FLAGS = {
  UAE: "🇦🇪",
  SPAIN: "🇪🇸",
  ES: "🇪🇸",
  GER: "🇩🇪",
  GERMANY: "🇩🇪",
  FRA: "🇫🇷",
  FRANCE: "🇫🇷",
  TW: "🇹🇼",
  TAIWAN: "🇹🇼",
  CZ: "🇨🇿",
  CZECH: "🇨🇿",
  AUSTRIA: "🇦🇹",
  PHILIPPINES: "🇵🇭",
  PH: "🇵🇭",
  AUS: "🇦🇺",
  AUSTRALIA: "🇦🇺",
  BRA: "🇧🇷",
  BRAZIL: "🇧🇷",
  UK: "🇬🇧",
  GB: "🇬🇧",
  INT: "🌍",
  INTL: "🌍",
  ROW: "🌐",
  LATAM: "🌎",
  MEX: "🇲🇽",
  MEXICO: "🇲🇽",
  ITA: "🇮🇹",
  ITALY: "🇮🇹",
  NETHERLANDS: "🇳🇱",
  NL: "🇳🇱",
  MALAYSIA: "🇲🇾",
  MY: "🇲🇾",
  INDIA: "🇮🇳",
  IN: "🇮🇳",
  SLOVAKIA: "🇸🇰",
  SK: "🇸🇰",
  SIN: "🇸🇬",
  SINGAPORE: "🇸🇬",
  IRE: "🇮🇪",
  IRELAND: "🇮🇪",
  UY: "🇺🇾",
  HUNGARY: "🇭🇺",
};

const getTerritoryData = (title) => {
  if (!title) return { name: "UNKNOWN", flag: "🎬" };

  const words = title.toUpperCase().split(/[\s\-_]+/);

  if (typeof TERRITORY_FLAGS !== "undefined" && TERRITORY_FLAGS) {
    for (const word of words) {
      if (TERRITORY_FLAGS[word]) {
        return { name: word, flag: TERRITORY_FLAGS[word] };
      }
    }
  }

  for (const word of words) {
    if (FALLBACK_FLAGS[word]) {
      return { name: word, flag: FALLBACK_FLAGS[word] };
    }
  }

  return { name: "GLOBAL", flag: "🎬" };
};

// --- HELPER: Dynamic Status Colors ---
const getTagStyle = (tag) => {
  const baseStyle =
    "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border whitespace-nowrap";

  if (!tag) return `${baseStyle} bg-slate-100 text-slate-500 border-slate-200`;

  const lowerTag = String(tag).toLowerCase();

  // New Statuses
  if (lowerTag.includes("to amend"))
    return `${baseStyle} bg-rose-50 text-rose-600 border-rose-200`;
  if (lowerTag.includes("render review"))
    return `${baseStyle} bg-indigo-50 text-indigo-600 border-indigo-200`;
  if (lowerTag.includes("revised"))
    return `${baseStyle} bg-teal-50 text-teal-600 border-teal-200`;

  // Existing Statuses
  if (lowerTag.includes("creative approved"))
    return `${baseStyle} bg-blue-50 text-blue-600 border-blue-200`;
  if (lowerTag.includes("content approved"))
    return `${baseStyle} bg-purple-50 text-purple-600 border-purple-200`;
  if (lowerTag.includes("client review") || lowerTag.includes("content review"))
    return `${baseStyle} bg-yellow-50 text-yellow-600 border-yellow-200`;
  if (lowerTag.includes("motion"))
    return `${baseStyle} bg-emerald-50 text-emerald-600 border-emerald-200`;
  if (lowerTag.includes("digital"))
    return `${baseStyle} bg-cyan-50 text-cyan-600 border-cyan-200`;
  if (lowerTag.includes("prep for delivery"))
    return `${baseStyle} bg-orange-50 text-orange-600 border-orange-200`;
  if (lowerTag === "delivering" || lowerTag === "delivery")
    return `${baseStyle} bg-yellow-100 text-yellow-700 border-yellow-400`;
  if (lowerTag.includes("on hold"))
    return `${baseStyle} bg-red-50 text-red-600 border-red-200`;
  if (lowerTag.includes("pm"))
    return `${baseStyle} bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200`;
  if (lowerTag.includes("backlog"))
    return `${baseStyle} bg-slate-100 text-slate-500 border-slate-200`;

  return `${baseStyle} bg-slate-100 text-slate-500 border-slate-200`;
};

// Extracted border style for task containers
const getBorderColorClass = (tag) => {
  if (!tag) return "border-l-slate-300";

  const lowerTag = String(tag).toLowerCase();

  // New Statuses
  if (lowerTag.includes("to amend")) return "border-l-rose-400";
  if (lowerTag.includes("render review")) return "border-l-indigo-400";
  if (lowerTag.includes("revised")) return "border-l-teal-400";

  // Existing Statuses
  if (lowerTag.includes("creative approved")) return "border-l-blue-400";
  if (lowerTag.includes("content approved")) return "border-l-purple-400";
  if (lowerTag.includes("client review") || lowerTag.includes("content review"))
    return "border-l-yellow-400";
  if (lowerTag.includes("motion")) return "border-l-emerald-400";
  if (lowerTag.includes("digital")) return "border-l-cyan-400";
  if (lowerTag.includes("prep for delivery")) return "border-l-orange-400";
  if (lowerTag === "delivering" || lowerTag === "delivery")
    return "border-l-yellow-500";
  if (lowerTag.includes("on hold")) return "border-l-red-400";
  if (lowerTag.includes("pm")) return "border-l-fuchsia-400";

  return "border-l-transparent";
};

// --- NEW HELPER: Status Sorting Engine ---
const sortTasksByStatus = (tasks) => {
  const getPriority = (tag) => {
    if (!tag) return 50;
    const t = tag.toLowerCase();

    // Ordered sequentially by standard workflow
    if (t.includes("to amend")) return 1;
    if (t.includes("motion")) return 2;
    if (t.includes("digital")) return 3;
    if (t.includes("revised")) return 4;
    if (t.includes("review")) return 5; // Catches Client, Content, and Render review
    if (t.includes("approved")) return 6;
    if (t.includes("prep")) return 7;
    if (t.includes("deliver")) return 8;
    if (t.includes("pm")) return 9;
    if (t.includes("backlog")) return 10;
    if (t.includes("on hold")) return 100; // Pushes 'On Hold' to the bottom

    return 50; // Everything else
  };

  return [...tasks].sort((a, b) => {
    // Primary Sort: Status Priority
    const pA = getPriority(a.tag);
    const pB = getPriority(b.tag);
    if (pA !== pB) return pA - pB;

    // Secondary Sort: Group by Campaign Name
    const campA = a.campaignName || "";
    const campB = b.campaignName || "";
    if (campA !== campB) return campA.localeCompare(campB);

    // Tertiary Sort: Alphabetical by Title
    return (a.title || "").localeCompare(b.title || "");
  });
};

export default function TodaysList({ wrikeData }) {
  const [campaigns, setCampaigns] = useState(INITIAL_CAMPAIGNS);
  const [assignments, setAssignments] = useState(
    TEAM_MEMBERS.reduce((acc, name) => ({ ...acc, [name]: [] }), {})
  );

  const [activeTaskId, setActiveTaskId] = useState(null);
  const [activeInputCampaignId, setActiveInputCampaignId] = useState(null);
  const [newSubtaskText, setNewSubtaskText] = useState("");
  const [newSubtaskTag, setNewSubtaskTag] = useState("Backlog");

  const [timeframe, setTimeframe] = useState("Today");
  const [isSyncing, setIsSyncing] = useState(false);

  // Mock Toast (Replace with actual if available)
  const triggerToast = (msg) => alert(msg);

  const TIMEFRAMES = ["Today", "Tomorrow", "Next Week"];

  // --- REPAIRED DRAG AND DROP HANDLER ---
  const onDragEnd = (result) => {
    const { source, destination } = result;

    if (!destination) return;

    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const newCampaigns = campaigns.map((camp) => ({
      ...camp,
      subtasks: [...camp.subtasks],
    }));
    const newAssignments = { ...assignments };
    for (const key in newAssignments) {
      newAssignments[key] = [...newAssignments[key]];
    }

    let movedTask;
    let sourceCampaignId = null;
    let sourceCampaignName = null;

    if (source.droppableId.startsWith("team-")) {
      const person = source.droppableId.replace("team-", "");
      movedTask = newAssignments[person][source.index];
      sourceCampaignId = movedTask.campaignId;
      sourceCampaignName = movedTask.campaignName;
      newAssignments[person].splice(source.index, 1);
    } else {
      const campIndex = newCampaigns.findIndex(
        (c) => c.id === source.droppableId
      );
      if (campIndex === -1) return;
      movedTask = newCampaigns[campIndex].subtasks[source.index];
      sourceCampaignId = newCampaigns[campIndex].id;
      sourceCampaignName = newCampaigns[campIndex].name;
      newCampaigns[campIndex].subtasks.splice(source.index, 1);
    }

    if (!movedTask) return;

    const taskToInsert = { ...movedTask };
    taskToInsert.campaignId = sourceCampaignId;
    taskToInsert.campaignName = sourceCampaignName;

    if (destination.droppableId.startsWith("team-")) {
      const person = destination.droppableId.replace("team-", "");
      newAssignments[person].splice(destination.index, 0, taskToInsert);
    } else {
      const campIndex = newCampaigns.findIndex(
        (c) => c.id === destination.droppableId
      );
      if (campIndex === -1) return;
      const { campaignName, campaignId, ...cleanTask } = taskToInsert;
      newCampaigns[campIndex].subtasks.splice(destination.index, 0, cleanTask);
    }

    setCampaigns(newCampaigns);
    setAssignments(newAssignments);
  };

  const handleAssign = (campaignId, taskId, personName) => {
    let taskToMove;
    const newCampaigns = campaigns.map((camp) => {
      if (camp.id === campaignId) {
        taskToMove = camp.subtasks.find((t) => t.id === taskId);
        return {
          ...camp,
          subtasks: camp.subtasks.filter((t) => t.id !== taskId),
        };
      }
      return camp;
    });

    if (!taskToMove) return;
    const campaignName = campaigns.find((c) => c.id === campaignId).name;

    setCampaigns(newCampaigns);
    setAssignments((prev) => ({
      ...prev,
      [personName]: [
        ...prev[personName],
        { ...taskToMove, campaignId, campaignName },
      ],
    }));
    setActiveTaskId(null);
  };

  const handleUnassign = (taskId, personName, campaignId) => {
    const taskToMove = assignments[personName].find((t) => t.id === taskId);
    if (!taskToMove) return;

    setAssignments((prev) => ({
      ...prev,
      [personName]: prev[personName].filter((t) => t.id !== taskId),
    }));

    setCampaigns((prev) => {
      const exists = prev.find((c) => c.id === campaignId);
      const subtaskToReturn = {
        id: taskToMove.id,
        title: taskToMove.title,
        tag: taskToMove.tag,
        customStatusId: taskToMove.customStatusId, // Retain for sync
        permalink: taskToMove.permalink,
      };

      if (exists) {
        return prev.map((camp) =>
          camp.id === campaignId
            ? { ...camp, subtasks: [...camp.subtasks, subtaskToReturn] }
            : camp
        );
      } else {
        return [
          ...prev,
          {
            id: campaignId,
            name: taskToMove.campaignName,
            subtasks: [subtaskToReturn],
          },
        ];
      }
    });
  };

  const handleAddSubtask = (campaignId) => {
    if (!newSubtaskText.trim()) return;
    const newTask = {
      id: `task-${Date.now()}`,
      title: newSubtaskText.trim(),
      tag: newSubtaskTag,
      permalink: null,
    };
    setCampaigns(
      campaigns.map((camp) => {
        if (camp.id === campaignId) {
          return { ...camp, subtasks: [...camp.subtasks, newTask] };
        }
        return camp;
      })
    );
    setNewSubtaskText("");
    setActiveInputCampaignId(null);
  };

  // --- MANUAL COLUMN SORTER ---
  const handleSortColumn = (person) => {
    setAssignments((prev) => ({
      ...prev,
      [person]: sortTasksByStatus(prev[person]),
    }));
    triggerToast(`Sorted ${person}'s jobs by status!`);
  };

  // --- LITE SYNC HANDLER ---
  const handleLiteSync = async () => {
    const token = localStorage.getItem("wrike_personal_token");
    if (!token) {
      triggerToast("No Wrike token found. Please set it in the API tab.");
      return;
    }

    let taskIds = [];

    // Add Backlog IDs
    campaigns.forEach((camp) => {
      camp.subtasks.forEach((t) => {
        if (t.id && !String(t.id).startsWith("task-")) taskIds.push(t.id);
      });
    });

    // Add Assigned IDs
    Object.values(assignments).forEach((taskList) => {
      taskList.forEach((t) => {
        if (t.id && !String(t.id).startsWith("task-")) taskIds.push(t.id);
      });
    });

    if (taskIds.length === 0) {
      triggerToast("No Wrike tasks on the board to sync.");
      return;
    }

    setIsSyncing(true);

    try {
      const chunkedIds = [];
      for (let i = 0; i < taskIds.length; i += 100) {
        chunkedIds.push(taskIds.slice(i, i + 100));
      }

      let freshWrikeData = [];

      for (const chunk of chunkedIds) {
        const res = await fetch(
          `https://www.wrike.com/api/v4/tasks/${chunk.join(",")}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const json = await res.json();
        if (json.data) {
          freshWrikeData = [...freshWrikeData, ...json.data];
        }
      }

      const getReadableStatus = (customStatusId, fallbackStatus) => {
        if (!customStatusId) return fallbackStatus;
        if (wrikeData && wrikeData.length > 0) {
          const match = wrikeData.find(
            (t) => t.customStatusId === customStatusId
          );
          return match && match.customStatusName
            ? match.customStatusName
            : fallbackStatus;
        }
        return fallbackStatus;
      };

      // 1. Update Backlog
      setCampaigns((prevCamps) =>
        prevCamps.map((camp) => ({
          ...camp,
          subtasks: camp.subtasks.map((task) => {
            const freshTask = freshWrikeData.find((w) => w.id === task.id);
            if (freshTask) {
              return {
                ...task,
                tag: getReadableStatus(
                  freshTask.customStatusId,
                  freshTask.status
                ),
                customStatusId: freshTask.customStatusId,
              };
            }
            return task;
          }),
        }))
      );

      // 2. Update Assignments
      setAssignments((prevAssignments) => {
        const newAssignments = {};
        for (const [person, tasks] of Object.entries(prevAssignments)) {
          newAssignments[person] = tasks.map((task) => {
            const freshTask = freshWrikeData.find((w) => w.id === task.id);
            if (freshTask) {
              return {
                ...task,
                tag: getReadableStatus(
                  freshTask.customStatusId,
                  freshTask.status
                ),
                customStatusId: freshTask.customStatusId,
              };
            }
            return task;
          });
        }
        return newAssignments;
      });

      triggerToast("Board synced instantly with live Wrike statuses!");
    } catch (err) {
      console.error(err);
      triggerToast("Failed to run Lite Sync: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAutoAssign = (targetTimeframe = timeframe) => {
    if (!wrikeData || wrikeData.length === 0) {
      alert("No Wrike data available to assign! Please fetch data first.");
      return;
    }

    const freshAssignments = TEAM_MEMBERS.reduce(
      (acc, name) => ({ ...acc, [name]: [] }),
      {}
    );
    const freshBacklog = {};
    let teamTasksAssigned = 0;
    let backlogTasksAssigned = 0;

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    let minDate, maxDate;

    if (targetTimeframe === "Today") {
      minDate = new Date(0);
      maxDate = new Date(now);
      maxDate.setHours(23, 59, 59, 999);
    } else if (targetTimeframe === "Tomorrow") {
      minDate = new Date(now);
      minDate.setDate(now.getDate() + 1);
      maxDate = new Date(minDate);
      maxDate.setHours(23, 59, 59, 999);
    } else if (targetTimeframe === "Next Week") {
      minDate = new Date(now);
      minDate.setDate(now.getDate() + 2);
      maxDate = new Date(now);
      maxDate.setDate(now.getDate() + 8);
      maxDate.setHours(23, 59, 59, 999);
    }

    wrikeData.forEach((task) => {
      if (task.status !== "Active") return;
      if (!task.dueDate || task.dueDate === "No Due Date") return;

      const taskDate = new Date(task.dueDate);
      if (isNaN(taskDate.getTime())) return;

      if (taskDate < minDate || taskDate > maxDate) return;

      const wrikeLink =
        task.permalink || `https://www.wrike.com/open.htm?id=${task.id}`;

      if (task.assignees) {
        if (task.assignees.includes("Riccardo")) {
          const campId = task.parentIds?.[0] || "camp-misc";
          const campName = task.projectName || "Misc / Uncategorized";

          if (!freshBacklog[campId]) {
            freshBacklog[campId] = { id: campId, name: campName, subtasks: [] };
          }
          freshBacklog[campId].subtasks.push({
            id: task.id,
            title: task.title,
            tag: task.customStatusName || "Backlog",
            customStatusId: task.customStatusId, // Retain for sync
            permalink: wrikeLink,
          });
          backlogTasksAssigned++;
        } else {
          Object.keys(MOTION_TEAM_NAME_MAP).forEach((wrikeFullName) => {
            if (task.assignees.includes(wrikeFullName)) {
              const teamBoardName = MOTION_TEAM_NAME_MAP[wrikeFullName];
              if (freshAssignments[teamBoardName]) {
                freshAssignments[teamBoardName].push({
                  id: task.id,
                  title: task.title,
                  campaignId: task.parentIds?.[0] || "unknown",
                  campaignName: task.projectName || "Wrike Import",
                  tag: task.customStatusName || "Wrike",
                  customStatusId: task.customStatusId, // Retain for sync
                  permalink: wrikeLink,
                });
                teamTasksAssigned++;
              }
            }
          });
        }
      }
    });

    // Auto-Sort the arrays before pushing them to state
    for (const key in freshAssignments) {
      freshAssignments[key] = sortTasksByStatus(freshAssignments[key]);
    }

    setAssignments(freshAssignments);
    setCampaigns(Object.values(freshBacklog));
  };

  return (
    <div className="min-h-screen bg-slate-100 text-[#122027] font-sans selection:bg-[#12a0e1]/30 selection:text-[#122027] pb-12">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 pt-8 space-y-6">
        <header className="bg-white shadow-sm border border-[#dce4ec] rounded-[2rem] p-6 sm:px-8 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-5 relative overflow-hidden">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-[#12a0e1] to-[#1cc1a5] p-3.5 rounded-2xl text-white shadow-lg shadow-[#12a0e1]/20">
              <CalendarDays className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-[#122027] tracking-tight">
                {timeframe}'s List
              </h1>
              <p className="text-[#768994] text-sm font-medium mt-0.5">
                Motioners Tasks Allocation
              </p>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-4 lg:items-center w-full xl:w-auto">
            <div className="flex bg-slate-100/50 p-1.5 rounded-xl border border-[#dce4ec]">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  onClick={() => {
                    setTimeframe(tf);
                    handleAutoAssign(tf);
                  }}
                  className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                    timeframe === tf
                      ? "bg-white text-[#12a0e1] shadow-sm ring-1 ring-black/5"
                      : "text-[#768994] hover:text-[#122027] hover:bg-white/40"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            <div className="h-6 w-px bg-[#dce4ec] hidden lg:block"></div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleLiteSync}
                disabled={isSyncing}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[#dce4ec] text-[#768994] hover:text-[#12a0e1] hover:border-[#12a0e1]/30 rounded-xl transition-all shadow-sm font-bold text-sm disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    isSyncing ? "animate-spin text-[#12a0e1]" : ""
                  }`}
                />
                {isSyncing ? "Syncing..." : "Sync Statuses"}
              </button>

              <button
                onClick={() => handleAutoAssign(timeframe)}
                className="flex items-center justify-center gap-2 bg-[#122027] hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-sm active:scale-95"
              >
                <LayoutList className="w-4 h-4" />
                Auto-Assign {timeframe}
              </button>
            </div>
          </div>
        </header>

        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* --- LEFT COLUMN: RICCARDO'S PLAYGROUND --- */}
            <div className="xl:col-span-3 flex flex-col max-h-[calc(100vh-220px)] mb-8 bg-white rounded-3xl border border-[#dce4ec] shadow-xl shadow-slate-200/40 overflow-hidden relative">
              <div className="absolute inset-x-0 top-0 h-1.5 bg-[#12a0e1] z-10"></div>

              <div className="p-5 pt-6 border-b border-[#dce4ec] bg-slate-50/50 flex items-center gap-2.5 shrink-0">
                <LayoutList className="w-4 h-4 text-[#12a0e1]" />
                <h2 className="text-lg font-black text-[#122027] tracking-tight">
                  Riccardo's Playground
                </h2>
              </div>

              <div className="p-5 flex-1 overflow-y-auto space-y-4 bg-[#f8fafc]/40 scrollbar-thin">
                {campaigns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-[#768994]">
                    <p className="text-sm font-bold">No backlog campaigns.</p>
                    <p className="text-xs mt-1 text-center px-4">
                      Hit auto-assign to pull Riccardo's Wrike jobs.
                    </p>
                  </div>
                ) : (
                  campaigns.map((campaign) => (
                    <div
                      key={campaign.id}
                      className="bg-white border border-[#dce4ec] rounded-2xl shadow-sm overflow-hidden"
                    >
                      <div className="flex items-center gap-2 px-3.5 py-3 bg-slate-50/80 border-b border-[#dce4ec]">
                        <Film className="w-4 h-4 text-[#12a0e1] shrink-0" />
                        <h3 className="text-[11px] font-black text-[#122027] uppercase tracking-wider truncate max-w-[75%]">
                          {campaign.name}
                        </h3>
                        <span className="ml-auto bg-white text-[#768994] text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border border-[#dce4ec]">
                          {campaign.subtasks.length}
                        </span>
                      </div>

                      {/* CAMPAIGN DROPPABLE ZONE */}
                      <Droppable droppableId={campaign.id}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`divide-y divide-slate-100 min-h-[50px] transition-colors ${
                              snapshot.isDraggingOver ? "bg-[#12a0e1]/5" : ""
                            }`}
                          >
                            {campaign.subtasks.map((task, index) => {
                              const terr = getTerritoryData(task.title);
                              const borderColor = getBorderColorClass(task.tag);

                              return (
                                /* DRAGGABLE BACKLOG TASK */
                                <Draggable
                                  key={task.id}
                                  draggableId={task.id}
                                  index={index}
                                >
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      className={`p-3 border-l-4 border-y border-r border-y-transparent border-r-transparent ${borderColor} hover:border-y-slate-200 hover:border-r-slate-200 hover:bg-slate-50 transition-colors group/task ${
                                        snapshot.isDragging
                                          ? "bg-white shadow-xl scale-[1.02] z-50 ring-2 ring-[#12a0e1] rounded-lg"
                                          : ""
                                      }`}
                                    >
                                      <div className="flex justify-between items-center gap-2 mb-2">
                                        <span className={getTagStyle(task.tag)}>
                                          {task.tag}
                                        </span>
                                      </div>

                                      <div className="flex justify-between items-start gap-2 mb-1.5">
                                        <div className="flex gap-2 items-start">
                                          {/* DRAG HANDLE ICON */}
                                          <div
                                            {...provided.dragHandleProps}
                                            className="mt-0.5 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors"
                                          >
                                            <GripVertical className="w-4 h-4" />
                                          </div>
                                          {terr && (
                                            <span
                                              className="text-base leading-none shrink-0"
                                              title={terr.name}
                                            >
                                              {terr.flag}
                                            </span>
                                          )}
                                          <div className="flex flex-col justify-center">
                                            {task.permalink ? (
                                              <a
                                                href={task.permalink}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-xs font-bold text-[#122027] hover:text-[#12a0e1] leading-snug pr-1 transition-colors hover:underline underline-offset-2"
                                              >
                                                {task.title}
                                              </a>
                                            ) : (
                                              <p className="text-xs font-bold text-[#122027] leading-snug pr-1">
                                                {task.title}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {activeTaskId === task.id ? (
                                        <div className="mt-3 pt-3 border-t border-slate-100 animate-in fade-in duration-150">
                                          <p className="text-[9px] text-[#768994] font-black uppercase tracking-widest mb-2">
                                            Assign to:
                                          </p>
                                          <div className="flex flex-wrap gap-1.5">
                                            {TEAM_MEMBERS.map((name) => (
                                              <button
                                                key={name}
                                                onClick={() =>
                                                  handleAssign(
                                                    campaign.id,
                                                    task.id,
                                                    name
                                                  )
                                                }
                                                className={`text-[10px] px-2.5 py-1 rounded-lg font-black uppercase tracking-wider transition-all hover:scale-105 shadow-sm border ${TEAM_COLORS[name].solid}`}
                                              >
                                                {name}
                                              </button>
                                            ))}
                                          </div>
                                          <button
                                            onClick={() =>
                                              setActiveTaskId(null)
                                            }
                                            className="w-full mt-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 py-1.5 rounded-lg transition-colors"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex justify-end opacity-0 group-hover/task:opacity-100 transition-opacity">
                                          <button
                                            onClick={() =>
                                              setActiveTaskId(task.id)
                                            }
                                            className="text-[10px] font-black uppercase tracking-widest text-[#12a0e1] flex items-center gap-1 hover:text-[#0f88c0] transition-colors mt-1"
                                          >
                                            Assign{" "}
                                            <ArrowRight className="w-3 h-3" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </Draggable>
                              );
                            })}
                            {provided.placeholder}

                            {/* Add Subtask Input Area */}
                            <div className="p-2 bg-slate-50/50 border-t border-[#dce4ec]">
                              {activeInputCampaignId === campaign.id ? (
                                <div className="flex items-center gap-1.5 animate-in slide-in-from-top-1 duration-150">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={newSubtaskText}
                                    onChange={(e) =>
                                      setNewSubtaskText(e.target.value)
                                    }
                                    onKeyDown={(e) =>
                                      e.key === "Enter" &&
                                      handleAddSubtask(campaign.id)
                                    }
                                    placeholder="Subtask name"
                                    className="flex-1 min-w-0 bg-white border border-[#dce4ec] text-[#122027] placeholder:text-[#768994] focus:border-[#12a0e1] focus:ring-2 focus:ring-[#12a0e1]/20 rounded-lg px-2.5 py-1.5 text-xs outline-none shadow-sm transition-all"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setNewSubtaskTag(
                                        newSubtaskTag === "Backlog"
                                          ? "Motion"
                                          : "Backlog"
                                      )
                                    }
                                    className={
                                      getTagStyle(newSubtaskTag) +
                                      " cursor-pointer hover:opacity-80 py-2 w-[70px] flex justify-center items-center"
                                    }
                                  >
                                    {newSubtaskTag}
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleAddSubtask(campaign.id)
                                    }
                                    className="bg-[#122027] hover:bg-[#1a2d37] text-white p-1.5 rounded-lg transition-colors shadow-md flex items-center justify-center shrink-0"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setActiveInputCampaignId(campaign.id);
                                    setNewSubtaskText("");
                                    setNewSubtaskTag("Backlog");
                                  }}
                                  className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-[#768994] hover:bg-slate-200/50 hover:text-[#122027] transition-all"
                                >
                                  <Plus className="w-3 h-3 text-[#12a0e1]" />{" "}
                                  Add Subtask
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </Droppable>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* --- RIGHT COLUMN: TEAM ASSIGNMENTS --- */}
            <div className="xl:col-span-9 flex flex-col gap-6 mb-8">
              <div className="bg-white rounded-3xl border border-[#dce4ec] shadow-xl shadow-slate-200/40 overflow-hidden flex flex-col max-h-[calc(100vh-220px)] relative">
                <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#12a0e1] to-[#1cc1a5] z-10"></div>

                <div className="p-5 pt-6 border-b border-[#dce4ec] bg-slate-50/50 flex justify-between items-center shrink-0">
                  <h2 className="text-lg font-black text-[#122027] tracking-tight">
                    ✨ Team Lineup
                  </h2>
                </div>

                <div className="p-6 flex-1 overflow-y-auto bg-[#f8fafc]/40 grid grid-cols-1 md:grid-cols-2 gap-6 items-start auto-rows-max scrollbar-thin">
                  {TEAM_MEMBERS.map((person) => (
                    <div
                      key={person}
                      className="bg-white rounded-2xl border border-[#dce4ec] overflow-hidden shadow-sm hover:shadow-md transition-all"
                    >
                      <div
                        className={`p-3.5 border-b border-slate-100 flex justify-between items-center ${TEAM_COLORS[person].light}`}
                      >
                        <div className="flex items-center gap-2">
                          <UserCircle2 className="w-5 h-5 opacity-80" />
                          <span className="font-black text-lg tracking-tight">
                            {person}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSortColumn(person)}
                            className="p-1 text-slate-500 hover:text-[#12a0e1] hover:bg-white rounded-md transition-colors border border-transparent hover:border-[#12a0e1]/20 shadow-sm opacity-60 hover:opacity-100"
                            title="Group & Sort by Status"
                          >
                            <ListOrdered className="w-4 h-4" />
                          </button>
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/80 backdrop-blur-sm shadow-sm text-slate-700 border border-black/5">
                            {assignments[person].length}{" "}
                            {assignments[person].length === 1 ? "job" : "jobs"}
                          </span>
                        </div>
                      </div>

                      {/* TEAM MEMBER DROPPABLE ZONE */}
                      <Droppable droppableId={`team-${person}`}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`p-3 bg-white min-h-[100px] space-y-2 transition-all ${
                              snapshot.isDraggingOver
                                ? "bg-slate-50 shadow-inner ring-2 ring-inset ring-[#12a0e1]/30"
                                : ""
                            }`}
                          >
                            {assignments[person].length === 0 &&
                            !snapshot.isDraggingOver ? (
                              <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                                <p className="text-xs font-medium italic">
                                  No active jobs assigned
                                </p>
                              </div>
                            ) : (
                              assignments[person].map((task, index) => {
                                const terr = getTerritoryData(task.title);
                                const borderColor = getBorderColorClass(
                                  task.tag
                                );

                                return (
                                  <Draggable
                                    key={task.id}
                                    draggableId={task.id}
                                    index={index}
                                  >
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        className={`group relative bg-slate-50/60 p-4 rounded-xl border border-slate-200/80 border-l-[5px] ${borderColor} flex flex-col hover:border-y-[#12a0e1]/40 hover:border-r-[#12a0e1]/40 hover:bg-white hover:shadow-md transition-all ${
                                          snapshot.isDragging
                                            ? "bg-white shadow-2xl scale-105 z-50 ring-2 ring-[#1cc1a5]"
                                            : ""
                                        }`}
                                      >
                                        <div className="flex items-start gap-3 w-full">
                                          {/* 1. DRAG HANDLE */}

                                          {/* 2. CONTENT WRAPPER */}
                                          <div className="flex-1 min-w-0 flex flex-col">
                                            {/* TOP ROW: Title info vs Status Pill */}
                                            <div className="flex justify-between items-start gap-4 mb-1">
                                              <div className="flex flex-col min-w-0">
                                                <p className="text-[10px] font-black uppercase text-[#12a0e1] tracking-widest line-clamp-1 mb-1.5 pr-6">
                                                  {task.campaignName}
                                                </p>
                                                <div className="flex items-start gap-1.5">
                                                  {terr && (
                                                    <span
                                                      className="text-base leading-none mt-0.5 shrink-0"
                                                      title={terr.name}
                                                    >
                                                      {terr.flag}
                                                    </span>
                                                  )}
                                                  {task.permalink ? (
                                                    <a
                                                      href={task.permalink}
                                                      target="_blank"
                                                      rel="noreferrer"
                                                      className="text-base font-black text-[#122027] hover:text-[#12a0e1] leading-tight transition-colors hover:underline underline-offset-2 break-words"
                                                    >
                                                      {task.title}
                                                    </a>
                                                  ) : (
                                                    <p className="text-base font-black text-[#122027] leading-tight break-words">
                                                      {task.title}
                                                    </p>
                                                  )}
                                                </div>
                                              </div>

                                              {/* STATUS PILL (Right) */}
                                              <div className="shrink-0 mt-0.5">
                                                <span
                                                  className={getTagStyle(
                                                    task.tag
                                                  )}
                                                >
                                                  {task.tag}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        </div>

                                        {/* UNASSIGN BUTTON (Absolute positioned, visible on hover) */}
                                        <button
                                          onClick={() =>
                                            handleUnassign(
                                              task.id,
                                              person,
                                              task.campaignId
                                            )
                                          }
                                          className="absolute top-2.5 right-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-150 shadow-sm border border-transparent hover:border-rose-100"
                                          title="Remove Job Allocation"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    )}
                                  </Draggable>
                                );
                              })
                            )}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </DragDropContext>
      </div>
    </div>
  );
}
