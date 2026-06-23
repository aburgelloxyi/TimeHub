import React, { useState, useEffect, useRef } from "react";
import {
  TimerIcon,
  LayoutList,
  Layout,
  Server,
  Database,
} from "lucide-react";

// 1. THIS MUST LIVE OUTSIDE THE COMPONENT to prevent infinite loops!
const navItems = [
  { id: "timesheet", label: "Timesheeter", icon: TimerIcon },
  { id: "todayslist", label: "Motion Board", icon: LayoutList },
  { id: "canvas", label: "Digi Canvas", icon: Layout },
  { id: "wriketest", label: "Wriker", icon: Server },
  { id: "legacy", label: "Legacy Sandbox", icon: Database }, // <-- Added new route
];

export default function ApplePillNav({ activePage, setActivePage }) {
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });
  const navRef = useRef(null);
  const itemRefs = useRef([]);

  // Recalculate the pill position whenever the active page or window size changes
  useEffect(() => {
    const updatePillPosition = () => {
      const activeIndex = navItems.findIndex((item) => item.id === activePage);
      const activeElement = itemRefs.current[activeIndex];
      const navElement = navRef.current;

      if (activeElement && navElement) {
        const navRect = navElement.getBoundingClientRect();
        const activeRect = activeElement.getBoundingClientRect();

        setPillStyle({
          left: activeRect.left - navRect.left,
          width: activeRect.width,
        });
      }
    };

    updatePillPosition();
    window.addEventListener("resize", updatePillPosition);
    return () => window.removeEventListener("resize", updatePillPosition);

    // 2. ONLY activePage goes here, not navItems!
  }, [activePage]);

  return (
    <div className="flex justify-center w-full pt-8">
      {/* THE CONTAINER: Fully rounded, subtle border, tight padding */}
      <nav
        ref={navRef}
        className="relative inline-flex items-center p-1 bg-white backdrop-blur-md rounded-full border border-black/5 shadow"
      >
        {/* THE SLIDING PILL: Animates behind the text. Using bg-[#ffffff] to bypass Sledgehammer CSS */}
        <div
          className="absolute top-1 bottom-1 bg-white dark:bg-[#ffffff] shadow-[0_4px_12px_rgba(0,0,0,0.08)] rounded-full border border-black/5 dark:border-black/5"
          style={{
            left: `${pillStyle.left}px`,
            width: `${pillStyle.width}px`,
            transition: "all 0.4s cubic-bezier(0.25, 1, 0.5, 1)",
          }}
        />

        {/* THE BUTTONS: Transparent backgrounds, z-index above the pill */}
        {navItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;

          return (
            <button
              key={item.id}
              ref={(el) => (itemRefs.current[index] = el)}
              onClick={() => setActivePage(item.id)}
              className={`
                relative z-10 flex items-center gap-2 px-5 py-2 text-[13px] font-bold rounded-full tracking-tight transition-colors duration-300
                ${
                  isActive
                    ? "text-[#122027] dark:text-[#122027]"
                    : "text-[#768994] hover:text-[#122027] dark:text-[#768994] dark:hover:text-[#122027]"
                }
              `}
            >
              <Icon
                className={`w-4 h-4 transition-transform duration-500 ${
                  isActive ? "scale-100 text-[#12a0e1]" : "scale-90"
                }`}
                strokeWidth={isActive ? 2.5 : 2}
              />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
