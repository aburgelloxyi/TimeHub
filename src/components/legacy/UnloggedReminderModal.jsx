import { CheckCircle, X } from "lucide-react";
import { TIME_OPTIONS, getDarkTagStyle } from "./legacyConstants";
import { TERRITORY_FLAGS } from "../../constants.js";
import TableSearchableSelect from "./TableSearchableSelect";

// The reminder that Wrike has time the timesheet doesn't: the tasks, a time and
// category for each, and a button to add them as rows. State and handlers are
// the timesheet's own (LegacyTimesheets.js), passed in.
export default function UnloggedReminderModal({
  activeDay, activeDropdown, handleModalTimeChange, setActiveDropdown, setShowReminderModal,
  unloggedTasks,
}) {
  return (
    <div
      className="fixed inset-0 z-[100001] flex items-center justify-center p-4"
      onClick={() => setShowReminderModal(false)}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-gradient-to-b from-[#1c2333] to-[#141b28] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glossy top edge */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white">
              Anything left to log?
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              These tasks don't have hours yet for{" "}
              <span className="text-slate-200">{activeDay}</span>
            </p>
          </div>
          <button
            onClick={() => setShowReminderModal(false)}
            className="text-slate-500 hover:text-white transition-colors mt-0.5 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Body */}
        {/* flex-1 + min-h-0 so this scrolls inside the max-h-[80vh] column
            rather than growing past it — min-h-0 is what lets a flex child
            shrink below its content. Safe to clip here because
            TableSearchableSelect positions its dropdown `fixed` on open
            precisely so it escapes containers like this one. */}
        <div className="p-4 space-y-2 flex-1 min-h-0 overflow-y-auto">
          {unloggedTasks.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
              <p className="text-white font-semibold text-sm">All good!</p>
              <p className="text-slate-500 text-xs mt-1">
                Nothing missing for {activeDay}
              </p>
            </div>
          ) : (
            unloggedTasks.map((task) => (
              <div
                key={task.id}
                className="bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] rounded-xl p-3.5 flex items-center gap-3 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-semibold text-white truncate"
                    title={task.title}
                  >
                    {task.title}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <span className={getDarkTagStyle(task.wrikeStatus)}>
                      {task.wrikeStatus}
                    </span>
                    <span className="text-slate-500 text-[11px]">
                      {task.wrikeCategory}
                    </span>
                    {task.wrikeLocation !== "⚠️ Unassigned" && (
                      <span className="text-slate-500 text-[11px]">
                        {TERRITORY_FLAGS[task.wrikeLocation]}{" "}
                        {task.wrikeLocation}
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-24 shrink-0">
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
            ))
          )}
        </div>
        {/* Footer */}
        <div className="px-4 pb-4 pt-2 border-t border-white/5">
          <button
            onClick={() => setShowReminderModal(false)}
            className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-300 transition-colors rounded-xl hover:bg-white/5"
          >
            Got it, close
          </button>
        </div>
      </div>
    </div>
  );
}
