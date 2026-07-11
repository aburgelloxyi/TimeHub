import React from "react";
import { ChevronRight } from "lucide-react";

// The app's one drill-down navigation idiom — a full-width, large-target row
// with a gradient sweep on hover/focus. First used on Profile Hub, reused
// wherever a page needs "pick one of a few things" navigation (Administration)
// instead of a tab bar or a card grid — same shape everywhere a manager might
// need to navigate, regardless of how comfortable they are with software.
export default function HubRow({ section, onClick, badge, first }) {
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
