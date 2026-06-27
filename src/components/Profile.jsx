import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  Key,
  Settings,
  Eye,
  EyeOff,
  Check,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useTasks } from "../hooks/useTasks";
import { useWrikeUser } from "../hooks/useWrikeUser";
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

const SECTIONS = [
  { id: "overview", label: "Overview", icon: User },
  { id: "history", label: "Timesheet", icon: Clock },
  { id: "analytics", label: "Analytics", icon: BarChart2 },
  { id: "jobs", label: "Active jobs", icon: Briefcase },
  { id: "completed", label: "Completed", icon: CheckCircle },
  { id: "settings", label: "Settings", icon: Settings },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
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

// ── Wrike task card — mirrors the RecentJobsModal style ───────────────────────

function WrikeTaskCard({ task, filter }) {
  const statusName = task.customStatusName || task.status;
  const borderColor = getBorderColorClass(statusName);
  const isMatrix = task.title?.toUpperCase().includes("MATRIX");
  const updatedStr = fmtDate(task.updatedDate);
  const completedStr = fmtDate(task.completedDate);
  const dueStr = fmtDate(task.dueDate);

  return (
    <div
      className={`p-4 border-y border-r border-l-4 rounded-2xl ${borderColor} ${
        isMatrix
          ? "border-y-[#dce4ec] border-r-[#dce4ec] bg-slate-200/50 opacity-70"
          : "border-y-[#dce4ec] border-r-[#dce4ec] bg-slate-50"
      }`}
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

function JobsSection({ wrikeUser, filter }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchTasks = useCallback(async () => {
    if (!wrikeUser?.id) return;
    const token = localStorage.getItem("wrike_personal_token");
    if (!token) return;

    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };
    const fields = encodeURIComponent("[description,superTaskIds]");

    try {
      const [aRes, cRes, wRes] = await Promise.all([
        fetch(
          `https://www.wrike.com/api/v4/tasks?responsibles=[${wrikeUser.id}]&status=Active&fields=${fields}&pageSize=500`,
          { headers }
        ),
        fetch(
          `https://www.wrike.com/api/v4/tasks?responsibles=[${wrikeUser.id}]&fields=${fields}&pageSize=1000`,
          { headers }
        ),
        fetch("https://www.wrike.com/api/v4/workflows", { headers }),
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
              <WrikeTaskCard key={task.id} task={task} filter={filter} />
            ))}
          </div>
        </div>
      ))}
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
    const token = localStorage.getItem("wrike_personal_token");
    const uid = wrikeUser?.id;
    if (!token || !uid) return;

    setActivityLoading(true);
    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(
        `https://www.wrike.com/api/v4/contacts/${uid}/timelogs?plainText=true`,
        { headers }
      ),
      fetch("https://www.wrike.com/api/v4/timers", { headers }),
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
            const res = await fetch(
              `https://www.wrike.com/api/v4/tasks/${batch.join(",")}`,
              { headers }
            );
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

      {/* Lifetime sync nudge */}
      {wrikeUser && !userStats.fetched && (
        <div className="bg-[#12a0e1]/5 border border-[#12a0e1]/20 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black text-[#122027]">
              Sync your lifetime Wrike stats
            </p>
            <p className="text-xs text-[#768994] mt-0.5">
              Fetch all-time completed task count from Wrike
            </p>
          </div>
          <button
            onClick={handleFetchLifetimeStats}
            disabled={userStats.loading}
            className="flex items-center gap-2 bg-[#12a0e1] hover:bg-[#0d8bc4] text-white text-xs font-bold px-4 py-2 rounded-xl transition-all disabled:opacity-50 shadow-sm shrink-0"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                userStats.loading ? "animate-spin" : ""
              }`}
            />
            {userStats.loading ? "Syncing…" : "Sync now"}
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
  const [token, setToken] = useState(
    () => localStorage.getItem("wrike_personal_token") || ""
  );
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const trimmed = token.trim();
    localStorage.setItem("wrike_personal_token", trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    if (onSave) onSave(true);
  };

  const handleClear = () => {
    setToken("");
    localStorage.removeItem("wrike_personal_token");
    if (onSave) onSave(false);
  };

  const hasToken = !!localStorage.getItem("wrike_personal_token");

  return (
    <div className="space-y-6">
      <SectionTitle icon={Settings} title="Settings" />

      {/* Wrike token card */}
      <div className="border border-[#dce4ec] rounded-2xl overflow-hidden">
        <div className="bg-slate-50 border-b border-[#dce4ec] px-5 py-3 flex items-center gap-2">
          <Key className="w-4 h-4 text-[#12a0e1]" />
          <span className="text-sm font-black text-[#122027]">
            Wrike Personal Token
          </span>
          {hasToken && (
            <span className="ml-auto text-[10px] font-black text-[#1cc1a5] bg-[#1cc1a5]/10 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#1cc1a5]" />{" "}
              Connected
            </span>
          )}
          {!hasToken && (
            <span className="ml-auto text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-wider border border-amber-200">
              Not set
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-[#768994] leading-relaxed">
            Your Wrike permanent token is used to fetch tasks, timelogs, and
            timers. It's stored locally in your browser and never sent to our
            servers. You can generate one from{" "}
            <span className="font-bold text-[#12a0e1]">
              Wrike → Profile → Apps & Integrations → API
            </span>
            .
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={show ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your Wrike permanent token…"
                className="w-full text-sm font-medium bg-white border border-[#dce4ec] rounded-xl px-4 py-2.5 pr-10 text-[#122027] placeholder-[#c4cdd4] focus:outline-none focus:ring-2 focus:ring-[#12a0e1]/30 focus:border-[#12a0e1] transition-all"
              />
              <button
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#768994] hover:text-[#122027] transition-colors"
              >
                {show ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <button
              onClick={handleSave}
              disabled={!token.trim()}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40 shrink-0 ${
                saved
                  ? "bg-[#1cc1a5] text-white"
                  : "bg-[#12a0e1] hover:bg-[#0d8bc4] text-white shadow-sm"
              }`}
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4" /> Saved
                </>
              ) : (
                "Save"
              )}
            </button>
            {hasToken && (
              <button
                onClick={handleClear}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 border border-red-200 transition-all shrink-0"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-slate-50 border border-[#dce4ec] rounded-2xl p-5">
        <p className="text-xs font-black text-[#768994] uppercase tracking-widest mb-3">
          What the token unlocks
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

export default function Profile({ wrikeData, onTokenChange }) {
  const [activeSection, setActiveSection] = useState("overview");
  const [profile, setProfile] = useState(null);
  const [hasToken, setHasToken] = useState(
    () => !!localStorage.getItem("wrike_personal_token")
  );
  const triggerToast = () => {};

  const { wrikeUser, userStats, handleFetchLifetimeStats } = useWrikeUser(
    wrikeData,
    triggerToast
  );

  const { tasks, loading } = useTasks(triggerToast, null, wrikeUser?.id);

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

  const initials = useMemo(() => {
    const f = profile?.first_name || wrikeUser?.firstName || "";
    const l = profile?.last_name || "";
    return `${f[0] || ""}${l[0] || ""}`.toUpperCase() || "?";
  }, [profile, wrikeUser]);

  const displayName = profile
    ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
    : wrikeUser?.firstName || "Your profile";

  const totalSeconds = tasks.reduce(
    (s, t) => s + (t.rawSeconds ?? 0) + (t.additionalSeconds ?? 0),
    0
  );

  return (
    <div className="min-h-screen bg-slate-100 text-[#122027] font-sans pb-16">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-8 space-y-6">
        {/* Hero header */}
        <div className="bg-white border border-[#dce4ec] rounded-[2rem] overflow-hidden shadow-sm">
          {/* Gradient bar */}
          <div className="h-1.5 bg-gradient-to-r from-[#12a0e1] to-[#1cc1a5]" />
          <div className="p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#12a0e1] to-[#1cc1a5] flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-[#12a0e1]/20">
                {initials}
              </div>
              {/* Active dot */}
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#1cc1a5] border-2 border-white" />
            </div>

            {/* Identity */}
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-black tracking-tight text-[#122027]">
                {displayName}
              </h1>
              <div className="flex flex-wrap items-center gap-2.5 mt-2">
                {profile?.email && (
                  <span className="text-xs text-[#768994] font-medium">
                    {profile.email}
                  </span>
                )}
                {wrikeUser?.id && (
                  <span className="text-[10px] font-black text-[#768994] bg-slate-100 px-2.5 py-1 rounded-full uppercase tracking-wider">
                    Wrike · {wrikeUser.id.slice(0, 8)}…
                  </span>
                )}
                {profile?.updated_at && (
                  <span className="text-[10px] font-black text-[#1cc1a5] bg-[#1cc1a5]/10 px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1cc1a5]" />{" "}
                    Active
                  </span>
                )}
              </div>
            </div>

            {/* Quick stats */}
            <div className="flex gap-4 shrink-0">
              {[
                { label: "Tasks", value: tasks.length },
                { label: "Time", value: formatDurationText(totalSeconds) },
                {
                  label: "All-time",
                  value: userStats.fetched ? userStats.allTime : "—",
                },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <div className="text-xl font-black text-[#122027]">
                    {value}
                  </div>
                  <div className="text-[10px] font-black text-[#768994] uppercase tracking-wider mt-0.5">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* No-token banner */}
        {!hasToken && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4">
            <div className="p-2 bg-amber-100 rounded-xl shrink-0">
              <Key className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-amber-800">
                Wrike token not set
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                Add your personal token to unlock timelogs, live timers, and job
                syncing.
              </p>
            </div>
            <button
              onClick={() => setActiveSection("settings")}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shrink-0 shadow-sm"
            >
              <Key className="w-3.5 h-3.5" /> Add token
            </button>
          </div>
        )}

        {/* Layout */}
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* Sidebar */}
          <nav className="w-full lg:w-48 shrink-0 bg-white border border-[#dce4ec] rounded-2xl p-2 shadow-sm lg:sticky lg:top-6">
            {SECTIONS.map(({ id, label, icon: Icon }) => {
              const active = activeSection === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold transition-all mb-0.5 last:mb-0 group ${
                    active
                      ? "bg-[#12a0e1]/10 text-[#12a0e1]"
                      : "text-[#768994] hover:bg-slate-50 hover:text-[#122027]"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">{label}</span>
                  {active && (
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="bg-white border border-[#dce4ec] rounded-2xl p-16 flex flex-col items-center justify-center gap-3 shadow-sm">
                <RefreshCw className="w-6 h-6 animate-spin text-[#12a0e1]" />
                <p className="text-sm font-bold text-[#768994]">
                  Loading your data…
                </p>
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
                {activeSection === "history" && (
                  <HistorySection tasks={tasks} />
                )}
                {activeSection === "analytics" && (
                  <AnalyticsSection tasks={tasks} />
                )}
                {activeSection === "jobs" && (
                  <JobsSection wrikeUser={wrikeUser} filter="active" />
                )}
                {activeSection === "completed" && (
                  <JobsSection wrikeUser={wrikeUser} filter="completed" />
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
        </div>
      </div>
    </div>
  );
}
