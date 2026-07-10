import React, { useState, useEffect, useRef } from "react";
import {
  LayoutList,
  Film,
  Paperclip,
  ChevronDown,
} from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { TERRITORY_FLAGS, MOTION_TEAM_NAME_MAP } from "../constants";
import { supabase } from "../lib/supabaseClient";
import { useMotionBoardTasks } from "../hooks/useMotionBoardTasks";
import PageHeader, { pageHeaderActionClass } from "./shared/PageHeader";
import TaskDetailModal, { FilePreviewLightbox } from "./TaskDetailModal";

gsap.registerPlugin(useGSAP);

const TEAM_MEMBERS = ["Antonio", "Aaron", "Jacqui", "Maria", "Nicholas", "Luke", "Turk"];

// Each artist owns a lane ("track") and an identity gradient — the same
// colour-as-identity system Home's rows use for pages, applied to people.
// Gradients are tuned so white display-size type holds ≥3:1 on the left
// edge; Maria's amber can't carry white, so her lane flips to dark ink
// (ink: "dark") — the same rule Home applies to its amber row.
const MEMBER_LANES = {
  Antonio: { gradient: "from-blue-500 to-indigo-600",   ink: "light", dot: "bg-blue-500" },
  Aaron:   { gradient: "from-emerald-600 to-teal-600",  ink: "light", dot: "bg-emerald-600" },
  Jacqui:  { gradient: "from-pink-600 to-rose-600",     ink: "light", dot: "bg-pink-600" },
  Maria:   { gradient: "from-amber-400 to-yellow-500",  ink: "dark",  dot: "bg-amber-400" },
  Nicholas:{ gradient: "from-purple-500 to-violet-600", ink: "light", dot: "bg-purple-500" },
  Luke:    { gradient: "from-orange-600 to-red-600",    ink: "light", dot: "bg-orange-600" },
  Turk:    { gradient: "from-cyan-600 to-sky-600",      ink: "light", dot: "bg-cyan-600" },
};

// Play the full lane entrance once per app session; later visits get the
// shortened rise — same pacing contract as Home's menu.
let boardEntrancePlayed = false;

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

// Status as a small dot — used on the dark slate where the light chip
// palette of getTagStyle would not survive. Same semantic hues as
// getBorderColorClass (literal classes so Tailwind's scanner sees them).
const getStatusDotClass = (tag) => {
  if (!tag) return "bg-slate-400";
  const t = String(tag).toLowerCase();
  if (t.includes("to amend"))          return "bg-rose-400";
  if (t.includes("render review"))     return "bg-indigo-400";
  if (t.includes("revised"))           return "bg-teal-400";
  if (t.includes("creative approved")) return "bg-blue-400";
  if (t.includes("content approved"))  return "bg-purple-400";
  if (t.includes("client review") || t.includes("content review")) return "bg-yellow-400";
  if (t.includes("motion"))            return "bg-emerald-400";
  if (t.includes("digital"))           return "bg-cyan-400";
  if (t.includes("prep for delivery")) return "bg-orange-400";
  if (t === "delivering" || t === "delivery") return "bg-yellow-500";
  if (t.includes("on hold"))           return "bg-red-400";
  if (t.includes("pm"))                return "bg-fuchsia-400";
  return "bg-slate-400";
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

export default function TodaysList({ wrikeData, triggerToast: _triggerToast, isActive = true }) {
  const triggerToast = _triggerToast ?? ((msg) => console.warn("Toast:", msg));
  const { boardTasks } = useMotionBoardTasks();
  const boardRef = useRef(null);

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

  // ── Entrance choreography ─────────────────────────────────────────────────
  // The board stays mounted while hidden, so the entrance runs when the tab
  // becomes active rather than on mount. Same vocabulary as Home: lane-cap
  // names masked-rise inside their overflow-hidden caps (no opacity on type),
  // cards drift up with a light fade. Full ceremony once per session, the
  // shortened rise on every visit after.
  useGSAP(
    () => {
      if (!isActive || prefersReducedMotion()) return;
      const q = gsap.utils.selector(boardRef);
      const rises = q("[data-lane-rise]");
      const cards = q("[data-card-rise]");
      if (!rises.length) return;

      const first = !boardEntrancePlayed;
      boardEntrancePlayed = true;

      gsap.set(rises, { yPercent: first ? 120 : 45 });
      gsap.set(cards, { y: 14, opacity: 0 });
      gsap
        .timeline()
        .to(rises, {
          yPercent: 0,
          duration: first ? 0.7 : 0.35,
          ease: "expo.out",
          stagger: first ? 0.05 : 0.02,
        }, 0.05)
        .to(cards, {
          y: 0,
          opacity: 1,
          duration: 0.45,
          ease: "power3.out",
          stagger: 0.015,
        }, first ? 0.25 : 0.1);
    },
    { dependencies: [isActive], scope: boardRef }
  );

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
    <div ref={boardRef} className="min-h-screen bg-slate-100 text-[#122027] font-sans selection:bg-[#12a0e1]/30 selection:text-[#122027]">
      <PageHeader pageId="todayslist" icon={LayoutList} title={`${timeframe}'s List`} subtitle="Motioners Tasks Allocation">
        {/* The day's summary lives in the header, like a call sheet's totals —
            white figures on the page gradient instead of a floating card row */}
        <div className="flex items-center gap-5 mr-1">
          <div className="text-right">
            <div className="font-display text-2xl font-bold text-white leading-none">{allAssigned.length}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-white/70">on the board</div>
          </div>
          {overdueCount > 0 && (
            <div className="text-right">
              <div className="font-display text-2xl font-bold text-amber-200 leading-none">{overdueCount}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-amber-200/80">overdue</div>
            </div>
          )}
          {topStatuses[0] && (
            <div className="text-right hidden lg:block">
              <div className="font-display text-2xl font-bold text-white leading-none">{topStatuses[0][1]}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-white/70 max-w-[110px] truncate">{topStatuses[0][0]}</div>
            </div>
          )}
        </div>
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

      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">

        {/* ── Riccardo's Slate ─────────────────────────────────────────────
            The lead's triage pile as a film slate: one dark strip of ink,
            white type, campaign-grouped chips. The only dark block on the
            page — everything below it stays quiet so it reads as "not yet
            allocated" at a glance. */}
        <div className="bg-[#122027] rounded-2xl overflow-hidden shrink-0">
          <div className="flex items-center gap-4 px-5 pt-4 pb-3">
            <div className="overflow-hidden">
              <div data-lane-rise className="flex items-baseline gap-3">
                <h2 className="font-display text-lg font-bold text-white tracking-tight leading-none">Riccardo's Slate</h2>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/50">
                  {campaigns.reduce((s, c) => s + c.subtasks.length, 0)} unallocated
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-6 px-5 pb-4 overflow-x-auto">
            {campaigns.length === 0 ? (
              <p className="text-xs text-white/40 italic pb-1">Nothing on the slate — Auto-Assign pulls in {timeframe.toLowerCase()}'s tasks.</p>
            ) : campaigns.map((campaign) => (
              <div key={campaign.id} data-card-rise className="shrink-0 max-w-[340px]">
                <div className="flex items-center gap-1.5 mb-2">
                  <Film className="w-3 h-3 text-white/40 shrink-0" />
                  <h3 className="text-[10px] font-black text-white/60 uppercase tracking-widest truncate">{campaign.name}</h3>
                  <span className="text-[10px] font-bold text-white/35 shrink-0">{campaign.subtasks.length}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {campaign.subtasks.map((task) => {
                    const terr = getTerritoryData(task.title);
                    return (
                      <button
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        title={`${task.title} — ${task.tag || ""}`}
                        className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg px-2 py-1 transition-colors"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusDotClass(task.tag)}`} />
                        <span className="text-xs leading-none shrink-0">{terr.flag}</span>
                        <span className="text-[10px] font-bold text-white/90 truncate max-w-[180px]">{task.title}</span>
                      </button>
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

        {/* ── The tracks ───────────────────────────────────────────────────
            One lane per artist, stacked like an edit timeline. The lane cap
            speaks Home's row language: display-type name, identity gradient
            that sweeps in on hover (origin left, ink flips), and stays
            washed while the lane is focused. Clicking a cap expands the
            lane; the others compress to slivers. */}
        <div className="bg-white rounded-2xl border border-[#dce4ec] shadow-sm overflow-hidden">
          {TEAM_MEMBERS.map((person, laneIdx) => {
            const tasks = assignments[person];
            const lane = MEMBER_LANES[person];
            const isFocused = focusedPerson === person;
            const isCollapsed = focusedPerson !== null && !isFocused;
            const personOverdue = tasks.filter((t) => isOverdue(t.dueDate)).length;
            const inkHover = lane.ink === "dark" ? "group-hover:text-[#122027]" : "group-hover:text-white";
            const inkFocus = lane.ink === "dark" ? "text-[#122027]" : "text-white";

            return (
              <div
                key={person}
                className={`flex items-stretch transition-all duration-300 ease-in-out ${
                  laneIdx > 0 ? "border-t border-[#dce4ec]" : ""
                } ${isCollapsed ? "h-12" : isFocused ? "h-72" : "h-[6.5rem]"}`}
              >
                {/* Lane cap */}
                <button
                  onClick={() => setFocusedPerson((p) => (p === person ? null : person))}
                  className="group relative w-44 sm:w-52 shrink-0 text-left px-5 border-r border-[#dce4ec] overflow-hidden"
                >
                  <div
                    className={`absolute inset-0 bg-gradient-to-r ${lane.gradient} origin-left transition-transform duration-300 ease-out ${
                      isFocused ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                    }`}
                  />
                  <div className="relative z-10 h-full flex flex-col justify-center overflow-hidden">
                    <div data-lane-rise className="flex items-baseline justify-between gap-2">
                      <span
                        className={`font-display font-bold tracking-tight leading-none transition-all duration-300 ${
                          isCollapsed ? "text-sm" : "text-xl sm:text-2xl"
                        } ${isFocused ? inkFocus : `text-[#122027] ${inkHover}`}`}
                      >
                        {person}
                      </span>
                      <span
                        className={`font-display font-bold leading-none transition-colors duration-300 ${
                          isCollapsed ? "text-sm" : "text-xl"
                        } ${
                          isFocused
                            ? lane.ink === "dark" ? "text-[#122027]/60" : "text-white/60"
                            : `text-[#c6d0da] ${lane.ink === "dark" ? "group-hover:text-[#122027]/60" : "group-hover:text-white/60"}`
                        }`}
                      >
                        {tasks.length}
                      </span>
                    </div>
                    {!isCollapsed && personOverdue > 0 && (
                      <span
                        className={`mt-1.5 self-start text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded transition-colors duration-300 ${
                          isFocused || lane.ink === "dark"
                            ? "bg-[#122027]/15"
                            : "bg-rose-50 text-rose-600 group-hover:bg-white/20"
                        } ${isFocused ? (lane.ink === "dark" ? "text-[#122027]" : "text-white") : lane.ink === "dark" ? "text-rose-600" : "group-hover:text-white"}`}
                      >
                        {personOverdue} overdue
                      </span>
                    )}
                  </div>
                </button>

                {/* Lane body — tasks flow horizontally like clips on a track */}
                <div className={`flex-1 min-w-0 flex items-stretch gap-2 overflow-x-auto overflow-y-hidden ${isCollapsed ? "px-3 py-1.5" : "p-3"}`}>
                  {isCollapsed ? (
                    <div className="flex items-center gap-1.5">
                      {tasks.slice(0, 12).map((t) => (
                        <span key={t.id} title={t.title} className={`w-2 h-2 rounded-full shrink-0 ${getStatusDotClass(t.tag)}`} />
                      ))}
                      {tasks.length > 12 && <span className="text-[10px] font-bold text-[#768994]">+{tasks.length - 12}</span>}
                    </div>
                  ) : tasks.length === 0 ? (
                    <p className="self-center text-xs italic text-slate-300">Clear — nothing due</p>
                  ) : (
                    tasks.map((task) => {
                      const terr = getTerritoryData(task.title);
                      const overdue = isOverdue(task.dueDate);
                      return (
                        <div
                          key={task.id}
                          data-card-rise
                          onClick={() => setSelectedTask(task)}
                          className={`group/card shrink-0 cursor-pointer rounded-xl border border-slate-200/80 border-l-4 ${getBorderColorClass(task.tag)} ${
                            overdue ? "bg-rose-50/50" : "bg-slate-50/70 hover:bg-white"
                          } hover:shadow-md hover:-translate-y-0.5 transition-all ${
                            isFocused ? "w-72 p-3.5" : "w-60 p-2.5"
                          } flex flex-col justify-between min-h-0 overflow-hidden`}
                        >
                          <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase text-[#12a0e1] tracking-widest truncate">
                              {task.campaignName}
                            </p>
                            <div className="flex items-start gap-1.5 mt-1">
                              <span className="text-sm leading-none shrink-0 mt-0.5" title={terr.name}>{terr.flag}</span>
                              <p className={`text-xs font-bold text-[#122027] leading-snug ${isFocused ? "break-words" : "truncate"}`}>
                                {task.title}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
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
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
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