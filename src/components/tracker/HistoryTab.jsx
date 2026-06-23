import React from "react";
import {
  CheckSquare, Film, Globe, Tag, Edit2, Trash2, Play, Pause,
  Clock, FolderInput, FileText, Check, X, Save,
} from "lucide-react";
import SearchableSelect from "../shared/SearchableSelect";
import { TERRITORIES, TERRITORY_FLAGS, CATEGORIES } from "../../constants";
import { formatTimerDisplay, getTimesheetValue } from "../../utils/timeHelpers";
import { getBorderColorClass } from "../../utils/tagStyles";

export default function HistoryTab({
  currentFilteredTasks, consolidatedGroups,
  editingGroupId, setEditingGroupId, editGroupForm, setEditGroupForm,
  editingTaskId, editTaskForm, setEditTaskForm,
  editingTimeId, setEditingTimeId, editTimeForm, setEditTimeForm,
  editingNoteId, setEditingNoteId, editNoteText, setEditNoteText,
  historyTimer, jobOptions,
  startGroupEdit, handleSaveGroupEdit,
  startTaskEdit, handleSaveTaskEdit,
  startEditingTime, saveEditedTime,
  startEditingNote, saveEditedNote,
  toggleHistoryTimer, setItemToDelete,
}) {
  if (currentFilteredTasks.length === 0) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-[#768994] text-center">
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 mb-4">
          <CheckSquare className="w-8 h-8 text-slate-300" />
        </div>
        <p className="font-bold text-[#768994] text-lg">No rows logged yet.</p>
        <p className="text-sm mt-1">Start tracking to populate the timesheet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      {Object.entries(consolidatedGroups).map(([key, group]) => (
        <div
          key={key}
          className={`bg-white border border-[#dce4ec] rounded-2xl shadow-sm transition-all relative ${
            group.jobNumber === "⚠️ Unassigned" || group.territory === "⚠️ Unassigned" || group.category === "⚠️ Unassigned"
              ? "ring-2 ring-rose-400" : ""
          } ${editingGroupId === key ? "z-40 ring-2 ring-[#12a0e1] shadow-lg shadow-[#12a0e1]/10" : "z-20"}`}
        >
          {/* Group header */}
          <div className="bg-[#122027] text-white px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-t-2xl">
            <div className="text-sm font-semibold tracking-tight flex items-center gap-2">
              <Film className="w-4 h-4 text-[#1cc1a5] shrink-0" />
              <span className={`truncate max-w-[300px] ${group.jobNumber === "⚠️ Unassigned" ? "text-rose-400" : ""}`}>
                {group.jobNumber}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 text-xs font-mono bg-[#25373c] px-3 py-1.5 rounded-lg border border-[#323b43]">
                <span className="text-[#12a0e1]">Base Export: {getTimesheetValue(group.totalRaw)}h</span>
                <span className="text-[#1cc1a5]">Add. Export: {getTimesheetValue(group.totalAdd)}h</span>
              </div>
              <button onClick={() => startGroupEdit(group, key)} className="p-1.5 text-[#768994] hover:text-[#12a0e1] hover:bg-[#12a0e1]/20 transition-colors rounded-lg" title="Edit Entire Batch">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => setItemToDelete({ type: "group", ids: group.tasks.map((t) => t.id) })} className="p-1.5 text-[#768994] hover:text-rose-400 hover:bg-rose-500/20 transition-colors rounded-lg" title="Delete Entire Batch">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Batch editor */}
          {editingGroupId === key && (
            <div className="bg-slate-50 px-5 py-4 border-b border-[#dce4ec] space-y-3 relative z-30">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <SearchableSelect options={jobOptions} value={editGroupForm.jobNumber} onChange={(v) => setEditGroupForm({ ...editGroupForm, jobNumber: v })} placeholder="Search Job String..." icon={Film} isGrouped={true} />
                <SearchableSelect options={TERRITORIES} value={editGroupForm.territory} onChange={(v) => setEditGroupForm({ ...editGroupForm, territory: v })} placeholder="Search Territory..." getPrefix={(val) => TERRITORY_FLAGS[val]} />
                <SearchableSelect options={CATEGORIES} value={editGroupForm.category} onChange={(v) => setEditGroupForm({ ...editGroupForm, category: v })} placeholder="Search Category..." icon={Tag} isGrouped={true} alignRight={true} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditingGroupId(null)} className="px-4 py-2 text-xs font-bold text-[#768994] hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
                <button onClick={() => handleSaveGroupEdit(group.tasks)} className="px-4 py-2 text-xs font-bold bg-[#1cc1a5] hover:bg-[#15a38b] text-white rounded-lg shadow-sm shadow-[#1cc1a5]/20 transition-all flex items-center gap-1.5">
                  <Save className="w-3.5 h-3.5" /> Save Batch
                </button>
              </div>
            </div>
          )}

          {/* Group metadata row */}
          <div className="bg-[#f8fafc] px-5 py-2.5 border-b border-[#dce4ec] flex flex-wrap items-center gap-2 text-[10px] font-black text-[#12a0e1] uppercase tracking-widest">
            <span className={`flex items-center gap-1.5 bg-[#12a0e1]/10 px-2.5 py-1 rounded ${group.territory === "⚠️ Unassigned" ? "text-rose-500 bg-rose-50" : ""}`}>
              {TERRITORY_FLAGS[group.territory] ? <span className="text-[12px] leading-none">{TERRITORY_FLAGS[group.territory]}</span> : <Globe className="w-3.5 h-3.5" />}
              {group.territory}
            </span>
            <span className={`flex items-center gap-1 bg-[#12a0e1]/10 px-2 py-1 rounded truncate max-w-[300px] ${group.category === "⚠️ Unassigned" ? "text-rose-500 bg-rose-50" : ""}`}>
              <Tag className="w-3 h-3" /> {group.category}
            </span>
          </div>

          {/* Subtasks */}
          <div className="divide-y divide-[#dce4ec] flex flex-col">
            {group.tasks.map((task, index) => (
              <div key={task.id} className={`flex flex-col relative ${index === group.tasks.length - 1 ? "rounded-b-2xl" : ""}`}>
                <div className={`p-4 hover:bg-slate-50 transition-colors flex flex-col xl:flex-row justify-between gap-4 items-start xl:items-center group/row ${editingTaskId === task.id ? "bg-indigo-50/30" : ""}`}>
                  <div className="flex-1 min-w-0">
                    {editingNoteId === task.id ? (
                      <div className="flex gap-2 items-start w-full">
                        <textarea value={editNoteText} onChange={(e) => setEditNoteText(e.target.value)} rows="4"
                          className="w-full bg-white text-[#323b43] border border-[#dce4ec] rounded-xl p-3 text-sm leading-relaxed resize-y min-h-[100px] outline-none focus:ring-2 focus:ring-[#12a0e1]/20 focus:border-[#12a0e1] shadow-inner transition-all"
                        />
                        <div className="flex flex-col gap-2 shrink-0">
                          <button onClick={() => saveEditedNote(task.id)} className="p-2.5 bg-[#1cc1a5] text-white rounded-lg hover:bg-[#15a38b] shadow-sm shadow-[#1cc1a5]/20 transition-all active:scale-95" title="Save Note"><Check className="w-4 h-4" /></button>
                          <button onClick={() => setEditingNoteId(null)} className="p-2.5 bg-slate-100 text-[#768994] rounded-lg hover:bg-slate-200 transition-colors" title="Cancel"><X className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-1.5 text-sm text-[#323b43] group/note">
                        <FileText className="w-4 h-4 mt-0.5 text-[#12a0e1] shrink-0" />
                        <span className="truncate">{task.notes || <span className="italic opacity-50">No notes provided</span>}</span>
                        <button onClick={() => startEditingNote(task)} className="text-slate-400 hover:text-[#12a0e1] ml-1 opacity-0 group-hover/note:opacity-100 transition-opacity"><Edit2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex flex-col items-end justify-center mr-1">
                      <div className="text-xs font-mono bg-white border border-slate-200 px-2 py-1 rounded text-slate-500">
                        Base: {formatTimerDisplay(task.rawSeconds)}
                      </div>
                      {task.additionalSeconds > 0 && (
                        <div className="text-[10px] font-mono text-[#1cc1a5] mt-1 pr-1 font-bold">
                          + Add: {formatTimerDisplay(task.additionalSeconds)}
                        </div>
                      )}
                    </div>
                    <button onClick={() => toggleHistoryTimer(task.id, "additional")}
                      className={`p-1.5 rounded-lg transition-all ${historyTimer.taskId === task.id && historyTimer.type === "additional" ? "bg-[#12a0e1]/20 text-[#12a0e1] shadow-inner" : "bg-slate-50 text-[#768994] hover:bg-slate-200"}`}
                      title="Log Additional Time"
                    >
                      {historyTimer.taskId === task.id && historyTimer.type === "additional" ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </button>
                    <button onClick={() => startEditingTime(task)} className="p-2 text-[#768994] hover:text-emerald-600 hover:bg-emerald-100 transition-colors rounded-xl mx-0.5 opacity-0 group-hover/row:opacity-100" title="Edit Logged Time"><Clock className="w-4 h-4" /></button>
                    <button onClick={() => startTaskEdit(task)} className="p-2 text-[#768994] hover:text-indigo-600 hover:bg-indigo-100 transition-colors rounded-xl mx-0.5 opacity-0 group-hover/row:opacity-100" title="Reassign / Move Task"><FolderInput className="w-4 h-4" /></button>
                    <button onClick={() => setItemToDelete({ type: "single", ids: [task.id] })} className="p-2 text-[#768994] hover:text-rose-600 hover:bg-rose-100 transition-colors rounded-xl mx-0.5 opacity-0 group-hover/row:opacity-100" title="Delete Subtask"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>

                {/* Time editor */}
                {editingTimeId === task.id && (
                  <div className="bg-emerald-50/50 px-5 py-4 border-t border-[#dce4ec] space-y-3 relative z-30 shadow-inner">
                    <div className="text-xs font-bold text-emerald-900/60 uppercase tracking-wider mb-3">Edit Logged Time:</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {[
                        { label: "Base Time", fields: [["rawHours","Hr"], ["rawMins","Min"], ["rawSecs","Sec"]] },
                        { label: "Additional Time", fields: [["addHours","Hr"], ["addMins","Min"], ["addSecs","Sec"]] },
                      ].map(({ label, fields }) => (
                        <div key={label}>
                          <label className="text-[10px] font-black text-[#768994] uppercase tracking-widest flex items-center gap-1.5 mb-1.5">{label}</label>
                          <div className="flex gap-2">
                            {fields.map(([key, ph], i) => (
                              <React.Fragment key={key}>
                                {i > 0 && <span className="text-[#dce4ec] font-black mt-1">:</span>}
                                <input type="number" min="0" max={i > 0 ? 59 : undefined}
                                  value={editTimeForm[key]}
                                  onChange={(e) => setEditTimeForm({ ...editTimeForm, [key]: e.target.value })}
                                  className="w-full bg-white border border-[#dce4ec] rounded-lg px-2 py-1.5 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-center font-mono"
                                  placeholder={ph}
                                />
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2 pt-3 mt-2 border-t border-emerald-500/10">
                      <button onClick={() => setEditingTimeId(null)} className="px-4 py-2 text-xs font-bold text-[#768994] hover:bg-white rounded-lg transition-colors">Cancel</button>
                      <button onClick={() => saveEditedTime(task.id)} className="px-4 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg shadow-sm shadow-emerald-500/20 transition-all flex items-center gap-1.5">
                        <Save className="w-3.5 h-3.5" /> Save Time
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
