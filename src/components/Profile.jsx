import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  User,
  Clock,
  BarChart2,
  Briefcase,
  CheckCircle,
  Globe,
  Trophy,
  RefreshCw,
  TrendingUp,
  Zap,
  Calendar,
  Film,
  Activity,
  ChevronRight,
  Layers,
  ChevronLeft,
  Key,
  Settings,
  Check,
  LogOut,
  ExternalLink,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import PageHeader from "./shared/PageHeader";
import { useTasks } from "../hooks/useTasks";
import { useWrikeUser } from "../hooks/useWrikeUser";
import { startWrikeOAuth, disconnectWrike, fetchWrikeOAuthStatus } from "../lib/wrikeApi";
import TaskDetailModal from "./TaskDetailModal";
import { formatDurationText } from "../utils/timeHelpers";
import { getTagStyle, getBorderColorClass } from "../utils/tagStyles";
import { TERRITORY_FLAGS } from "../constants";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const PIE_COLORS = [
  "#12a0e1",
  "#1cc1a5",
  "#8b5cf6",
  "#f59e0b",
  "#ec4899",
  "#10b981",
];

// Each hub section owns an identity gradient (used by the row sweep, the icon
// chip, and the drill-in header). Tuned one step darker than the old drawer
// so white display-size labels hold ≥3:1 on the left edge when the sweep
// fills — same contrast rule Home and Motion Board follow.
const SECTIONS = [
  {
    id: "jobs",
    label: "Active Jobs",
    icon: Briefcase,
    desc: "Your live workload — open a job to see the brief, files & log time",
    gradient: "from-[#12a0e1] to-[#1cc1a5]",
    featured: true,
  },
  {
    id: "history",
    label: "History",
    icon: Clock,
    desc: "Your logged hours by day",
    gradient: "from-violet-500 to-purple-600",
  },
  {
    id: "overview",
    label: "Overview",
    icon: Activity,
    desc: "Recent activity & territories",
    gradient: "from-sky-500 to-blue-600",
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart2,
    desc: "Time breakdowns & charts",
    gradient: "from-amber-500 to-orange-600",
  },
  {
    id: "completed",
    label: "Completed",
    icon: CheckCircle,
    desc: "Jobs you've delivered",
    gradient: "from-teal-500 to-emerald-600",
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    desc: "Wrike connection & preferences",
    gradient: "from-slate-500 to-slate-700",
  },
];

// Full hub-row entrance plays once per app session; later returns to the hub
// render settled (same pacing contract as Home and Motion Board).
let profileEntrancePlayed = false;

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function timeAgo(iso) {
  if (!iso) return "just now";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

function StatCard({ label, value, unit, icon: Icon, accent = "#12a0e1" }) {
  return (
    <div className="bg-white border border-[#dce4ec] rounded-2xl p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div
          className="p-1.5 rounded-lg"
          style={{ background: `${accent}18`, color: accent }}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-[10px] font-black text-[#768994] uppercase tracking-widest">
          {label}
        </span>
      </div>
      <div className="text-2xl font-black text-[#122027] leading-none">
        {value} <span className="text-sm font-bold text-[#768994]">{unit}</span>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, children, right }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <h2 className="text-base font-black text-[#122027] tracking-tight flex items-center gap-2">
        <Icon className="w-4 h-4 text-[#12a0e1]" /> {children}
      </h2>
      {right}
    </div>
  );
}

function Empty({ icon: Icon, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-[#768994]">
      <Icon className="w-8 h-8 text-slate-200 mb-2" />
      <p className="text-sm font-bold">{message}</p>
    </div>
  );
}

// ── Hub row ───────────────────────────────────────────────────────────────────
// Home's menu vocabulary, recursed into the profile: a full-width row whose
// identity gradient sweeps in from the left on hover/focus (ink flips to
// white), a Bricolage display label, and an optional live badge on the right.
// The label sits in an overflow-hidden mask so the entrance rises it into
// place with no opacity fade on the type (see the useGSAP block in Profile).
function HubRow({ section, onClick, badge, first }) {
  const { label, desc, icon: Icon, gradient } = section;
  return (
    <button
      onClick={onClick}
      className="group relative w-full flex items-center gap-4 sm:gap-5 px-5 sm:px-7 py-5 text-left border-b border-[#dce4ec] last:border-b-0 focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-white/70"
    >
      <div
        className={`absolute inset-0 bg-gradient-to-r ${gradient} origin-left scale-x-0 group-hover:scale-x-100 group-focus:scale-x-100 transition-transform duration-300 ease-out`}
      />

      {/* Icon chip: gradient-filled at rest, translucent-white once the row
          it sits on has itself gone gradient. */}
      <div
        className={`relative z-10 shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-br ${gradient} group-hover:bg-none group-hover:bg-white/20 group-focus:bg-none group-focus:bg-white/20 flex items-center justify-center text-white transition-colors duration-300`}
      >
        <Icon className="w-5 h-5" />
      </div>

      <div className="relative z-10 min-w-0 flex-1 overflow-hidden">
        <div data-hub-rise>
          <p
            className={`font-display font-bold tracking-tight leading-none text-[#122027] group-hover:text-white group-focus:text-white transition-colors duration-300 ${
              first ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl"
            }`}
          >
            {label}
          </p>
          <p className="text-xs sm:text-sm text-[#768994] group-hover:text-white/80 group-focus:text-white/80 mt-1 truncate transition-colors duration-300">
            {desc}
          </p>
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-3 shrink-0">
        {badge}
        <ChevronRight className="w-5 h-5 text-[#768994] group-hover:text-white group-focus:text-white group-hover:translate-x-1 transition-all duration-300" />
      </div>
    </button>
  );
}

// ── Wrike task card — mirrors the RecentJobsModal style ───────────────────────

function WrikeTaskCard({ task, filter, onClick }) {
  const statusName = task.customStatusName || task.status;
  const borderColor = getBorderColorClass(statusName);
  const isMatrix = task.title?.toUpperCase().includes("MATRIX");
  const updatedStr = fmtDate(task.updatedDate);
  const completedStr = fmtDate(task.completedDate);
  const dueStr = fmtDate(task.dueDate);

  return (
    <div
      onClick={onClick}
      className={`p-4 border-y border-r border-l-4 rounded-2xl transition-all ${borderColor} ${
        isMatrix
          ? "border-y-[#dce4ec] border-r-[#dce4ec] bg-slate-200/50 opacity-70"
          : "border-y-[#dce4ec] border-r-[#dce4ec] bg-slate-50"
      } ${onClick ? "cursor-pointer hover:bg-white hover:shadow-md" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span className={getTagStyle(statusName)}>{statusName}</span>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {filter === "completed" && completedStr && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              <CheckCircle className="w-3 h-3" /> Delivered {completedStr}
            </span>
          )}
          {updatedStr && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
              <Activity className="w-3 h-3" /> Updated {updatedStr}
            </span>
          )}
          {dueStr && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-[#768994] bg-white px-2 py-0.5 rounded border border-slate-200">
              <Calendar className="w-3 h-3" /> Due {dueStr}
            </span>
          )}
        </div>
      </div>
      <p
        className={`text-sm font-bold ${
          isMatrix ? "text-slate-400" : "text-[#122027]"
        }`}
      >
        {task.title}
      </p>
    </div>
  );
}

// ── Jobs section — fetches live from Wrike, grouped by campaign ───────────────

function JobsSection({ wrikeUser, filter, wrikeData, onLogTime, triggerToast, jobOptions }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  const fetchTasks = useCallback(async () => {
    if (!wrikeUser?.id) return;

    setLoading(true);
    const fields = encodeURIComponent("[description,superTaskIds]");

    try {
      const [aRes, cRes, wRes] = await Promise.all([
        fetch(
          `/api/wrike/tasks?responsibles=[${wrikeUser.id}]&status=Active&fields=${fields}&pageSize=500`
        ),
        fetch(
          `/api/wrike/tasks?responsibles=[${wrikeUser.id}]&fields=${fields}&pageSize=1000`
        ),
        fetch("/api/wrike/workflows"),
      ]);
      const [aJson, cJson, wJson] = await Promise.all([
        aRes.json(),
        cRes.json(),
        wRes.json(),
      ]);

      const statusNameMap = {};
      (wJson.data || []).forEach((wf) =>
        (wf.customStatuses || []).forEach((cs) => {
          statusNameMap[cs.id] = cs.name;
        })
      );

      const allRaw = [...(aJson.data || []), ...(cJson.data || [])];
      const assignedIds = new Set(allRaw.map((t) => t.id));
      const isChild = (t) =>
        (t.superTaskIds || []).some((pid) => assignedIds.has(pid));

      const enrich = (t) => {
        const customStatusName = t.customStatusId
          ? statusNameMap[t.customStatusId] || t.status
          : t.status;
        const isDone =
          t.status === "Completed" ||
          /^(delivered|completed|done|published)$/i.test(customStatusName);
        const html = (t.description || "").replace(/<[^>]*>/g, " ");
        const filmFreq = {};
        for (const path of html.match(/\/Volumes\/[^\s]+/gi) || []) {
          const parts = path.split("/");
          const digIdx = parts.findIndex((p) => p.toUpperCase() === "DIGITAL");
          if (digIdx > 0 && parts[digIdx - 1]) {
            const name = decodeURIComponent(parts[digIdx - 1])
              .replace(/[_\-]/g, " ")
              .trim();
            filmFreq[name] = (filmFreq[name] || 0) + 1;
          }
        }
        let projectName = Object.keys(filmFreq).length
          ? Object.entries(filmFreq).sort((a, b) => b[1] - a[1])[0][0]
          : "";
        if (!projectName) {
          const m = t.title.match(
            /^(?:Edit|Design|Animation|Motion|Finish|Grade|Sound|Audio|VFX|Colourist|DI)\s*[-–]\s*(.+?)(?:\s*[-–]\s*.+)?$/i
          );
          if (m) projectName = m[1].trim();
        }
        if (!projectName)
          projectName = t.title.split(/[_\-]/)[0].trim() || "Other Projects";
        return { ...t, customStatusName, isDone, projectName };
      };

      const active = (aJson.data || []).filter((t) => !isChild(t)).map(enrich);
      const completed = (cJson.data || [])
        .filter((t) => !isChild(t))
        .map(enrich)
        .filter((t) => t.isDone);
      const seen = new Set(active.map((t) => t.id));
      setTasks([...active, ...completed.filter((t) => !seen.has(t.id))]);
      setFetched(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [wrikeUser?.id]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const filtered = useMemo(
    () => tasks.filter((t) => (filter === "completed" ? t.isDone : !t.isDone)),
    [tasks, filter]
  );

  const sorted = useMemo(
    () =>
      [...filtered]
        .sort((a, b) => {
          const da =
            filter === "completed"
              ? new Date(b.completedDate || b.updatedDate || 0)
              : new Date(b.updatedDate || 0);
          const db =
            filter === "completed"
              ? new Date(a.completedDate || a.updatedDate || 0)
              : new Date(a.updatedDate || 0);
          return da - db;
        })
        .slice(0, 40),
    [filtered, filter]
  );

  const grouped = useMemo(
    () =>
      sorted.reduce((acc, t) => {
        const key = t.projectName || "Other Projects";
        if (!acc[key]) acc[key] = [];
        acc[key].push(t);
        return acc;
      }, {}),
    [sorted]
  );

  const sortedCampaigns = useMemo(
    () =>
      Object.keys(grouped).sort((a, b) => {
        const latest = (ts) =>
          Math.max(
            ...ts.map((t) =>
              new Date(
                filter === "completed"
                  ? t.completedDate || t.updatedDate || 0
                  : t.updatedDate || 0
              ).getTime()
            )
          );
        return latest(grouped[b]) - latest(grouped[a]);
      }),
    [grouped, filter]
  );

  const Icon = filter === "completed" ? CheckCircle : Briefcase;

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-3 text-[#768994]">
        <div className="w-7 h-7 border-2 border-[#12a0e1] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-bold">Fetching your Wrike tasks…</p>
      </div>
    );

  if (fetched && sorted.length === 0)
    return (
      <Empty
        icon={Icon}
        message={`No ${
          filter === "completed" ? "completed" : "active"
        } jobs found.`}
      />
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black text-[#768994] bg-slate-100 px-2.5 py-1 rounded-full uppercase tracking-wider">
          {sorted.length} {filter === "completed" ? "delivered" : "active"}
        </span>
        <button
          onClick={fetchTasks}
          className="flex items-center gap-1.5 text-[11px] font-bold text-[#768994] hover:text-[#12a0e1] transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {sortedCampaigns.map((campaign) => (
        <div key={campaign}>
          <div className="flex items-center gap-2 text-xs font-black text-[#12a0e1] uppercase tracking-widest mb-3 border-b border-[#dce4ec] pb-2">
            <Film className="w-3.5 h-3.5" /> {campaign}
            <span className="ml-auto bg-slate-100 text-[#768994] px-2 py-0.5 rounded text-[10px] normal-case tracking-normal font-bold">
              {grouped[campaign].length}{" "}
              {grouped[campaign].length === 1 ? "job" : "jobs"}
            </span>
          </div>
          <div className="space-y-2.5">
            {grouped[campaign].map((task) => (
              <WrikeTaskCard
                key={task.id}
                task={task}
                filter={filter}
                onClick={() => setSelectedTask({ ...task, tag: task.customStatusName || task.tag || task.status })}
              />
            ))}
          </div>
        </div>
      ))}

      <TaskDetailModal
        task={selectedTask}
        wrikeData={wrikeData}
        onClose={() => setSelectedTask(null)}
        enableTimeLog={filter === "active"}
        onLogTime={onLogTime}
        triggerToast={triggerToast}
        jobOptions={jobOptions}
      />
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewSection({
  tasks,
  wrikeUser,
  userStats,
  handleFetchLifetimeStats,
}) {
  const totalSeconds = tasks.reduce(
    (s, t) => s + (t.rawSeconds ?? 0) + (t.additionalSeconds ?? 0),
    0
  );

  // Wrike live activity: timelogs + active timers not yet pulled into DB
  const [wrikeActivity, setWrikeActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => {
    const uid = wrikeUser?.id;
    if (!uid) return;

    setActivityLoading(true);

    Promise.all([
      fetch(`/api/wrike/contacts/${uid}/timelogs?plainText=true`),
      fetch("/api/wrike/timers"),
    ])
      .then(([lRes, tRes]) => Promise.all([lRes.json(), tRes.json()]))
      .then(async ([lJson, tJson]) => {
        const loggedIds = new Set(
          tasks.flatMap((t) => t.wrikeTimelogId ? t.wrikeTimelogId.split(",") : [])
        );

        const recentLogs = (lJson.data || [])
          .sort(
            (a, b) =>
              new Date(b.createdDate || 0) - new Date(a.createdDate || 0)
          )
          .slice(0, 20);
        const timers = tJson.data || [];

        // Collect all unique task IDs we need titles for
        const taskIds = [
          ...new Set([
            ...recentLogs.map((l) => l.taskId),
            ...timers.map((t) => t.taskId),
          ]),
        ].filter(Boolean);

        // Batch-fetch task titles
        const taskTitles = {};
        const BATCH = 100;
        for (let i = 0; i < taskIds.length; i += BATCH) {
          const batch = taskIds.slice(i, i + BATCH);
          try {
            const res = await fetch(`/api/wrike/tasks/${batch.join(",")}`);
            if (res.ok) {
              const json = await res.json();
              (json.data || []).forEach((t) => {
                taskTitles[t.id] = t.title;
              });
            }
          } catch (e) {
            /* silent */
          }
        }

        const logs = recentLogs.map((l) => ({
          id: `log-${l.id}`,
          kind: "timelog",
          pending: !loggedIds.has(l.id),
          label: taskTitles[l.taskId] || l.comment || "Unknown task",
          sub:
            l.comment && l.comment !== taskTitles[l.taskId] ? l.comment : null,
          duration:
            l.hours != null
              ? formatDurationText(Math.round(l.hours * 3600))
              : null,
          date: l.trackedDate ? l.trackedDate.split("T")[0] : null,
          taskId: l.taskId,
        }));

        const timerItems = timers.map((t) => ({
          id: `timer-${t.taskId}`,
          kind: "timer",
          pending: true,
          live: true,
          label: taskTitles[t.taskId] || "Timer running",
          sub: null,
          duration: null,
          date: t.updatedDate ? t.updatedDate.split("T")[0] : null,
          taskId: t.taskId,
        }));

        setWrikeActivity([...timerItems, ...logs]);
      })
      .catch(console.error)
      .finally(() => setActivityLoading(false));
  }, [wrikeUser?.id, tasks]);

  // Merge: Wrike activity on top, then local logged tasks not already represented
  const loggedTimelogIds = new Set(
    tasks.flatMap((t) => t.wrikeTimelogId ? t.wrikeTimelogId.split(",") : [])
  );
  const localFallback = [...tasks]
    .sort((a, b) => b.id - a.id)
    .filter((t) => !t.wrikeTimelogId || !loggedTimelogIds.has(t.wrikeTimelogId))
    .slice(0, 4)
    .map((t) => ({
      id: `local-${t.id}`,
      kind: "local",
      pending: false,
      label: t.jobNumber || "Unknown job",
      duration: formatDurationText(
        (t.rawSeconds ?? 0) + (t.additionalSeconds ?? 0)
      ),
      date: t.date || null,
      sub: [t.territory, t.category].filter(Boolean).join(" · "),
    }));

  const activityFeed = wrikeActivity.length > 0 ? wrikeActivity : localFallback;

  const territories = useMemo(() => {
    const counts = {};
    tasks.forEach((t) => {
      if (t.territory) counts[t.territory] = (counts[t.territory] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [tasks]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Tasks logged"
          value={tasks.length}
          unit="rows"
          icon={Clock}
          accent="#12a0e1"
        />
        <StatCard
          label="Total time"
          value={formatDurationText(totalSeconds)}
          unit=""
          icon={TrendingUp}
          accent="#1cc1a5"
        />
        <StatCard
          label="30-day deliveries"
          value={userStats.fetched ? userStats.month : "—"}
          unit="done"
          icon={CheckCircle}
          accent="#8b5cf6"
        />
        <StatCard
          label="All-time"
          value={userStats.fetched ? userStats.allTime : "—"}
          unit="tasks"
          icon={Trophy}
          accent="#f59e0b"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Activity feed */}
        <div className="bg-white border border-[#dce4ec] rounded-2xl p-5 shadow-sm">
          <SectionTitle
            icon={Zap}
            title="Recent activity"
            right={
              activityLoading && (
                <div className="w-3.5 h-3.5 border-2 border-[#12a0e1] border-t-transparent rounded-full animate-spin" />
              )
            }
          />
          {activityFeed.length === 0 ? (
            <Empty icon={Clock} message="No recent activity." />
          ) : (
            activityFeed.slice(0, 8).map((a) => (
              <div
                key={a.id}
                className="flex gap-3 items-start py-2.5 border-b border-[#f1f5f9] last:border-0"
              >
                {/* Dot — pulsing for live timer, amber for pending, blue for logged */}
                <div className={`mt-2 shrink-0 ${a.live ? "relative" : ""}`}>
                  <div
                    className={`w-2 h-2 rounded-full ${
                      a.live
                        ? "bg-amber-400"
                        : a.pending
                        ? "bg-amber-400"
                        : "bg-[#12a0e1]"
                    }`}
                  />
                  {a.live && (
                    <div className="absolute inset-0 rounded-full bg-amber-400 animate-ping opacity-60" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-[#122027] truncate">
                      {a.label}
                    </p>
                    {a.live && (
                      <span className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                        Live timer
                      </span>
                    )}
                    {!a.live && a.pending && (
                      <span className="text-[9px] font-black text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                        Not pulled
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#768994] mt-0.5">
                    {a.sub || (a.duration ? `${a.duration}` : "")}
                    {a.date ? ` · ${a.date}` : ""}
                  </p>
                </div>

                {a.duration && !a.live && (
                  <span className="text-sm font-black text-[#12a0e1] shrink-0">
                    {a.duration}
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {/* Territories */}
        <div className="bg-white border border-[#dce4ec] rounded-2xl p-5 shadow-sm">
          <SectionTitle icon={Globe} title="Territories worked" />
          {territories.length === 0 ? (
            <Empty icon={Globe} message="No territory data yet." />
          ) : (
            <div className="flex flex-wrap gap-2">
              {territories.map(([terr, count]) => (
                <span
                  key={terr}
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border border-[#dce4ec] bg-slate-50 text-[#122027]"
                >
                  {TERRITORY_FLAGS[terr] || "🌍"} {terr}
                  <span className="text-[10px] font-black text-[#12a0e1] bg-[#12a0e1]/10 px-1.5 py-0.5 rounded-full">
                    {count}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lifetime stats — auto-synced, cached locally; manual refresh optional */}
      {wrikeUser && (
        <div className="flex items-center justify-between gap-3 text-[11px] text-[#768994] px-1">
          <span className="flex items-center gap-1.5">
            {userStats.loading ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin text-[#12a0e1]" />
                Syncing lifetime stats…
              </>
            ) : userStats.fetched ? (
              <>Lifetime stats synced {timeAgo(userStats.syncedAt)}</>
            ) : (
              <>Lifetime stats not synced yet</>
            )}
          </span>
          <button
            onClick={() => handleFetchLifetimeStats(false)}
            disabled={userStats.loading}
            className="flex items-center gap-1.5 font-bold text-[#768994] hover:text-[#12a0e1] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${userStats.loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}

// ── Timesheet history ─────────────────────────────────────────────────────────

const DAY_COLORS = {
  Monday: {
    bg: "bg-violet-50",
    border: "border-l-violet-400",
    text: "text-violet-600",
    pill: "bg-violet-100 text-violet-700",
  },
  Tuesday: {
    bg: "bg-sky-50",
    border: "border-l-sky-400",
    text: "text-sky-600",
    pill: "bg-sky-100 text-sky-700",
  },
  Wednesday: {
    bg: "bg-teal-50",
    border: "border-l-teal-400",
    text: "text-teal-600",
    pill: "bg-teal-100 text-teal-700",
  },
  Thursday: {
    bg: "bg-amber-50",
    border: "border-l-amber-400",
    text: "text-amber-600",
    pill: "bg-amber-100 text-amber-700",
  },
  Friday: {
    bg: "bg-rose-50",
    border: "border-l-rose-400",
    text: "text-rose-600",
    pill: "bg-rose-100 text-rose-700",
  },
};
const DEFAULT_DAY = {
  bg: "bg-slate-50",
  border: "border-l-slate-300",
  text: "text-slate-500",
  pill: "bg-slate-100 text-slate-600",
};

function HistorySection({ tasks }) {
  const [dayFilter, setDayFilter] = useState("all");
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const totalSecs = (t) => (t.rawSeconds ?? 0) + (t.additionalSeconds ?? 0);

  const filtered = useMemo(
    () =>
      (dayFilter === "all"
        ? tasks
        : tasks.filter((t) => t.dayOfWeek === dayFilter)
      ).sort((a, b) => b.id - a.id),
    [tasks, dayFilter]
  );

  // Group by day of week, in Mon→Fri order
  const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((t) => {
      const key = t.dayOfWeek || "Unknown";
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    // Sort days Mon→Fri, unknowns at end
    const order = [
      ...DAY_ORDER.filter((d) => map[d]).reverse(),
      ...Object.keys(map).filter((d) => !DAY_ORDER.includes(d)),
    ];
    return { map, order };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <SectionTitle
        icon={Clock}
        title="Timesheet history"
        right={
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {["all", ...days].map((d) => {
              const dc = DAY_COLORS[d];
              const isActive = dayFilter === d;
              return (
                <button
                  key={d}
                  onClick={() => setDayFilter(d)}
                  className={`text-[10px] font-black px-2.5 py-1 rounded-lg transition-all uppercase tracking-wider ${
                    isActive
                      ? dc
                        ? `bg-white shadow-sm ${dc.text}`
                        : "bg-white text-[#12a0e1] shadow-sm"
                      : "text-[#768994] hover:text-[#122027]"
                  }`}
                >
                  {d === "all" ? "All" : d.slice(0, 3)}
                </button>
              );
            })}
          </div>
        }
      />

      {filtered.length === 0 ? (
        <Empty icon={Clock} message="No entries for this day." />
      ) : (
        <div className="space-y-5">
          {grouped.order.map((dayKey) => {
            const rows = grouped.map[dayKey];
            const groupTotal = rows.reduce((s, t) => s + totalSecs(t), 0);
            return (
              <div key={dayKey}>
                {/* Day group header */}
                {(() => {
                  const dc = DAY_COLORS[dayKey] || DEFAULT_DAY;
                  return (
                    <div
                      className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest mb-3 border-b border-[#dce4ec] pb-2 ${dc.text}`}
                    >
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] ${dc.pill}`}
                      >
                        {dayKey}
                      </span>
                      <span className="ml-auto bg-slate-100 text-[#768994] px-2 py-0.5 rounded text-[10px] normal-case tracking-normal font-bold shrink-0">
                        {formatDurationText(groupTotal)} · {rows.length}{" "}
                        {rows.length === 1 ? "row" : "rows"}
                      </span>
                    </div>
                  );
                })()}

                {/* Subtask rows — left-bordered like tracker history */}
                <div className="space-y-2">
                  {rows.map((t) => {
                    const dc = DAY_COLORS[t.dayOfWeek] || DEFAULT_DAY;
                    return (
                      <div
                        key={t.id}
                        className={`border-y border-r border-l-4 ${dc.border} border-y-[#dce4ec] border-r-[#dce4ec] rounded-2xl ${dc.bg} p-4 flex items-center gap-4`}
                      >
                        {/* Date stamp */}
                        <div className="shrink-0 text-center w-14">
                          {t.date && (
                            <p className="text-[11px] font-bold text-[#768994]">
                              {t.date}
                            </p>
                          )}
                        </div>

                        {/* Meta */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-[#122027] truncate">
                            {t.jobNumber || "Unknown job"}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            {t.territory && (
                              <span className="text-[11px] font-bold text-[#768994]">
                                {TERRITORY_FLAGS[t.territory] || "🌍"}{" "}
                                {t.territory}
                              </span>
                            )}
                            {t.category && (
                              <span className="text-[10px] font-black text-[#768994] bg-white border border-[#dce4ec] px-2 py-0.5 rounded-full">
                                {t.category}
                              </span>
                            )}
                          </div>
                          {t.notes && (
                            <p className="text-[11px] text-[#768994] mt-1 italic truncate">
                              {t.notes}
                            </p>
                          )}
                        </div>

                        {/* Time */}
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-[#12a0e1]">
                            {formatDurationText(totalSecs(t))}
                          </p>
                          {(t.additionalSeconds ?? 0) > 0 && (
                            <p className="text-[10px] text-[#1cc1a5] font-bold">
                              +{formatDurationText(t.additionalSeconds)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Analytics ─────────────────────────────────────────────────────────────────

function AnalyticsSection({ tasks }) {
  const tooltipStyle = {
    backgroundColor: "#ffffff",
    borderColor: "#dce4ec",
    borderRadius: "12px",
    color: "#323b43",
    fontSize: "11px",
    fontWeight: 600,
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
  };

  const timePerJob = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      const key = (t.jobNumber || "Unknown").split(":")[0].trim();
      if (!map[key]) map[key] = { name: key, mins: 0 };
      map[key].mins += Math.round(
        ((t.rawSeconds ?? 0) + (t.additionalSeconds ?? 0)) / 60
      );
    });
    return Object.values(map)
      .sort((a, b) => b.mins - a.mins)
      .slice(0, 8);
  }, [tasks]);

  const byTerritory = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      const key = t.territory || "Unknown";
      if (!map[key]) map[key] = { name: key, value: 0 };
      map[key].value += (t.rawSeconds ?? 0) + (t.additionalSeconds ?? 0);
    });
    return Object.values(map)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
      .map((d) => ({ ...d, value: Math.round(d.value / 60) }));
  }, [tasks]);

  const byCategory = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      const key = t.category || "Uncategorised";
      if (!map[key]) map[key] = { name: key, value: 0 };
      map[key].value++;
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [tasks]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-[#dce4ec] rounded-2xl p-5 shadow-sm">
          <SectionTitle icon={BarChart2} title="Time per job" />
          {timePerJob.length === 0 ? (
            <Empty icon={BarChart2} message="No data yet." />
          ) : (
            <div style={{ height: 230 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={timePerJob}
                  margin={{ top: 4, right: 4, left: -28, bottom: 30 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#768994", fontSize: 9, fontWeight: 600 }}
                    angle={-30}
                    textAnchor="end"
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#768994", fontSize: 10, fontWeight: 600 }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => [`${v} mins`, "Time"]}
                  />
                  <Bar dataKey="mins" fill="#12a0e1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-[#dce4ec] rounded-2xl p-5 shadow-sm">
          <SectionTitle icon={Globe} title="Time by territory" />
          {byTerritory.length === 0 ? (
            <Empty icon={Globe} message="No data yet." />
          ) : (
            <div style={{ height: 230 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byTerritory}
                    cx="45%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {byTerritory.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => [`${v} mins`, "Time"]}
                  />
                  <Legend
                    iconType="circle"
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                    wrapperStyle={{
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "#768994",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-[#dce4ec] rounded-2xl p-5 shadow-sm">
        <SectionTitle icon={TrendingUp} title="Category breakdown" />
        <div className="space-y-3">
          {byCategory.map(({ name, value }) => {
            const max = byCategory[0]?.value || 1;
            return (
              <div key={name} className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-[#768994] w-36 shrink-0 truncate">
                  {name}
                </span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#12a0e1] rounded-full"
                    style={{ width: `${Math.round((value / max) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] font-black text-[#122027] w-16 text-right shrink-0">
                  {value} <span className="text-[#768994] font-bold">rows</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Settings / token section ──────────────────────────────────────────────────

function SettingsSection({ onSave }) {
  const [status, setStatus] = useState({ checked: false, connected: false });
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    fetchWrikeOAuthStatus().then((s) =>
      setStatus({ checked: true, connected: s.connected })
    );
  }, []);

  const hasToken = status.connected;

  const handleDisconnect = async () => {
    setDisconnecting(true);
    await disconnectWrike();
    localStorage.removeItem("wrike_user_id");
    setStatus({ checked: true, connected: false });
    setDisconnecting(false);
    if (onSave) onSave(false);
  };

  return (
    <div className="space-y-6">
      <SectionTitle icon={Settings} title="Settings" />

      {/* Wrike connection card */}
      <div className="border border-[#dce4ec] rounded-2xl overflow-hidden">
        <div className="bg-slate-50 border-b border-[#dce4ec] px-5 py-3 flex items-center gap-2">
          <Key className="w-4 h-4 text-[#12a0e1]" />
          <span className="text-sm font-black text-[#122027]">
            Wrike Connection
          </span>
          {hasToken && (
            <span className="ml-auto text-[10px] font-black text-[#1cc1a5] bg-[#1cc1a5]/10 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#1cc1a5]" />{" "}
              Connected
            </span>
          )}
          {status.checked && !hasToken && (
            <span className="ml-auto text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-wider border border-amber-200">
              Not connected
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-[#768994] leading-relaxed">
            Connect your Wrike account to fetch tasks, timelogs, and timers.
            You'll approve access on Wrike's own site — no token to copy or
            paste, and it can be revoked here any time.
          </p>
          {hasToken ? (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 border border-red-200 transition-all disabled:opacity-40"
            >
              <LogOut className="w-4 h-4" />
              {disconnecting ? "Disconnecting…" : "Disconnect Wrike"}
            </button>
          ) : (
            <button
              onClick={startWrikeOAuth}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-[#12a0e1] hover:bg-[#0d8bc4] text-white shadow-sm transition-all"
            >
              <ExternalLink className="w-4 h-4" /> Connect to Wrike
            </button>
          )}
        </div>
      </div>

      {/* Info card */}
      <div className="bg-slate-50 border border-[#dce4ec] rounded-2xl p-5">
        <p className="text-xs font-black text-[#768994] uppercase tracking-widest mb-3">
          What connecting unlocks
        </p>
        <div className="space-y-2">
          {[
            "Pull today's timelogs into your timesheet",
            "Show live timer activity on your profile",
            "Fetch active and completed Wrike jobs",
            "Sync lifetime task count",
          ].map((item) => (
            <div
              key={item}
              className="flex items-center gap-2 text-sm text-[#768994]"
            >
              <Check className="w-3.5 h-3.5 text-[#1cc1a5] shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Profile({ wrikeData, onTokenChange, activeSection: activeSectionProp, setActiveSection: setActiveSectionProp }) {
  const [_activeSection, _setActiveSection] = useState(null);
  const activeSection = activeSectionProp !== undefined ? activeSectionProp : _activeSection;
  const setActiveSection = setActiveSectionProp ?? _setActiveSection;
  const activeMeta = SECTIONS.find((s) => s.id === activeSection);
  const [profile, setProfile] = useState(null);
  const [hasToken, setHasToken] = useState(
    () => !!localStorage.getItem("wrike_user_id")
  );
  const [toast, setToast] = useState(null);
  const triggerToast = useCallback((msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2600);
  }, []);

  const { wrikeUser, userStats, handleFetchLifetimeStats } = useWrikeUser(
    wrikeData,
    triggerToast
  );

  const { tasks, loading, addTask } = useTasks(triggerToast, null, wrikeUser?.id);

  useEffect(() => {
    const uid = wrikeUser?.id || localStorage.getItem("wrike_user_id");
    if (!uid) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("wrike_user_id", uid)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data);
      });
  }, [wrikeUser?.id]);

  const displayName = profile
    ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
    : wrikeUser?.firstName || "Your profile";

  const totalSeconds = tasks.reduce(
    (s, t) => s + (t.rawSeconds ?? 0) + (t.additionalSeconds ?? 0),
    0
  );

  // Masked-rise entrance for the hub rows — same as Home's menu, played once
  // per session so drilling in and back out doesn't re-perform it.
  const hubRef = useRef(null);
  useGSAP(
    () => {
      if (activeSection || !hubRef.current || prefersReducedMotion()) return;
      const rises = gsap.utils.toArray("[data-hub-rise]", hubRef.current);
      if (!rises.length) return;
      if (!profileEntrancePlayed) {
        profileEntrancePlayed = true;
        gsap.set(rises, { yPercent: 120 });
        gsap.to(rises, {
          yPercent: 0,
          duration: 0.6,
          ease: "expo.out",
          stagger: 0.055,
        });
      }
    },
    { scope: hubRef, dependencies: [activeSection] }
  );

  return (
    <div className="min-h-screen bg-slate-100 text-[#122027] font-sans pb-16">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10001] animate-in fade-in slide-in-from-bottom-2">
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-bold text-white ${
            toast.type === "success" ? "bg-[#1cc1a5]" : toast.type === "error" ? "bg-rose-500" : "bg-[#122027]"
          }`}>
            {toast.type === "success" && <Check className="w-4 h-4" />}
            {toast.msg}
          </div>
        </div>
      )}
      <PageHeader
        pageId="profile"
        icon={User}
        title={displayName}
        subtitle={[profile?.department, profile?.email].filter(Boolean).join(" · ") || undefined}
        maxWidthClass="max-w-[1400px]"
      >
        {/* Connection state as a single quiet chip — a green dot when linked,
            a tappable amber prompt when not. */}
        {wrikeUser?.id ? (
          <span className="flex items-center gap-1.5 text-[10px] font-black text-white/90 bg-white/15 border border-white/20 px-2.5 py-1.5 rounded-full uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1cc1a5]" /> Connected
          </span>
        ) : (
          <button
            onClick={() => setActiveSection("settings")}
            className="flex items-center gap-1.5 text-[10px] font-black text-white bg-white/15 hover:bg-white/25 border border-white/20 px-2.5 py-1.5 rounded-full uppercase tracking-wider transition-colors"
          >
            <Key className="w-3 h-3" /> Connect Wrike
          </button>
        )}

        {/* Call-sheet totals — large Bricolage figures, matching Motion
            Board's header treatment. */}
        <div className="flex items-center gap-5 sm:gap-7">
          {[
            { label: "Logged", value: tasks.length },
            { label: "Time", value: formatDurationText(totalSeconds) },
            { label: "All-time", value: userStats.fetched ? userStats.allTime : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="text-right">
              <div className="font-display text-2xl sm:text-3xl font-bold text-white leading-none">
                {value}
              </div>
              <div className="text-[9px] font-black text-white/70 uppercase tracking-widest mt-1">
                {label}
              </div>
            </div>
          ))}
        </div>
      </PageHeader>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-8 space-y-6">
        {/* No-token banner */}
        {!hasToken && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4">
            <div className="p-2 bg-amber-100 rounded-xl shrink-0">
              <Key className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-amber-800">
                Wrike not connected
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                Connect your Wrike account to unlock timelogs, live timers, and
                job syncing.
              </p>
            </div>
            <button
              onClick={() => setActiveSection("settings")}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shrink-0 shadow-sm"
            >
              <Key className="w-3.5 h-3.5" /> Connect
            </button>
          </div>
        )}

        {/* ── Hub (rows) ────────────────────────────────────────────────────
            Home's row language recursed into the profile: one stacked list,
            each section a full-width row with a gradient sweep on hover and a
            masked-rise entrance. */}
        {!activeSection && (
          <div ref={hubRef}>
            <div className="flex items-center gap-2 mb-4 px-1">
              <Layers className="w-4 h-4 text-[#12a0e1]" />
              <h2 className="text-sm font-black text-[#122027] uppercase tracking-widest">
                Your Hub
              </h2>
            </div>

            <div className="bg-white rounded-3xl border border-[#dce4ec] shadow-sm overflow-hidden">
              {SECTIONS.map((section) => (
                <HubRow
                  key={section.id}
                  section={section}
                  first={section.featured}
                  onClick={() => setActiveSection(section.id)}
                  badge={
                    section.id === "settings" ? (
                      <span
                        title={hasToken ? "Wrike connected" : "Wrike not connected"}
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          hasToken ? "bg-emerald-500 group-hover:bg-white" : "bg-amber-400 group-hover:bg-white"
                        } transition-colors duration-300`}
                      />
                    ) : null
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Active section ────────────────────────────────────────────── */}
        {activeSection && (
          <div>
            {/* Back bar */}
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setActiveSection(null)}
                className="flex items-center gap-1.5 text-xs font-bold text-[#768994] hover:text-[#122027] bg-white border border-[#dce4ec] hover:border-slate-300 rounded-xl px-3 py-2 shadow-sm transition-all"
              >
                <ChevronLeft className="w-4 h-4" /> Hub
              </button>
              {activeMeta && (
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${activeMeta.gradient} flex items-center justify-center text-white shadow-sm shrink-0`}>
                    <activeMeta.icon className="w-4 h-4" />
                  </div>
                  <h2 className="font-display text-xl font-bold text-[#122027] tracking-tight truncate">
                    {activeMeta.label}
                  </h2>
                </div>
              )}
            </div>

            {loading && activeSection !== "jobs" && activeSection !== "completed" && activeSection !== "settings" ? (
              <div className="bg-white border border-[#dce4ec] rounded-2xl p-16 flex flex-col items-center justify-center gap-3 shadow-sm">
                <RefreshCw className="w-6 h-6 animate-spin text-[#12a0e1]" />
                <p className="text-sm font-bold text-[#768994]">Loading your data…</p>
              </div>
            ) : (
              <div className="bg-white border border-[#dce4ec] rounded-2xl p-6 shadow-sm">
                {activeSection === "overview" && (
                  <OverviewSection
                    tasks={tasks}
                    wrikeUser={wrikeUser}
                    userStats={userStats}
                    handleFetchLifetimeStats={handleFetchLifetimeStats}
                  />
                )}
                {activeSection === "history" && <HistorySection tasks={tasks} />}
                {activeSection === "analytics" && <AnalyticsSection tasks={tasks} />}
                {activeSection === "jobs" && (
                  <JobsSection
                    wrikeUser={wrikeUser}
                    filter="active"
                    wrikeData={wrikeData}
                    onLogTime={addTask}
                    triggerToast={triggerToast}
                  />
                )}
                {activeSection === "completed" && (
                  <JobsSection
                    wrikeUser={wrikeUser}
                    filter="completed"
                    wrikeData={wrikeData}
                    onLogTime={addTask}
                    triggerToast={triggerToast}
                  />
                )}
                {activeSection === "settings" && (
                  <SettingsSection
                    onSave={(val) => {
                      setHasToken(val);
                      if (onTokenChange) onTokenChange(val);
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
