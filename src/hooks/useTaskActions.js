import { DAYS_OF_WEEK } from "../constants";
import { guessFieldsFromTask } from "../utils/wrikeHelpers";

/**
 * All task manipulation handlers: log, delete, edit group/task/time/note,
 * export/import, Wrike pull, recent jobs.
 *
 * Receives state slice + setters from useTrackerState.
 */
export function useTaskActions(state) {
  const {
    jobNumber, territory, category, notes,
    setJobNumber, setTerritory, setCategory, setNotes,
    isRunning, elapsedTime, setIsRunning, setElapsedTime, setTrackingSince,
    entryMode, manualHours, manualMinutes, setManualHours, setManualMinutes,
    setShowReward,
    retainJobNumber, retainTerritory, retainCategory,
    selectedDay,
    tasks, setTasks, addTask, addTasks, updateTask, updateTasks, deleteTasks, importTasks,
    jobOptions, setJobOptions,
    triggerToast,
    setTriageQueue,
    itemToDelete, setItemToDelete,
    setJsonCopied,
    pastedJson, setPastedJson,
    editingNoteId, setEditingNoteId, editNoteText,
    historyTimer, setHistoryTimer,
    editingGroupId, setEditingGroupId, editGroupForm,
    editingTaskId, setEditingTaskId, editTaskForm,
    editingTimeId, setEditingTimeId, editTimeForm,
    setShowRecentJobsModal, recentTaskDraft, setRecentTaskDraft,
  } = state;

  // --- Timer toggle ---
  const handleToggleTimer = () => {
    if (!jobNumber.trim() || !territory.trim() || !category.trim()) {
      triggerToast("Please assign Job String, Country, and Category to track.");
      return;
    }
    if (isRunning) {
      setIsRunning(false);
      setTrackingSince(null);
    } else {
      setIsRunning(true);
      setTrackingSince(Date.now() - elapsedTime * 1000);
    }
  };

  // --- Log task ---
  const handleLogTask = () => {
    if (!jobNumber.trim() || !territory.trim() || !category.trim()) {
      triggerToast("Cannot save row without Job Number, Country, and Category.");
      return;
    }

    let finalSeconds = elapsedTime;
    if (entryMode === "manual") {
      finalSeconds =
        parseInt(manualHours || 0, 10) * 3600 +
        parseInt(manualMinutes || 0, 10) * 60;
      if (finalSeconds === 0) return triggerToast("Enter a valid manual duration.");
    } else if (elapsedTime === 0) {
      return triggerToast("No time tracked to log.");
    }

    if (jobNumber && !jobOptions.includes(jobNumber))
      setJobOptions((prev) => [...prev, jobNumber]);

    const newTask = {
      id: Date.now(),
      jobNumber, territory, category, notes,
      dayOfWeek: selectedDay,
      rawSeconds: finalSeconds,
      additionalSeconds: 0,
      date: new Date().toLocaleDateString(),
      timeLogged: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    addTask(newTask);
    triggerToast(`Logged successfully to ${selectedDay}!`, "success");
    setShowReward(true);
    setTimeout(() => setShowReward(false), 1200);

    if (entryMode === "timer") {
      setIsRunning(false);
      setTrackingSince(null);
      setElapsedTime(0);
    } else {
      setManualHours("");
      setManualMinutes("");
    }

    if (!retainJobNumber) setJobNumber("");
    if (!retainTerritory) setTerritory("");
    if (!retainCategory) setCategory("");
    setNotes("");
  };

  // --- Pull Wrike time ---
  const handlePullWrikeTime = async (wrikeData) => {
    const token = localStorage.getItem("wrike_personal_token");
    if (!token) return triggerToast("Please enter your Wrike token in the Wrike API tab first.");
    if (!wrikeData?.length) return triggerToast("Please fetch Wrike data in the API tab first so we can match tasks.");

    state.setIsPullingTime(true);

    try {
      const [timelogsRes, timersRes] = await Promise.all([
        fetch("https://www.wrike.com/api/v4/timelogs?me=true", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("https://www.wrike.com/api/v4/timers", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const logs = (await timelogsRes.json()).data || [];
      const activeTimers = (await timersRes.json()).data || [];

      let newTasksCount = 0;
      const newTasks = [];
      const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const cutoffTime = todayStart.getTime();

      const parseAndGuessFields = (taskId, commentText, fallBackTitle) => {
        const linkedTask = wrikeData.find((t) => t.id === taskId);
        const guessed = guessFieldsFromTask(linkedTask, jobOptions);
        return { ...guessed, notes: commentText || guessed.notes || fallBackTitle };
      };

      logs.forEach((log) => {
        const logDate = new Date(log.trackedDate);
        if (logDate.getTime() < cutoffTime) return;
        if (tasks.some((t) => t.wrikeTimelogId === log.id)) return;

        const fields = parseAndGuessFields(log.taskId, log.comment, "Wrike Timelog");
        const logDayName = dayNames[logDate.getDay()];

        newTasks.push({
          id: Date.now() + Math.random(),
          wrikeTimelogId: log.id,
          ...fields,
          dayOfWeek: DAYS_OF_WEEK.includes(logDayName) ? logDayName : "Monday",
          rawSeconds: Math.floor(log.hours * 3600),
          additionalSeconds: 0,
          date: logDate.toLocaleDateString(),
          timeLogged: logDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
        newTasksCount++;
      });

      activeTimers.forEach((timer) => {
        const timerUniqueId = `timer-${timer.taskId}-${timer.updatedDate}`;
        if (tasks.some((t) => t.wrikeTimelogId === timerUniqueId)) return;

        const logDate = new Date(timer.updatedDate);
        if (logDate.getTime() < cutoffTime) return;

        const accumulatedSeconds = Math.floor((timer.accumulatedMins || 0) * 60);
        const safeSeconds = accumulatedSeconds > 0 ? accumulatedSeconds : 60;
        const fields = parseAndGuessFields(timer.taskId, "", "Wrike Live Timer");
        const logDayName = dayNames[logDate.getDay()];

        newTasks.push({
          id: Date.now() + Math.random(),
          wrikeTimelogId: timerUniqueId,
          ...fields,
          notes: `${fields.notes} [Live Wrike Timer ⏱️]`,
          dayOfWeek: DAYS_OF_WEEK.includes(logDayName) ? logDayName : "Monday",
          rawSeconds: safeSeconds,
          additionalSeconds: 0,
          date: logDate.toLocaleDateString(),
          timeLogged: logDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
        newTasksCount++;
      });

      if (newTasksCount > 0) {
        addTasks(newTasks);
        triggerToast(`Pulled ${newTasksCount} entries from today!`, "success");

        const needingTriage = newTasks.filter((t) => t.category === "⚠️ Unassigned");
        if (needingTriage.length > 0) {
          const uniqueBatches = [];
          needingTriage.forEach((t) => {
            const match = uniqueBatches.find(
              (b) => b.jobNumber === t.jobNumber && b.territory === t.territory
            );
            if (match) match.taskIds.push(t.id);
            else uniqueBatches.push({ jobNumber: t.jobNumber, territory: t.territory, taskIds: [t.id], sampleTitle: t.notes });
          });
          setTriageQueue(uniqueBatches);
        }
      } else {
        triggerToast("No new timelogs found for today.");
      }
    } catch (err) {
      triggerToast("Failed to fetch data segments: " + err.message);
    } finally {
      state.setIsPullingTime(false);
    }
  };

  // --- Group edit ---
  const startGroupEdit = (group, key) => {
    setEditingGroupId(key);
    state.setEditGroupForm({
      jobNumber: group.jobNumber === "⚠️ Unassigned" ? "" : group.jobNumber,
      territory: group.territory === "⚠️ Unassigned" ? "" : group.territory,
      category: group.category === "⚠️ Unassigned" ? "" : group.category,
    });
  };

  const handleSaveGroupEdit = (groupTasks) => {
    if (!editGroupForm.jobNumber || !editGroupForm.territory || !editGroupForm.category) {
      triggerToast("Please select Job, Country, and Category for the batch.");
      return;
    }
    const taskIds = groupTasks.map((t) => t.id);
    updateTasks(taskIds, { jobNumber: editGroupForm.jobNumber, territory: editGroupForm.territory, category: editGroupForm.category });
    if (editGroupForm.jobNumber && !jobOptions.includes(editGroupForm.jobNumber)) {
      setJobOptions((prev) => [...prev, editGroupForm.jobNumber]);
    }
    setEditingGroupId(null);
    triggerToast("Batch updated and assigned successfully!", "success");
  };

  // --- Task edit ---
  const startTaskEdit = (task) => {
    setEditingTaskId(task.id);
    state.setEditTaskForm({
      jobNumber: task.jobNumber === "⚠️ Unassigned" ? "" : task.jobNumber,
      territory: task.territory === "⚠️ Unassigned" ? "" : task.territory,
      category: task.category === "⚠️ Unassigned" ? "" : task.category,
    });
  };

  const handleSaveTaskEdit = (taskId) => {
    if (!editTaskForm.jobNumber || !editTaskForm.territory || !editTaskForm.category) {
      triggerToast("Please select Job, Country, and Category to move this task.");
      return;
    }
    updateTask(taskId, { jobNumber: editTaskForm.jobNumber, territory: editTaskForm.territory, category: editTaskForm.category });
    if (editTaskForm.jobNumber && !jobOptions.includes(editTaskForm.jobNumber)) {
      setJobOptions((prev) => [...prev, editTaskForm.jobNumber]);
    }
    setEditingTaskId(null);
    triggerToast("Subtask detached and moved successfully!", "success");
  };

  // --- Time edit ---
  const startEditingTime = (task) => {
    setEditingTimeId(task.id);
    state.setEditTimeForm({
      rawHours: Math.floor((task.rawSeconds || 0) / 3600),
      rawMins: Math.floor(((task.rawSeconds || 0) % 3600) / 60),
      rawSecs: (task.rawSeconds || 0) % 60,
      addHours: Math.floor((task.additionalSeconds || 0) / 3600),
      addMins: Math.floor(((task.additionalSeconds || 0) % 3600) / 60),
      addSecs: (task.additionalSeconds || 0) % 60,
    });
  };

  const saveEditedTime = (id) => {
    const newRaw =
      parseInt(editTimeForm.rawHours || 0) * 3600 +
      parseInt(editTimeForm.rawMins || 0) * 60 +
      parseInt(editTimeForm.rawSecs || 0);
    const newAdd =
      parseInt(editTimeForm.addHours || 0) * 3600 +
      parseInt(editTimeForm.addMins || 0) * 60 +
      parseInt(editTimeForm.addSecs || 0);

    updateTask(id, { rawSeconds: newRaw, additionalSeconds: newAdd });
    setEditingTimeId(null);
    triggerToast("Time updated successfully!", "success");
  };

  // --- Note edit ---
  const startEditingNote = (task) => {
    setEditingNoteId(task.id);
    state.setEditNoteText(task.notes || "");
  };

  const saveEditedNote = (id) => {
    updateTask(id, { notes: state.editNoteText });
    setEditingNoteId(null);
    triggerToast("Note updated.", "success");
  };

  // --- Delete ---
  const executeDelete = () => {
    if (!itemToDelete) return;
    if (historyTimer.taskId && itemToDelete.ids.includes(historyTimer.taskId)) {
      setHistoryTimer({ taskId: null, type: null });
    }
    deleteTasks(itemToDelete.ids);
    triggerToast(
      itemToDelete.type === "group" ? "Batch deleted successfully." : "Subtask deleted successfully.",
      "success"
    );
    setItemToDelete(null);
  };

  // --- History timer ---
  const toggleHistoryTimer = (taskId, type) => {
    setHistoryTimer((prev) =>
      prev.taskId === taskId && prev.type === type
        ? { taskId: null, type: null }
        : { taskId, type }
    );
  };

  // --- Export / import ---
  const getConsolidatedTasks = (taskList) => {
    const consolidated = {};
    taskList.forEach((t) => {
      const key = `${t.dayOfWeek}|${t.jobNumber}|${t.territory}|${t.category}`;
      if (!consolidated[key]) {
        consolidated[key] = { ...t, rawSeconds: 0, additionalSeconds: 0, notesArray: [], subtaskCount: 0 };
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

  const generateExportData = () => ({
    version: 5,
    exportDate: new Date().toISOString(),
    tasks: getConsolidatedTasks(tasks),
    rawTasks: tasks,
    jobOptions,
  });

  const handleCopyJSONToClipboard = () => {
    try {
      const tempTextArea = document.createElement("textarea");
      tempTextArea.value = JSON.stringify(generateExportData());
      document.body.appendChild(tempTextArea);
      tempTextArea.select();
      document.execCommand("copy");
      document.body.removeChild(tempTextArea);
      setJsonCopied(true);
      triggerToast("JSON Copied! Ready to paste into Timesheet Bookmarklet.", "success");
      setTimeout(() => setJsonCopied(false), 3000);
    } catch {
      triggerToast("Failed to copy JSON.");
    }
  };

  const handlePasteImport = async () => {
    try {
      const data = JSON.parse(pastedJson);
      const tasksToImport = data.rawTasks || data.tasks || [];
      if (data && tasksToImport) {
        const count = await importTasks(tasksToImport);
        if (data.jobOptions) setJobOptions((prev) => [...new Set([...prev, ...data.jobOptions])]);
        setPastedJson("");
        if (count > 0) triggerToast(`Merged ${count} new tasks successfully!`, "success");
      } else throw new Error("Invalid format");
    } catch {
      triggerToast("Invalid JSON syntax pasted.");
    }
  };

  // --- Recent jobs ---
  const handleExpandRecentJob = (task) => {
    const guessed = guessFieldsFromTask(task, jobOptions);
    setRecentTaskDraft({
      taskId: task.id,
      jobNumber: guessed.jobNumber !== "⚠️ Unassigned" ? guessed.jobNumber : "",
      territory: guessed.territory !== "⚠️ Unassigned" ? guessed.territory : "",
      category: "",
      notes: task.title || "",
      hours: "",
      minutes: "",
    });
  };

  const handleInstaLogRecentJob = () => {
    if (!recentTaskDraft.category) {
      triggerToast("Please select a category first.");
      return;
    }
    const finalSeconds =
      parseInt(recentTaskDraft.hours || 0, 10) * 3600 +
      parseInt(recentTaskDraft.minutes || 0, 10) * 60;
    if (finalSeconds === 0) {
      triggerToast("Please enter the time spent (Hrs/Mins) to log.");
      return;
    }
    if (recentTaskDraft.jobNumber && !jobOptions.includes(recentTaskDraft.jobNumber)) {
      setJobOptions((prev) => [...prev, recentTaskDraft.jobNumber]);
    }
    const newTask = {
      id: Date.now(),
      jobNumber: recentTaskDraft.jobNumber,
      territory: recentTaskDraft.territory,
      category: recentTaskDraft.category,
      notes: recentTaskDraft.notes,
      dayOfWeek: selectedDay,
      rawSeconds: finalSeconds,
      additionalSeconds: 0,
      date: new Date().toLocaleDateString(),
      timeLogged: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    addTask(newTask);
    triggerToast(`Insta-Logged successfully to ${selectedDay}!`, "success");
    setShowReward(true);
    setTimeout(() => setShowReward(false), 1200);
    setShowRecentJobsModal(false);
    setRecentTaskDraft(null);
  };

  const handleConfirmRecentJob = () => {
    if (!recentTaskDraft.category) {
      triggerToast("Please select a category first.");
      return;
    }
    setJobNumber(recentTaskDraft.jobNumber);
    setTerritory(recentTaskDraft.territory);
    setCategory(recentTaskDraft.category);
    setNotes(recentTaskDraft.notes);
    setShowRecentJobsModal(false);
    setRecentTaskDraft(null);
    triggerToast("Job loaded! Hit Start Timer when ready.", "success");
  };

  return {
    handleToggleTimer,
    handleLogTask,
    handlePullWrikeTime,
    startGroupEdit, handleSaveGroupEdit,
    startTaskEdit, handleSaveTaskEdit,
    startEditingTime, saveEditedTime,
    startEditingNote, saveEditedNote,
    executeDelete,
    toggleHistoryTimer,
    getConsolidatedTasks,
    handleCopyJSONToClipboard,
    handlePasteImport,
    handleExpandRecentJob,
    handleInstaLogRecentJob,
    handleConfirmRecentJob,
  };
}
