import React, { useState, useEffect } from "react";
import {
  Home,
  TimerIcon,
  LayoutList,
  Layout,
  Database,
  Shield,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { MANAGEMENT_IDS } from "../Management";
import { PAGE_GRADIENTS } from "../../lib/pageGradients";

const SECTIONS = [
  { id: "timesheet",  label: "Timesheeter",  icon: TimerIcon },
  { id: "todayslist", label: "Motion Board", icon: LayoutList },
  { id: "canvas",     label: "Digi Canvas",  icon: Layout },
  { id: "legacy",     label: "Legacy",       icon: Database },
];

const MANAGEMENT_GRADIENT = "from-[#122027] to-[#12a0e1]";

// Replaces the old pill navbar (NavPill.js) — a slim, always-present rail
// instead of a floating top bar, so each page's own header (PageHeader) can
// carry the full-bleed gradient treatment without competing with a nav bar
// for the top of the screen. Hidden entirely on Home, same as the old nav.
export default function Rail({ activePage, setActivePage }) {
  const [initials, setInitials] = useState("");
  const wrikeUserId = localStorage.getItem("wrike_user_id");
  const showManagement = MANAGEMENT_IDS.length === 0 || MANAGEMENT_IDS.includes(wrikeUserId);

  useEffect(() => {
    if (!wrikeUserId) return;
    supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("wrike_user_id", wrikeUserId)
      .single()
      .then(({ data }) => {
        if (data) {
          const f = data.first_name?.[0] || "";
          const l = data.last_name?.[0] || "";
          setInitials((f + l).toUpperCase() || "?");
        }
      });
  }, [wrikeUserId]);

  if (activePage === "home") return null;

  return (
    <nav className="fixed left-0 top-0 bottom-0 z-40 w-16 flex flex-col items-center gap-2 py-5 bg-white/80 backdrop-blur-md border-r border-black/5">
      <button
        onClick={() => setActivePage("home")}
        title="Home"
        className="w-11 h-11 rounded-2xl border border-dashed border-[#dce4ec] text-[#768994] hover:border-[#12a0e1] hover:text-[#12a0e1] flex items-center justify-center transition-all mb-2 shrink-0"
      >
        <Home className="w-4.5 h-4.5" strokeWidth={2.25} />
      </button>

      <div className="flex flex-col gap-1.5 flex-1">
        {SECTIONS.map(({ id, label, icon: Icon }) => {
          const isActive = activePage === id;
          return (
            <button
              key={id}
              onClick={() => setActivePage(id)}
              title={label}
              className={`relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all shrink-0 ${
                isActive
                  ? `bg-gradient-to-br ${PAGE_GRADIENTS[id]} text-white shadow-lg`
                  : "text-[#768994] hover:text-[#122027] hover:bg-slate-100"
              }`}
            >
              <Icon className="w-[18px] h-[18px]" strokeWidth={isActive ? 2.5 : 2} />
            </button>
          );
        })}
      </div>

      {showManagement && (
        <button
          onClick={() => setActivePage("management")}
          title="Management"
          className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all shrink-0 ${
            activePage === "management"
              ? `bg-gradient-to-br ${MANAGEMENT_GRADIENT} text-white shadow-lg`
              : "text-[#768994] hover:text-[#122027] hover:bg-slate-100"
          }`}
        >
          <Shield className="w-[18px] h-[18px]" strokeWidth={activePage === "management" ? 2.5 : 2} />
        </button>
      )}

      <button
        onClick={() => setActivePage("profile")}
        title="Your profile & hub"
        className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xs font-black transition-all shrink-0 mt-1 ${
          activePage === "profile"
            ? `bg-gradient-to-br ${PAGE_GRADIENTS.profile} text-white shadow-lg`
            : "bg-slate-100 text-[#768994] hover:text-[#122027]"
        }`}
      >
        {initials || "?"}
      </button>
    </nav>
  );
}
