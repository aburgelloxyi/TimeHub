import React from "react";
import { ChevronDown, ChevronRight, RefreshCw, X } from "lucide-react";
import { DAYS, getDarkTagStyle } from "./legacyConstants";
import TableSearchableSelect from "./TableSearchableSelect";
import { CATEGORIES, TERRITORY_FLAGS } from "../../constants.js";

// The Wrike Hub: the week's Wrike time by task, and what hasn't been logged to
// the timesheet yet. Full screen, over the timesheet. Everything it shows and
// does is the timesheet's own (LegacyTimesheets.js), passed in.
export default function WrikeHubModal({
  WRIKE_TS_COLS, activeDay, activeDropdown, expandedGroups, getTaskSortValues,
  handleModalCategoryChange, isFetchingModalData, modalTab, renderDayCell, rows, setActiveDropdown,
  setIsWrikeModalOpen, setModalTab, setShowReminderModal, todayDayName, toggleGroup, unloggedTasks,
  wrikeFullName, wrikeTimesheetData, wtHandle, wtWidths,
}) {
  return (
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
              className={`px-4 py-1.5 text-xs font-black tracking-wide uppercase transition-[background-color,color,box-shadow] rounded-lg ${
                modalTab === "timesheet"
                  ? "bg-[#12a0e1] text-white shadow-md"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              My Timesheet
            </button>
            <button
              onClick={() => setShowReminderModal(true)}
              className="px-4 py-1.5 text-xs font-black tracking-wide uppercase transition-[color] rounded-lg flex items-center gap-2 text-slate-500 hover:text-slate-300"
            >
              Reminders
              {unloggedTasks.length > 0 && (
                <span className="bg-amber-500/80 text-white text-[10px] font-black px-2 py-0.5 rounded-full leading-none">
                  {unloggedTasks.length}
                </span>
              )}
            </button>
          </div>
        </div>
        <button
          onClick={() => setIsWrikeModalOpen(false)}
          className="p-2.5 bg-[#1a2333] hover:bg-[#253247] border border-[#2d3d52] text-slate-400 hover:text-white rounded-xl transition-[background-color,color,box-shadow,transform] shadow-md active:scale-95"
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
          <table className="w-full text-left text-[12px] border-collapse whitespace-nowrap [&_td]:overflow-hidden" style={{ tableLayout: "fixed", minWidth: `${WRIKE_TS_COLS.reduce((s, c) => s + wtWidths[c.key], 0)}px` }}>
            <colgroup>
              {WRIKE_TS_COLS.map((c) => <col key={c.key} style={{ width: wtWidths[c.key] }} />)}
            </colgroup>
            <thead className="bg-[#121824] text-slate-400 font-bold uppercase tracking-wider sticky top-0 z-20 shadow-md border-b border-[#222f3e]">
              <tr>
                <th className="relative px-5 py-3.5 border-r border-[#222f3e] overflow-hidden">
                  Assignment Title{wtHandle("title")}
                </th>
                <th className="relative px-5 py-3.5 border-r border-[#222f3e] overflow-hidden">
                  Status{wtHandle("status")}
                </th>
                <th className="relative px-5 py-3.5 border-r border-[#222f3e] overflow-hidden">
                  Category Link{wtHandle("category")}
                </th>
                <th className="relative px-5 py-3.5 border-r border-[#222f3e] overflow-hidden">
                  Job Key{wtHandle("jobkey")}
                </th>
                <th className="relative px-5 py-3.5 border-r border-[#222f3e] overflow-hidden">
                  Due Date{wtHandle("due")}
                </th>
                <th className="relative px-5 py-3.5 border-r border-[#222f3e] overflow-hidden">
                  Location{wtHandle("location")}
                </th>
                {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d, i) => {
                  const dayName = DAYS[i];
                  const isCurrent = todayDayName === dayName;
                  const isEnd = d === "Sa" || d === "Su";
                  return (
                    <th
                      key={d}
                      className={`relative px-4 py-3.5 border-r border-[#222f3e] text-center overflow-hidden last:border-r-0 ${
                        isCurrent
                          ? "bg-[#12a0e1]/15 text-[#38bdf8] font-black"
                          : isEnd
                          ? "text-rose-400/60"
                          : ""
                      }`}
                    >
                      {d}{wtHandle(`day_${d}`)}
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
                          className="bg-[#141b27] hover:bg-[#1a2436] transition-[background-color] cursor-pointer border-y border-[#222f3e]"
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
                                className={`transition-[background-color] group border-b border-[#1e293b]/40 ${
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
                                            <span className="text-[10px] font-black uppercase tracking-wider text-rose-500">
                                              overdue
                                            </span>
                                          )}
                                          {isToday && (
                                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-500">
                                              today
                                            </span>
                                          )}
                                          {isTomorrow && (
                                            <span className="text-[10px] font-black uppercase tracking-wider text-yellow-500">
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
      </div>
    </div>
  );
}
