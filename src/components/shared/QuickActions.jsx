import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, StickyNote, Activity, Briefcase, Settings } from "lucide-react";
import { PAGE_GRADIENTS } from "../../lib/pageGradients";
import { pageIdsFor } from "../../lib/departments";

// ── Quick actions bubble ─────────────────────────────────────────────────────
// A floating hover-to-open shortcut stack, bottom-right. The Rail already
// covers top-level pages in one click; what it can't do is land you *inside*
// one — Active Jobs and Settings are sections of the Profile hub, so reaching
// them otherwise costs a trip through the hub screen first. These entries
// carry a `section`, which App hands to Profile as `activeSection`, so the
// hub is skipped entirely.
//
// Hidden on Home for the same reason the Rail is: Home is its own full-screen
// menu, and a shortcut bubble floating over it would just be a second, worse
// copy of the thing already filling the viewport.

const ACTIONS = [
  {
    id: "notes",
    label: "Notes",
    icon: StickyNote,
    page: "canvas",
    gradient: PAGE_GRADIENTS.canvas,
    // Notes Canvas leads the Canvas page and is open by default, so the
    // page route alone lands on it — no section deep-link needed.
    requires: "canvas",
  },
  {
    id: "tracker",
    label: "Tracker",
    icon: Activity,
    page: "timesheet",
    gradient: PAGE_GRADIENTS.timesheet,
    requires: "timesheet",
  },
  {
    id: "jobs",
    label: "Active Jobs",
    icon: Briefcase,
    page: "profile",
    section: "jobs",
    // Matches the Active Jobs hub row's own identity gradient in Profile.
    gradient: "from-[#12a0e1] to-[#1cc1a5]",
    requires: "profile",
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    page: "profile",
    section: "settings",
    gradient: "from-slate-500 to-slate-700",
    requires: "profile",
  },
];

export default function QuickActions({ activePage, department, onNavigate }) {
  const [open, setOpen] = useState(false);

  if (activePage === "home") return null;

  // Same department registry the Rail and command palette read, so the bubble
  // can never offer a page this member has no access to.
  const allowed = pageIdsFor(department);
  const actions = ACTIONS.filter((a) => allowed.includes(a.requires));
  if (!actions.length) return null;

  const go = (action) => {
    setOpen(false);
    onNavigate(action.page, action.section);
  };

  return (
    // Hover opens, but focus-within does too and the bubble itself is a real
    // button — hover alone would strand keyboard and touch users, who get no
    // hover event at all.
    <div
      className="fixed bottom-6 right-6 z-[100] flex flex-col items-end"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            className="flex flex-col items-end gap-2 mb-3"
            initial="closed"
            animate="opened"
            exit="closed"
            variants={{
              opened: { transition: { staggerChildren: 0.04, staggerDirection: -1 } },
              closed: { transition: { staggerChildren: 0.03 } },
            }}
          >
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <motion.button
                  key={action.id}
                  onClick={() => go(action)}
                  title={action.label}
                  variants={{
                    opened: { opacity: 1, y: 0, scale: 1 },
                    closed: { opacity: 0, y: 8, scale: 0.9 },
                  }}
                  transition={{ duration: 0.16, ease: [0.25, 0.1, 0.25, 1] }}
                  className="group flex items-center gap-2.5"
                >
                  <span className="text-[11px] font-black uppercase tracking-widest text-[#122027] bg-white border border-[#dce4ec] rounded-xl px-2.5 py-1.5 shadow-md whitespace-nowrap">
                    {action.label}
                  </span>
                  <span
                    className={`w-11 h-11 rounded-full bg-gradient-to-br ${action.gradient} text-white flex items-center justify-center shadow-lg transition-transform group-hover:scale-110`}
                  >
                    <Icon className="w-4 h-4" strokeWidth={2.25} />
                  </span>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Quick actions"
        title="Quick actions"
        className="w-14 h-14 rounded-full bg-gradient-to-br from-[#12a0e1] to-[#1cc1a5] text-white flex items-center justify-center shadow-2xl border border-white/20 hover:scale-105 transition-transform"
      >
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex"
        >
          <Zap className="w-6 h-6" strokeWidth={2.25} />
        </motion.span>
      </button>
    </div>
  );
}
