import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  LayoutList,
  Film,
  CalendarDays,
  Paperclip,
  ChevronDown,
} from "lucide-react";
import { TERRITORY_FLAGS, MOTION_TEAM_NAME_MAP } from "../constants";
import { supabase } from "../lib/supabaseClient";
import { useMotionBoardTasks } from "../hooks/useMotionBoardTasks";
import PageHeader, { pageHeaderActionClass } from "./shared/PageHeader";
import TaskDetailModal, { FilePreviewLightbox } from "./TaskDetailModal";

const TEAM_MEMBERS = ["Antonio", "Aaron", "Jacqui", "Maria", "Nicholas", "Luke", "Turk"];

const TEAM_COLORS = {
  Antonio: { light: "bg-blue-50 text-blue-700 border-blue-100",     solid: "bg-blue-500 hover:bg-blue-600 text-white" },
  Aaron:   { light: "bg-emerald-50 text-emerald-700 border-emerald-100", solid: "bg-emerald-500 hover:bg-emerald-600 text-white" },
  Jacqui:  { light: "bg-pink-50 text-pink-700 border-pink-100",     solid: "bg-pink-500 hover:bg-pink-600 text-white" },
  Maria:   { light: "bg-yellow-50 text-yellow-800 border-yellow-100", solid: "bg-yellow-500 hover:bg-yellow-600 text-yellow-900" },
  Nicholas:{ light: "bg-purple-50 text-purple-700 border-purple-100", solid: "bg-purple-500 hover:bg-purple-600 text-white" },
  Luke:    { light: "bg-orange-50 text-orange-700 border-orange-100", solid: "bg-orange-500 hover:bg-orange-600 text-white" },
  Turk:    { light: "bg-cyan-50 text-cyan-700 border-cyan-100",     solid: "bg-cyan-500 hover:bg-cyan-600 text-white" },
};

const INITIAL_CAMPAIGNS = [];

const FALLBACK_FLAGS = {
  UAE: "🇦🇪", SPAIN: "🇪🇸", ES: "🇪🇸", GER: "🇩🇪", GERMANY: "🇩🇪",
  FRA: "🇫🇷", FRANCE: "🇫🇷", TW: "🇹🇼", TAIWAN: "🇹🇼", CZ: "🇨🇿",
  CZECH: "🇨🇿", AUSTRIA: "🇦🇹", PHILIPPINES: "🇵🇭", PH: "🇵🇭",
  AUS: "🇦🇺", AUSTRALIA: "🇦🇺", BRA: "🇧🇷", BRAZIL: "🇧🇷",
  UK: "🇬🇧", GB: "🇬🇧", INT: "🌍", INTL: "🌍", ROW: "🌐", LATAM: "🌎",
  MEX: "🇲🇽", MEXICO: "🇲🇽", ITA: "🇮🇹", ITALY: "🇮🇹",
  NETHERLANDS: "🇳🇱", NL: "🇳🇱", MALAYSIA: "🇲🇾", MY: "🇲🇾",
  INDIA: "🇮🇳", IN: "🇮🇳", SLOVAKIA: "🇸🇰", SK: "🇸🇰",
  SIN: "🇸🇬", SINGAPORE: "🇸🇬", IRE: "🇮🇪", IRELAND: "🇮🇪",
  UY: "🇺🇾", HUNGARY: "🇭🇺",
};

const getTerritoryData = (title) => {
  if (!title) return { name: "UNKNOWN", flag: "🎬" };
  const words = title.toUpperCase().split(/[\s\-_]+/);
  if (typeof TERRITORY_FLAGS !== "undefined" && TERRITORY_FLAGS) {
    for (const word of words) {
      if (TERRITORY_FLAGS[word]) return { name: word, flag: TERRITORY_FLAGS[word] };
    }
  }
  for (const word of words) {
    if (FALLBACK_FLAGS[word]) return { name: word, flag: FALLBACK_FLAGS[word] };
  }
  return { name: "GLOBAL", flag: "🎬" };
};

const getTagStyle = (tag) => {
  const base = "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border whitespace-nowrap";
  if (!tag) return `${base} bg-slate-100 text-slate-500 border-slate-200`;
  const t = String(tag).toLowerCase();
  if (t.includes("to amend"))          return `${base} bg-rose-50 text-rose-600 border-rose-200`;
  if (t.includes("render review"))     return `${base} bg-indigo-50 text-indigo-600 border-indigo-200`;
  if (t.includes("revised"))           return `${base} bg-teal-50 text-teal-600 border-teal-200`;
  if (t.includes("creative approved")) return `${base} bg-blue-50 text-blue-600 border-blue-200`;
  if (t.includes("content approved"))  return `${base} bg-purple-50 text-purple-600 border-purple-200`;
  if (t.includes("client review") || t.includes("content review")) return `${base} bg-yellow-50 text-yellow-600 border-yellow-200`;
  if (t.includes("motion"))            return `${base} bg-emerald-50 text-emerald-600 border-emerald-200`;
  if (t.includes("digital"))           return `${base} bg-cyan-50 text-cyan-600 border-cyan-200`;
  if (t.includes("prep for delivery")) return `${base} bg-orange-50 text-orange-600 border-orange-200`;
  if (t === "delivering" || t === "delivery") return `${base} bg-yellow-100 text-yellow-700 border-yellow-400`;
  if (t.includes("on hold"))           return `${base} bg-red-50 text-red-600 border-red-200`;
  if (t.includes("pm"))                return `${base} bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200`;
  if (t.includes("backlog"))           return `${base} bg-slate-100 text-slate-500 border-slate-200`;
  return `${base} bg-slate-100 text-slate-500 border-slate-200`;
};

const getBorderColorClass = (tag) => {
  if (!tag) return "border-l-slate-300";
  const t = String(tag).toLowerCase();
  if (t.includes("to amend"))          return "border-l-rose-400";
  if (t.includes("render review"))     return "border-l-indigo-400";
  if (t.includes("revised"))           return "border-l-teal-400";
  if (t.includes("creative approved")) return "border-l-blue-400";
  if (t.includes("content approved"))  return "border-l-purple-400";
  if (t.includes("client review") || t.includes("content review")) return "border-l-yellow-400";
  if (t.includes("motion"))            return "border-l-emerald-400";
  if (t.includes("digital"))           return "border-l-cyan-400";
  if (t.includes("prep for delivery")) return "border-l-orange-400";
  if (t === "delivering" || t === "delivery") return "border-l-yellow-500";
  if (t.includes("on hold"))           return "border-l-red-400";
  if (t.includes("pm"))                return "border-l-fuchsia-400";
  return "border-l-transparent";
};

const sortTasksByStatus = (tasks) => {
  const getPriority = (tag) => {
    if (!tag) return 50;
    const t = tag.toLowerCase();
    if (t.includes("to amend"))  return 1;
    if (t.includes("motion"))    return 2;
    if (t.includes("digital"))   return 3;
    if (t.includes("revised"))   return 4;
    if (t.includes("review"))    return 5;
    if (t.includes("approved"))  return 6;
    if (t.includes("prep"))      return 7;
    if (t.includes("deliver"))   return 8;
    if (t.includes("pm"))        return 9;
    if (t.includes("backlog"))   return 10;
    if (t.includes("on hold"))   return 100;
    return 50;
  };
  return [...tasks].sort((a, b) => {
    const pA = getPriority(a.tag), pB = getPriority(b.tag);
    if (pA !== pB) return pA - pB;
    const cA = a.campaignName || "", cB = b.campaignName || "";
    if (cA !== cB) return cA.localeCompare(cB);
    return (a.title || "").localeCompare(b.title || "");
  });
};

// Resolve a usable MIME type for a Wrike attachment (its download response is
// often application/octet-stream, which makes the browser show a blank page).
function mimeForAttachment(att) {
  if (att.contentType && att.contentType !== "application/octet-stream") return att.contentType;
  const ext = (att.name || "").split(".").pop().toLowerCase();
  const MAP = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", bmp: "image/bmp", tiff: "image/tiff",
    svg: "image/svg+xml", mp4: "video/mp4", mov: "video/quicktime", txt: "text/plain",
  };
  return MAP[ext] || "application/octet-stream";
}

function attachmentKind(att) {
  const mime = mimeForAttachment(att);
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  return "other";
}

function AttachmentThumb({ attachment, large = false, onPreview }) {
  const [loading, setLoading] = useState(false);
  const ext = (attachment.name || "").split(".").pop().toLowerCase();
  const dim = large ? "w-24 h-24" : "w-14 h-14";
  const kind = attachmentKind(attachment);

  const { icon, bg } = kind === "pdf"
    ? { icon: "📄", bg: "bg-red-50 border-red-200" }
    : kind === "image"
    ? { icon: "🖼️", bg: "bg-sky-50 border-sky-200" }
    : kind === "video"
    ? { icon: "🎬", bg: "bg-purple-50 border-purple-200" }
    : ["psd","ai","eps","aep","prproj"].includes(ext)
    ? { icon: "🎨", bg: "bg-orange-50 border-orange-200" }
    : ["zip","rar","7z"].includes(ext)
    ? { icon: "📦", bg: "bg-slate-100 border-slate-200" }
    : ["doc","docx","txt"].includes(ext)
    ? { icon: "📝", bg: "bg-blue-50 border-blue-200" }
    : ["xls","xlsx","csv"].includes(ext)
    ? { icon: "📊", bg: "bg-green-50 border-green-200" }
    : { icon: "📎", bg: "bg-slate-50 border-slate-200" };

  // The /tasks/{id}/attachments objects don't carry a usable `url`; build the
  // documented download endpoint from the attachment id instead.
  const downloadUrl = `/api/wrike/attachments/${attachment.id}/download`;

  const handleOpen = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const raw = await res.blob();
      // Re-type the blob so the browser knows how to render it
      const typed = new Blob([raw], { type: mimeForAttachment(attachment) });
      const obj = URL.createObjectURL(typed);
      onPreview?.({ url: obj, name: attachment.name, kind, isObjectUrl: true });
    } catch (err) {
      console.warn("Attachment preview failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleOpen}
      title={attachment.name}
      className={`relative shrink-0 ${dim} rounded-xl border ${bg} flex flex-col items-center justify-center gap-1 hover:shadow-md hover:scale-105 transition-all`}
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-slate-300 border-t-[#12a0e1] rounded-full animate-spin" />
      ) : (
        <>
          <span className={large ? "text-3xl" : "text-xl"}>{icon}</span>
          <span className="text-[7px] font-black text-slate-400 uppercase tracking-wide px-1 text-center leading-none">
            {(ext || "file").slice(0, 6)}
          </span>
        </>
      )}
    </button>
  );
}

export default function TodaysList({ wrikeData, triggerToast: _triggerToast }) {
  const triggerToast = _triggerToast ?? ((msg) => console.warn("Toast:", msg));
  const { boardTasks } = useMotionBoardTasks();

  const [campaigns, setCampaigns] = useState(INITIAL_CAMPAIGNS);
  const [assignments, setAssignments] = useState(
    TEAM_MEMBERS.reduce((acc, name) => ({ ...acc, [name]: [] }), {})
  );
  const [timeframe, setTimeframe] = useState("Today");
  const [focusedPerson, setFocusedPerson] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const saveTimeout = useRef(null);

  const [taskAttachments, setTaskAttachments] = useState({});
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [showFilesPanel, setShowFilesPanel] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewAttachments, setPreviewAttachments] = useState([]);

  // Revoke the object URL when the preview closes / changes
  useEffect(() => {
    return () => {
      if (previewFile?.isObjectUrl) URL.revokeObjectURL(previewFile.url);
    };
  }, [previewFile]);

  const TIMEFRAMES = ["Today", "Tomorrow", "Next Week"];

  // ── Board persistence ─────────────────────────────────────────────────────
  // Load saved board state from Supabase on mount
  useEffect(() => {
    supabase.from("canvas_pinned_campaigns")
      .select("campaign_id, pinned_at")
      .order("pinned_at", { ascending: true })
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const key = "motion_board_state_v1";
        const local = localStorage.getItem(key);
        if (local) {
          try {
            const parsed = JSON.parse(local);
            if (parsed.campaigns) setCampaigns(parsed.campaigns);
            if (parsed.assignments) setAssignments(parsed.assignments);
            if (parsed.timeframe) setTimeframe(parsed.timeframe);
          } catch (e) { /* ignore parse errors */ }
        }
      });
    // Also try localStorage directly as fast path
    const key = "motion_board_state_v1";
    const local = localStorage.getItem(key);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (parsed.campaigns) setCampaigns(parsed.campaigns);
        if (parsed.assignments) setAssignments(parsed.assignments);
        if (parsed.timeframe) setTimeframe(parsed.timeframe);
      } catch (e) { /* ignore */ }
    }
  }, []);

  // Fetch attachments for all tasks currently on the board.
  // Scoped to assigned tasks (~30) so we can fire one request per task without
  // worrying about rate limits — no reliance on unreliable hasAttachments field.
  useEffect(() => {
    if (!localStorage.getItem("wrike_user_id")) return;

    const assignedTasks = Object.values(assignments).flat();
    const seen = new Set();
    const unique = assignedTasks.filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    if (unique.length === 0) { setTaskAttachments({}); return; }

    setAttachmentsLoading(true);
    Promise.all(
      unique.map(boardTask => {
        return fetch(`/api/wrike/tasks/${boardTask.id}/attachments`)
          .then(r => r.json())
          // Only PDFs matter here (delivery specs) — images/docs/etc. are
          // dropped before they ever reach state or render a thumbnail.
          .then(data => ({ task: boardTask, attachments: (data.data || []).filter(a => attachmentKind(a) === "pdf") }))
          .catch(() => ({ task: boardTask, attachments: [] }));
      })
    ).then(results => {
      const map = {};
      results.forEach(({ task, attachments }) => {
        if (attachments.length > 0) map[task.id] = { task, attachments };
      });
      setTaskAttachments(map);
      setAttachmentsLoading(false);
    });
  }, [assignments]);

  // Debounced save whenever board state changes
  const saveBoardState = (newCampaigns, newAssignments, newTimeframe) => {
    const state = { campaigns: newCampaigns, assignments: newAssignments, timeframe: newTimeframe, savedAt: new Date().toISOString() };
    localStorage.setItem("motion_board_state_v1", JSON.stringify(state));
    setLastSaved(new Date());
    // Clear pending save
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
  };


  const handleAutoAssign = (targetTimeframe = timeframe) => {
    if (!boardTasks || boardTasks.length === 0) {
      triggerToast("No Wrike data available yet.");
      return;
    }
    const freshAssignments = TEAM_MEMBERS.reduce((acc, name) => ({ ...acc, [name]: [] }), {});
    const freshBacklog = {};
    const now = new Date(); now.setHours(0, 0, 0, 0);
    let minDate, maxDate;
    if (targetTimeframe === "Today") {
      minDate = new Date(0);
      maxDate = new Date(now); maxDate.setHours(23, 59, 59, 999);
    } else if (targetTimeframe === "Tomorrow") {
      minDate = new Date(now); minDate.setDate(now.getDate() + 1);
      maxDate = new Date(minDate); maxDate.setHours(23, 59, 59, 999);
    } else {
      // Snap to the actual next Mon–Fri work week (matching the Timesheeter
      // tab's own Mon–Fri convention), not a rolling 7-day window — a fixed
      // +2..+8 offset drifts off the real calendar week depending on which
      // weekday "today" is, sometimes grabbing days still in *this* week
      // and cutting off days that are genuinely part of next week.
      const dayOfWeek = now.getDay(); // 0 = Sunday .. 6 = Saturday
      const daysUntilNextMonday = ((8 - dayOfWeek) % 7) || 7;
      minDate = new Date(now); minDate.setDate(now.getDate() + daysUntilNextMonday);
      maxDate = new Date(minDate); maxDate.setDate(minDate.getDate() + 4); maxDate.setHours(23, 59, 59, 999);
    }
    boardTasks.forEach((task) => {
      if (task.status !== "Active") return;
      if (!task.dueDate || task.dueDate === "No Due Date") return;
      const taskDate = new Date(task.dueDate);
      if (isNaN(taskDate.getTime()) || taskDate < minDate || taskDate > maxDate) return;
      const wrikeLink = task.permalink || `https://www.wrike.com/open.htm?id=${task.id}`;
      if (!task.assignees) return;
      if (task.assignees.includes("Riccardo")) {
        const campId = task.parentIds?.[0] || "camp-misc";
        const campName = task.projectName || "Misc / Uncategorized";
        if (!freshBacklog[campId]) freshBacklog[campId] = { id: campId, name: campName, subtasks: [] };
        freshBacklog[campId].subtasks.push({
          id: task.id, title: task.title,
          tag: task.customStatusName || "Backlog",
          customStatusId: task.customStatusId,
          permalink: wrikeLink,
        });
      } else {
        Object.keys(MOTION_TEAM_NAME_MAP).forEach((wrikeName) => {
          if (task.assignees.includes(wrikeName)) {
            const boardName = MOTION_TEAM_NAME_MAP[wrikeName];
            if (freshAssignments[boardName]) {
              freshAssignments[boardName].push({
                id: task.id, title: task.title,
                campaignId: task.parentIds?.[0] || "unknown",
                campaignName: task.projectName || "Wrike Import",
                tag: task.customStatusName || "Wrike",
                customStatusId: task.customStatusId,
                permalink: wrikeLink,
                dueDate: task.dueDate || null,
              });
            }
          }
        });
      }
    });
    for (const key in freshAssignments) freshAssignments[key] = sortTasksByStatus(freshAssignments[key]);
    const freshCampaigns = Object.values(freshBacklog);
    setAssignments(freshAssignments);
    setCampaigns(freshCampaigns);
    saveBoardState(freshCampaigns, freshAssignments, targetTimeframe);
  };

  // Rebuild the board from scratch whenever boardTasks gets a new reference —
  // the initial narrow fetch on mount, or a webhook-triggered update
  // (useMotionBoardTasks.js). No periodic polling involved on either side.
  useEffect(() => {
    if (!boardTasks || boardTasks.length === 0) return;
    handleAutoAssign(timeframe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardTasks]);

  // Stats
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isOverdue = (d) => d && d !== "No Due Date" && new Date(d) < today;
  const allAssigned = Object.values(assignments).flat();
  const overdueCount = allAssigned.filter((t) => isOverdue(t.dueDate)).length;
  const statusCounts = allAssigned.reduce((acc, t) => {
    const k = t.tag || "Unknown"; acc[k] = (acc[k] || 0) + 1; return acc;
  }, {});
  const topStatuses = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div className="min-h-screen bg-slate-100 text-[#122027] font-sans selection:bg-[#12a0e1]/30 selection:text-[#122027]">
      <PageHeader pageId="todayslist" icon={LayoutList} title={`${timeframe}'s List`} subtitle="Motioners Tasks Allocation">
        <div className="flex bg-white/15 border border-white/20 backdrop-blur-sm p-1.5 rounded-xl">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => { setTimeframe(tf); handleAutoAssign(tf); }}
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                timeframe === tf
                  ? "bg-white text-[#122027] shadow-sm"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        {/* Last saved indicator */}
        {lastSaved && (() => {
          const mins = Math.floor((Date.now() - new Date(lastSaved).getTime()) / 60000);
          const label = mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : `${Math.floor(mins/60)}h ago`;
          return (
            <span className="text-[10px] font-bold text-white/80 flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${mins < 5 ? "bg-[#1cc1a5]" : mins < 30 ? "bg-amber-300" : "bg-white/40"}`} />
              Saved {label}
            </span>
          );
        })()}
        <button onClick={() => handleAutoAssign(timeframe)} className={pageHeaderActionClass}>
          <LayoutList className="w-4 h-4" />
          Auto-Assign {timeframe}
        </button>
      </PageHeader>

      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 pt-8">
        {/* Stats bar */}
        <div className="mt-4 flex gap-3 flex-wrap">
          <div className="bg-white border border-[#dce4ec] rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm min-w-[110px]">
            <div className="text-2xl font-black text-[#122027]">{allAssigned.length}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-[#768994]">Total<br />Tasks</div>
          </div>
          {overdueCount > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm min-w-[110px]">
              <div className="text-2xl font-black text-rose-600">{overdueCount}</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-rose-400">Over<br />due</div>
            </div>
          )}
          {topStatuses.map(([status, count]) => (
            <div key={status} className="bg-white border border-[#dce4ec] rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm min-w-[110px]">
              <div className="text-2xl font-black text-[#122027]">{count}</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-[#768994] max-w-[80px] leading-tight">{status}</div>
            </div>
          ))}
        </div>

        {/* Main board */}
        <div className="mt-4 flex flex-col gap-3" style={{ height: "calc(100vh - 310px)" }}>

          {/* Riccardo's Playground */}
          <div className="bg-white rounded-2xl border border-[#dce4ec] shadow-sm overflow-hidden shrink-0">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[#dce4ec] bg-slate-50/50">
              <LayoutList className="w-3.5 h-3.5 text-[#12a0e1]" />
              <h2 className="text-sm font-black text-[#122027] tracking-tight">Riccardo's Playground</h2>
              <span className="text-[10px] text-[#768994] font-bold ml-1">
                {campaigns.reduce((s, c) => s + c.subtasks.length, 0)} tasks
              </span>
            </div>
            <div className="flex gap-3 p-3 overflow-x-auto">
              {campaigns.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-3 px-2">No tasks — hit Auto-Assign to populate.</p>
              ) : campaigns.map((campaign) => (
                <div key={campaign.id} className="shrink-0 w-52 bg-slate-50 rounded-xl border border-[#dce4ec] overflow-hidden flex flex-col">
                  <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-[#dce4ec] bg-white shrink-0">
                    <Film className="w-3 h-3 text-[#12a0e1] shrink-0" />
                    <h3 className="text-[10px] font-black text-[#122027] uppercase tracking-wide truncate flex-1">{campaign.name}</h3>
                    <span className="text-[9px] font-black text-[#768994] shrink-0">{campaign.subtasks.length}</span>
                  </div>
                  <div className="p-1.5 space-y-1 min-h-[36px] max-h-[130px] overflow-y-auto flex-1">
                    {campaign.subtasks.map((task) => {
                      const terr = getTerritoryData(task.title);
                      return (
                        <div
                          key={task.id}
                          className={`rounded-lg border border-slate-100 border-l-2 ${getBorderColorClass(task.tag)} bg-white`}
                        >
                          <div className="flex items-center gap-1.5 p-1.5">
                            <span className="text-sm leading-none shrink-0">{terr.flag}</span>
                            <span className="text-[10px] font-bold text-[#122027] truncate flex-1">{task.title}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Files panel */}
          {(attachmentsLoading || Object.keys(taskAttachments).length > 0) && (
            <div className="bg-white rounded-2xl border border-[#dce4ec] shadow-sm overflow-hidden shrink-0">
              <button
                onClick={() => setShowFilesPanel(p => !p)}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50/60 transition-colors"
              >
                <Paperclip className="w-3.5 h-3.5 text-[#12a0e1]" />
                <span className="text-sm font-black text-[#122027] tracking-tight">Upcoming Files</span>
                <span className="text-[10px] font-bold text-[#768994] ml-1">
                  {attachmentsLoading
                    ? "Loading…"
                    : `${Object.values(taskAttachments).reduce((s, { attachments }) => s + attachments.length, 0)} files · ${Object.keys(taskAttachments).length} tasks`}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 ml-auto transition-transform duration-200 ${showFilesPanel ? "" : "-rotate-90"}`}
                />
              </button>
              {showFilesPanel && !attachmentsLoading && (
                <div className="flex gap-6 px-4 pb-3 pt-0.5 overflow-x-auto">
                  {Object.values(taskAttachments).map(({ task, attachments }) => (
                    <div key={task.id} className="shrink-0 flex flex-col gap-1.5">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-[#12a0e1] truncate max-w-[200px]">
                          {task.projectName || ""}
                        </p>
                        <a
                          href={task.permalink || `https://www.wrike.com/open.htm?id=${task.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] font-bold text-[#122027] hover:text-[#12a0e1] truncate max-w-[200px] block transition-colors"
                        >
                          {task.title}
                        </a>
                      </div>
                      <div className="flex gap-1.5 flex-wrap" style={{ maxWidth: 200 }}>
                        {attachments.map(att => (
                          <AttachmentThumb key={att.id} attachment={att} onPreview={(file) => {
                            setPreviewFile(file);
                            setPreviewAttachments(attachments);
                          }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 7 Team columns */}
          <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
            <div className="flex gap-3 w-full h-full">
              {TEAM_MEMBERS.map((person) => {
                const tasks = assignments[person];
                const isFocused = focusedPerson === person;
                const isCollapsed = focusedPerson !== null && !isFocused;
                const personOverdue = tasks.filter((t) => isOverdue(t.dueDate)).length;

                return (
                  <div
                    key={person}
                    className="flex flex-col h-full transition-all duration-300 ease-in-out min-w-0"
                    style={{ flex: isCollapsed ? "0 0 52px" : isFocused ? "3 1 0" : "1 1 0" }}
                  >
                    <button
                      onClick={() => setFocusedPerson((p) => (p === person ? null : person))}
                      className={`w-full rounded-2xl mb-2 border transition-all duration-200 shrink-0 ${TEAM_COLORS[person].light} ${isFocused ? "ring-2 ring-[#12a0e1]" : "hover:brightness-95"}`}
                    >
                      {isCollapsed ? (
                        <div className="flex flex-col items-center py-3 gap-1.5">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white ${TEAM_COLORS[person].solid.split(" ")[0]}`}>
                            {person[0]}
                          </div>
                          <span className="text-[10px] font-bold opacity-60">{tasks.length}</span>
                          {personOverdue > 0 && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 ${TEAM_COLORS[person].solid.split(" ")[0]}`}>
                            {person[0]}
                          </div>
                          <span className="font-black text-sm tracking-tight flex-1 text-left">{person}</span>
                          {personOverdue > 0 && (
                            <span className="text-[9px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded-full">
                              {personOverdue} late
                            </span>
                          )}
                          <span className="text-[10px] font-black opacity-50">{tasks.length}</span>
                        </div>
                      )}
                    </button>

                    <div className={`flex-1 overflow-y-auto rounded-2xl border bg-white border-[#dce4ec] ${isCollapsed ? "p-1" : "p-2.5 space-y-2"}`}>
                      {!isCollapsed && tasks.length === 0 && (
                        <div className="flex items-center justify-center h-full text-slate-300">
                          <p className="text-xs italic">No active jobs</p>
                        </div>
                      )}
                      {!isCollapsed && tasks.map((task) => {
                        const terr = getTerritoryData(task.title);
                        const overdue = isOverdue(task.dueDate);
                        return (
                          <div
                            key={task.id}
                            onClick={() => setSelectedTask(task)}
                            className={`group relative rounded-xl border border-slate-200/80 border-l-4 ${getBorderColorClass(task.tag)} ${
                              overdue ? "bg-rose-50/40" : "bg-slate-50/60 hover:bg-white"
                            } hover:shadow-md transition-all p-3 cursor-pointer`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-[9px] font-black uppercase text-[#12a0e1] tracking-widest mb-1 truncate pr-6">
                                {task.campaignName}
                              </p>
                              <div className="flex items-start gap-1 mb-2">
                                <span className="text-sm leading-none shrink-0 mt-0.5" title={terr.name}>{terr.flag}</span>
                                <p className="text-xs font-bold text-[#122027] leading-snug break-words">{task.title}</p>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={getTagStyle(task.tag)}>{task.tag}</span>
                                {overdue && (
                                  <span className="text-[9px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded-full">OVERDUE</span>
                                )}
                                {taskAttachments[task.id] && (
                                  <span className="text-[9px] font-black text-slate-400 flex items-center gap-0.5">
                                    <Paperclip className="w-2.5 h-2.5" />
                                    {taskAttachments[task.id].attachments.length}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* Task detail modal (shared component — same as Profile Hub) */}
      <TaskDetailModal
        task={selectedTask}
        wrikeData={wrikeData}
        attachments={selectedTask ? taskAttachments[selectedTask.id]?.attachments : undefined}
        onClose={() => setSelectedTask(null)}
        triggerToast={triggerToast}
      />

    {/* File preview lightbox (Upcoming Files panel) */}
    <FilePreviewLightbox
      file={previewFile}
      onClose={() => setPreviewFile(null)}
      allAttachments={previewAttachments}
      onNavigate={setPreviewFile}
    />
    </div>
  );
}