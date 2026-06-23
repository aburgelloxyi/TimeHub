import { useState, useEffect } from "react";
import { DEFAULT_JOBS, DAYS_OF_WEEK } from "../constants";

/**
 * All state and non-API logic for the Tracker component.
 * Keeps Tracker.jsx focused purely on rendering.
 */
export function useTrackerState() {
  // --- Form fields ---
  const [jobNumber, setJobNumber] = useState("");
  const [territory, setTerritory] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");

  // --- Timer ---
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [trackingSince, setTrackingSince] = useState(null);
  const [entryMode, setEntryMode] = useState("timer");
  const [manualHours, setManualHours] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [showReward, setShowReward] = useState(false);

  // --- Retain toggles ---
  const [retainJobNumber, setRetainJobNumber] = useState(true);
  const [retainTerritory, setRetainTerritory] = useState(true);
  const [retainCategory, setRetainCategory] = useState(true);

  // --- Day / Tab ---
  const [selectedDay, setSelectedDay] = useState(() => {
    const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const todayName = dayNames[new Date().getDay()];
    return DAYS_OF_WEEK.includes(todayName) ? todayName : "Monday";
  });
  const [activeTab, setActiveTab] = useState("history");

  // --- Tasks & job options (persisted) ---
  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem("xyi_timesheet_tasks_v5");
    return saved ? JSON.parse(saved) : [];
  });
  const [jobOptions, setJobOptions] = useState(() => {
    const saved = localStorage.getItem("xyi_job_options_v5");
    return saved ? JSON.parse(saved) : DEFAULT_JOBS;
  });

  useEffect(() => {
    localStorage.setItem("xyi_timesheet_tasks_v5", JSON.stringify(tasks));
    localStorage.setItem("xyi_job_options_v5", JSON.stringify(jobOptions));
  }, [tasks, jobOptions]);

  // --- Toast ---
  const [toast, setToast] = useState({ show: false, message: "", type: "error" });
  const triggerToast = (message, type = "error") => setToast({ show: true, message, type });

  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(
        () => setToast({ show: false, message: "", type: "error" }),
        4000
      );
      return () => clearTimeout(timer);
    }
  }, [toast.show]);

  // --- Triage & modals ---
  const [triageQueue, setTriageQueue] = useState([]);
  const [triageCategory, setTriageCategory] = useState("");
  const [itemToDelete, setItemToDelete] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showRecentJobsModal, setShowRecentJobsModal] = useState(false);
  const [recentTaskDraft, setRecentTaskDraft] = useState(null);
  const [recentJobsFilter, setRecentJobsFilter] = useState("Active");
  const [jsonCopied, setJsonCopied] = useState(false);
  const [pastedJson, setPastedJson] = useState("");

  // --- Inline editing ---
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteText, setEditNoteText] = useState("");
  const [historyTimer, setHistoryTimer] = useState({ taskId: null, type: null });
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editGroupForm, setEditGroupForm] = useState({ jobNumber: "", territory: "", category: "" });
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTaskForm, setEditTaskForm] = useState({ jobNumber: "", territory: "", category: "" });
  const [editingTimeId, setEditingTimeId] = useState(null);
  const [editTimeForm, setEditTimeForm] = useState({
    rawHours: 0, rawMins: 0, rawSecs: 0,
    addHours: 0, addMins: 0, addSecs: 0,
  });

  // --- Timer interval ---
  useEffect(() => {
    let interval;
    if (isRunning && trackingSince) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - trackingSince) / 1000));
      }, 1000);
    }

    if (historyTimer.taskId) {
      if (!interval) interval = setInterval(() => {}, 1000);
      setTasks((prevTasks) =>
        prevTasks.map((t) => {
          if (t.id === historyTimer.taskId && historyTimer.type === "additional") {
            return { ...t, additionalSeconds: (t.additionalSeconds || 0) + 1 };
          }
          return t;
        })
      );
    }
    return () => clearInterval(interval);
  }, [isRunning, trackingSince, historyTimer]);

  return {
    // Form fields
    jobNumber, setJobNumber,
    territory, setTerritory,
    category, setCategory,
    notes, setNotes,
    // Timer
    isRunning, setIsRunning,
    elapsedTime, setElapsedTime,
    trackingSince, setTrackingSince,
    entryMode, setEntryMode,
    manualHours, setManualHours,
    manualMinutes, setManualMinutes,
    showReward, setShowReward,
    // Retain
    retainJobNumber, setRetainJobNumber,
    retainTerritory, setRetainTerritory,
    retainCategory, setRetainCategory,
    // Day/Tab
    selectedDay, setSelectedDay,
    activeTab, setActiveTab,
    // Tasks
    tasks, setTasks,
    jobOptions, setJobOptions,
    // Toast
    toast, setToast, triggerToast,
    // Triage & modals
    triageQueue, setTriageQueue,
    triageCategory, setTriageCategory,
    itemToDelete, setItemToDelete,
    showExportModal, setShowExportModal,
    showRecentJobsModal, setShowRecentJobsModal,
    recentTaskDraft, setRecentTaskDraft,
    recentJobsFilter, setRecentJobsFilter,
    jsonCopied, setJsonCopied,
    pastedJson, setPastedJson,
    // Inline editing
    editingNoteId, setEditingNoteId,
    editNoteText, setEditNoteText,
    historyTimer, setHistoryTimer,
    editingGroupId, setEditingGroupId,
    editGroupForm, setEditGroupForm,
    editingTaskId, setEditingTaskId,
    editTaskForm, setEditTaskForm,
    editingTimeId, setEditingTimeId,
    editTimeForm, setEditTimeForm,
  };
}
