import { Lock } from "lucide-react";
import { DAYS } from "./legacyConstants";
import { Rolling } from "../shared/motion";

// The timesheet's day tabs: each day with its total, a lock when frozen.
// State is the timesheet's own (LegacyTimesheets.js), passed in.
export default function DayTabs({
  activeDay, formatDayTotal, frozenDays, getDayTotal, rows, setActiveDay,
}) {
  return (
    <div className="flex px-2 sm:px-4 pt-4 bg-slate-50 gap-1 sm:gap-2 rounded-t-2xl">
      {DAYS.map((day) => {
        const isWeekend = day === "Saturday" || day === "Sunday";
        const isActive = activeDay === day;

        // Original light folder tabs; the strip's border-b is the thin
        // line the light bleeds into, sitting just above the dark table
        // header.
        let tabColors = "";
        if (isActive) {
          tabColors = isWeekend
            ? "bg-white text-rose-500 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] border-t border-x border-[#dce4ec]"
            : "bg-white text-[#12a0e1] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] border-t border-x border-[#dce4ec]";
        } else {
          tabColors = isWeekend
            ? "bg-rose-50 text-rose-400 hover:bg-rose-100 hover:text-rose-600 border-t border-x border-transparent"
            : "bg-slate-100 text-[#768994] hover:bg-slate-200 hover:text-[#122027] border-t border-x border-transparent";
          // On the dark themes the idle fills come out as six dark boxes
          // that outweigh the selected tab. See .day-tab-idle.
          tabColors += " day-tab-idle";
        }

        return (
          <button
            key={day}
            onClick={() => setActiveDay(day)}
            className={`flex-1 min-w-0 py-3 text-[11px] sm:text-[13px] font-bold text-center rounded-t-xl transition-[background-color,color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12a0e1]/40 ${tabColors} ${
              isActive ? "relative z-10 top-[1px]" : ""
            }`}
          >
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center justify-center gap-1.5">
                {frozenDays[day] && <Lock className="w-3 h-3 opacity-60 shrink-0" />}
                {/* Seven full day names can't fit a phone's width, and a
                    flex row that can't shrink pushed the whole document
                    wider than the screen — hence the three-letter form. */}
                <span className="sm:hidden">{day.slice(0, 3)}</span>
                <span className="hidden sm:inline">{day}</span>
                {rows.filter((r) => r.dayOfWeek === day).length > 0 && (
                  <span
                    className={`hidden sm:inline-block ml-1.5 text-[10px] px-2 py-0.5 rounded-full ${
                      isActive
                        ? isWeekend
                          ? "bg-rose-100 text-rose-600"
                          : "bg-[#12a0e1]/10 text-[#12a0e1]"
                        : isWeekend
                        ? "bg-rose-200/50 text-rose-500"
                        : "bg-slate-200 text-[#768994]"
                    }`}
                  >
                    {rows.filter((r) => r.dayOfWeek === day).length}
                  </span>
                )}
              </div>
              {getDayTotal(day) > 0 && (
                <span
                  className={`text-[10px] font-mono font-bold ${
                    isActive
                      ? isWeekend
                        ? "text-rose-500"
                        : "text-[#12a0e1]"
                      : "text-[#768994]"
                  }`}
                >
                  <Rolling amount={getDayTotal(day)}>{formatDayTotal(getDayTotal(day))}h</Rolling>
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
