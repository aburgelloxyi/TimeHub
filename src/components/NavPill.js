import React, { useState, useEffect, useRef } from "react";
import { TimerIcon, LayoutList, Layout, Server, Database } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

// Profile is excluded from the sliding pill nav — it sits as an avatar button
const navItems = [
  { id: "timesheet", label: "Timesheeter", icon: TimerIcon },
  { id: "todayslist", label: "Motion Board", icon: LayoutList },
  { id: "canvas", label: "Digi Canvas", icon: Layout },
  { id: "legacy", label: "Legacy Sandbox", icon: Database },
  // { id: "wriketest", label: "Wriker", icon: Server }, // dev only — re-enable when needed
];

export default function ApplePillNav({ activePage, setActivePage }) {
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });
  const [initials, setInitials] = useState("");
  const navRef = useRef(null);
  const itemRefs = useRef([]);

  // Load initials from profile
  useEffect(() => {
    const uid = localStorage.getItem("wrike_user_id");
    if (!uid) return;
    supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("wrike_user_id", uid)
      .single()
      .then(({ data }) => {
        if (data) {
          const f = data.first_name?.[0] || "";
          const l = data.last_name?.[0] || "";
          setInitials((f + l).toUpperCase() || "?");
        }
      });
  }, []);

  // Recalculate pill — only for tool nav items, not profile
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
      } else if (activePage === "profile") {
        // Hide the sliding pill when profile is active
        setPillStyle({ left: 0, width: 0 });
      }
    };

    updatePillPosition();
    window.addEventListener("resize", updatePillPosition);
    return () => window.removeEventListener("resize", updatePillPosition);
  }, [activePage]);

  const isProfile = activePage === "profile";

  return (
    <div className="flex justify-center w-full pt-3">
      <div className="flex items-center gap-2">
        {/* Main tool pill nav */}
        <nav
          ref={navRef}
          className="relative inline-flex items-center p-1 bg-white backdrop-blur-md rounded-full border border-black/5 shadow"
        >
          {/* Sliding pill */}
          <div
            className="absolute top-1 bottom-1 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] rounded-full border border-black/5"
            style={{
              left: `${pillStyle.left}px`,
              width: `${pillStyle.width}px`,
              transition: "all 0.4s cubic-bezier(0.25, 1, 0.5, 1)",
            }}
          />

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
                      ? "text-[#122027]"
                      : "text-[#768994] hover:text-[#122027]"
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

        {/* Avatar button — separated from the pill, right side */}
        <button
          onClick={() => setActivePage("profile")}
          title="Your profile"
          className={`relative flex items-center justify-center w-9 h-9 rounded-full font-black text-sm transition-all duration-300 shadow border ${
            isProfile
              ? "bg-gradient-to-br from-[#12a0e1] to-[#1cc1a5] text-white border-transparent scale-110 shadow-[#12a0e1]/30"
              : "bg-white text-[#122027] border-black/5 hover:scale-105 hover:shadow-md"
          }`}
        >
          {initials || "?"}
          {/* Active ring */}
          {isProfile && (
            <span className="absolute inset-0 rounded-full ring-2 ring-[#12a0e1]/40 ring-offset-1" />
          )}
        </button>
      </div>
    </div>
  );
}
