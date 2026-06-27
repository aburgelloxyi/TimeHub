import React, { useState, useEffect, useRef } from "react";
import {
  TimerIcon,
  LayoutList,
  Layout,
  Server,
  Database,
  Briefcase,
  Clock,
  Activity,
  BarChart2,
  CheckCircle,
  Settings,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

// Profile is excluded from the sliding pill nav — it sits as an avatar button
const navItems = [
  { id: "timesheet",  label: "Timesheeter",  icon: TimerIcon },
  { id: "todayslist", label: "Motion Board", icon: LayoutList },
  { id: "canvas",     label: "Digi Canvas",  icon: Layout },
  { id: "legacy",     label: "Legacy",       icon: Database },
  // { id: "wriketest", label: "Wriker", icon: Server }, // dev only — re-enable when needed
];

const hubSections = [
  { id: "jobs",      label: "Active Jobs", icon: Briefcase },
  { id: "history",   label: "History",     icon: Clock },
  { id: "overview",  label: "Overview",    icon: Activity },
  { id: "analytics", label: "Analytics",   icon: BarChart2 },
  { id: "completed", label: "Completed",   icon: CheckCircle },
  { id: "settings",  label: "Settings",    icon: Settings },
];

export default function ApplePillNav({ activePage, setActivePage, hubSection, setHubSection }) {
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });
  const [initials, setInitials] = useState("");
  const [hubMenuOpen, setHubMenuOpen] = useState(false);
  const navRef = useRef(null);
  const itemRefs = useRef([]);
  const hubHoverTimeout = useRef(null);

  const openHubMenu = () => {
    clearTimeout(hubHoverTimeout.current);
    setHubMenuOpen(true);
  };
  const closeHubMenu = () => {
    hubHoverTimeout.current = setTimeout(() => setHubMenuOpen(false), 120);
  };

  // Load initials from profile
  useEffect(() => {
    const uid = localStorage.getItem("wrike_user_id");
    if (!uid) return;
    supabase.from("profiles").select("first_name, last_name").eq("wrike_user_id", uid).single()
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
        setPillStyle({ left: activeRect.left - navRect.left, width: activeRect.width });
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
    <div className="flex flex-col items-center w-full pt-6 gap-2">
      {/* ── Row 1: main nav + My Hub button ── */}
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
                  ${isActive ? "text-[#122027]" : "text-[#768994] hover:text-[#122027]"}
                `}
              >
                <Icon
                  className={`w-4 h-4 transition-transform duration-500 ${isActive ? "scale-100 text-[#12a0e1]" : "scale-90"}`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Profile / Hub button with hover mini-menu */}
        <div
          className="relative"
          onMouseEnter={openHubMenu}
          onMouseLeave={closeHubMenu}
        >
          <button
            onClick={() => { setActivePage("profile"); setHubSection?.(null); }}
            title="Your profile & hub"
            className={`relative flex items-center gap-2 py-1 pl-1 pr-3.5 rounded-full font-bold text-[13px] tracking-tight transition-all duration-300 border ${
              isProfile
                ? "bg-gradient-to-br from-[#12a0e1] to-[#1cc1a5] text-white border-transparent scale-105 shadow-lg shadow-[#12a0e1]/40"
                : "bg-white text-[#122027] border-[#12a0e1]/30 shadow-[0_0_0_3px_rgba(18,160,225,0.12)] hover:scale-105 hover:shadow-[0_0_0_4px_rgba(18,160,225,0.2)] hover:border-[#12a0e1]/50"
            }`}
          >
            <span
              className={`flex items-center justify-center w-7 h-7 rounded-full font-black text-xs shrink-0 ${
                isProfile
                  ? "bg-white/25 text-white"
                  : "bg-gradient-to-br from-[#12a0e1] to-[#1cc1a5] text-white"
              }`}
            >
              {initials || "?"}
            </span>
            My Hub
            {isProfile && (
              <span className="absolute inset-0 rounded-full ring-2 ring-[#12a0e1]/40 ring-offset-1" />
            )}
          </button>

          {/* Hover mini-menu — floats below the button, hidden when already on Hub */}
          {hubMenuOpen && !isProfile && (
            <div
              className="absolute right-0 top-full pt-2.5 z-50"
              onMouseEnter={openHubMenu}
              onMouseLeave={closeHubMenu}
            >
              <div className="bg-white rounded-2xl border border-black/5 shadow-2xl p-2 flex flex-col gap-0.5 min-w-[200px]">
                {hubSections.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => {
                      setActivePage("profile");
                      setHubSection?.(id);
                      setHubMenuOpen(false);
                    }}
                    className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-[13px] font-bold tracking-tight text-left transition-all duration-150 text-[#768994] hover:text-[#122027] hover:bg-slate-50"
                  >
                    <Icon className="w-4 h-4 shrink-0" strokeWidth={2} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: Hub section shortcuts (only when My Hub is active) ── */}
      {isProfile && (
        <div className="flex items-center gap-1.5 p-1 bg-white/70 backdrop-blur-md rounded-full border border-black/5 shadow-sm">
          {hubSections.map(({ id, label, icon: Icon }) => {
            const isActive = hubSection === id;
            return (
              <button
                key={id}
                onClick={() => setHubSection?.(id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold tracking-tight transition-all duration-200 ${
                  isActive
                    ? "bg-gradient-to-br from-[#12a0e1] to-[#1cc1a5] text-white shadow-sm"
                    : "text-[#768994] hover:text-[#122027] hover:bg-white"
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" strokeWidth={isActive ? 2.5 : 2} />
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}