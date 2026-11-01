import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Home } from "lucide-react";
import XYILogo from "./XYILogo";
import { supabase } from "../../lib/supabaseClient";
import { PAGE_GRADIENTS } from "../../lib/pageGradients";
import { PAGES, pageIdsFor, pageFor } from "../../lib/departments";
import { useDepartment } from "../../hooks/useDepartment";

// Replaces the old pill navbar (NavPill.js) — a slim, always-present rail
// instead of a floating top bar, so each page's own header (PageHeader) can
// carry the full-bleed gradient treatment without competing with a nav bar
// for the top of the screen. Hidden entirely on Home, same as the old nav.
// Section icons come from the pages registry filtered by department (see
// src/lib/departments.js), including Administration for the managers who have
// it; only Profile gets its own dedicated avatar slot at the foot of the rail.
//
// Below md the rail is a bottom bar instead: a fixed 80px-wide strip down the
// side costs a phone a fifth of its width, and the hover flyout doesn't work
// on a touch screen anyway (a tap leaves :hover stuck, so the expanded rail
// sat over the page until you tapped elsewhere). Same pages, same gradients,
// along the bottom where a thumb reaches.
export default function Rail({ activePage, setActivePage }) {
  const [initials, setInitials] = useState("");
  const wrikeUserId = localStorage.getItem("wrike_user_id");
  const department = useDepartment();
  const railIds = pageIdsFor(department, wrikeUserId).filter((id) => id !== "profile");
  const sections = railIds.map((id) => pageFor(id, department));

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

  // A row inside the rail: fixed 56px icon slot on the left (so icons never
  // shift between collapsed/expanded), with a label that fades in only once
  // the rail expands on hover. overflow-hidden clips the label while collapsed.
  const railRowClass = (active) =>
    `group/row relative z-10 flex items-center h-14 rounded-2xl overflow-hidden shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12a0e1]/40 ${
      active ? "text-[color:var(--rail-fg-strong)]"
             : "text-[color:var(--rail-fg)] hover:text-[color:var(--rail-fg-strong)] hover:bg-[var(--rail-hover)]"
    }`;
  // The label rides the rail's hover expansion, so it's gated behind the same
  // (hover: hover) query the width is — on a touch screen the rail never
  // expands, and a label fading in over a 56px slot would just overflow it.
  // The label leaves the rail rather than widening it: a chip just outside the strip, its letters arriving
  // one after another from the left.
  // The label stays inside the rail, at its right, and the rail still opens on hover. Only the letters move:
  // they arrive in sequence from the left.
  const railLabelClass = "relative z-10 text-sm font-bold whitespace-nowrap pl-3 pr-4";

  // One square in the bottom bar. Icon only — at eight pages across a 390px
  // screen there's no room for a legible label, so the active page's gradient
  // (the same one its header wears) is what says where you are.
  const barItemClass = (active, activeGrad) =>
    `flex-1 basis-0 min-w-[2.75rem] h-12 flex items-center justify-center rounded-2xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12a0e1]/40 ${
      active
        ? `bg-gradient-to-br ${activeGrad} text-white shadow-md`
        : "text-[#768994]"
    }`;

  return (
    <>
      {/* ── Phone: bottom bar ────────────────────────────────────────────── */}
      <nav data-rail className="md:hidden fixed inset-x-0 bottom-0 z-40 flex items-center gap-1 px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] bg-white/95 backdrop-blur-md border-t border-black/5">
        <button
          onClick={() => setActivePage("home")}
          aria-label="Home"
          className={`${barItemClass(false)} border border-dashed border-[#dce4ec]`}
        >
          <Home className="w-5 h-5" strokeWidth={2.25} />
        </button>

        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActivePage(id)}
            aria-label={label}
            aria-current={activePage === id ? "page" : undefined}
            className={barItemClass(activePage === id, PAGE_GRADIENTS[id])}
          >
            <Icon className="w-5 h-5" strokeWidth={activePage === id ? 2.5 : 2} />
          </button>
        ))}

        <button
          onClick={() => setActivePage("profile")}
          aria-label={PAGES.profile.label}
          aria-current={activePage === "profile" ? "page" : undefined}
          className={barItemClass(activePage === "profile", PAGE_GRADIENTS.profile)}
        >
          <span
            className={`w-8 h-8 flex items-center justify-center text-xs font-black rounded-xl ${
              activePage === "profile" ? "" : "bg-slate-100"
            }`}
          >
            {initials || "?"}
          </span>
        </button>
      </nav>

      {/* ── Tablet and up: the side rail ─────────────────────────────────── */}
      {/* group/rail + hover:w-64 turns the slim icon rail into a labelled flyout
          on hover (overlays content, doesn't push it — it's fixed). overflow-hidden
          clips the labels flush to the animating width. The expansion is behind
          (hover: hover) so a touch device — where :hover sticks after a tap —
          never gets stranded with the rail open across the page. */}
      <nav data-rail className="group/rail hidden md:flex fixed left-0 top-0 bottom-0 z-40 w-20 [@media(hover:hover)]:hover:w-64 overflow-hidden flex-col gap-1.5 px-3 py-5 bg-[var(--rail-bg)] border-r border-black/5 dark:border-white/5 transition-[width,background-color] duration-300 ease-out">
        {/* Colour wash at the rail's top — the active page's gradient, faded
            out downward, so the rail head picks up the header's colour instead
            of reading as a detached white strip. Sits over the nav's white bg
            but under the buttons. */}
        <div
          aria-hidden
          className={`rail-wash pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-br ${
            PAGE_GRADIENTS[activePage] || PAGE_GRADIENTS.management
          } [mask-image:linear-gradient(to_bottom,black,transparent)]`}
        />

        <button
          onClick={() => setActivePage("home")}
          className="group/row relative z-10 flex items-center h-14 rounded-2xl overflow-hidden text-[color:var(--rail-fg)] hover:text-[color:var(--rail-fg-strong)] hover:bg-[var(--rail-hover)] transition-colors duration-150 shrink-0 mt-2 focus-visible:ring-2 focus-visible:ring-[#12a0e1]/40 focus-visible:outline-none"
        >
          {/* The mark sits in the same kind of tile as the active icons, with the page's own colour behind it,
              so it belongs to the strip instead of floating above it. */}
          <span className="relative w-14 h-14 shrink-0 flex items-center justify-center">
            <span className="relative w-10 h-10 rounded-xl bg-[var(--rail-tile-bg)] ring-1 ring-[color:var(--rail-ring)] flex items-center justify-center">
              <span className="rail-logo w-7 block opacity-95">
                {/* Letters only: at 40 points the "design" line is a smudge. */}
                <XYILogo viewBox="0 0 216.5269 84" />
              </span>
            </span>
          </span>
          <span className={railLabelClass}>Home</span>
        </button>

        {/* Vertical space sets the Home button apart from the section
            switchers — no visible rule (kept transparent). */}
        <div className="mt-6 mb-4 shrink-0" />

        <div className="relative z-10 flex flex-col gap-1.5 flex-1 pt-2">
          {sections.map(({ id, label, icon: Icon, wip }, i) => {
            const isActive = activePage === id;
            return (
              <React.Fragment key={id}>
                {/* A rule sets the work-in-progress pages apart from the rest. */}
                {wip && !sections[i - 1]?.wip && (
                  <div aria-hidden className="mx-2 my-1.5 border-t border-[#dce4ec] shrink-0" />
                )}
                <button
                  onClick={() => setActivePage(id)}
                  className={railRowClass(isActive)}
                >
                  {isActive && (
                    <motion.span
                      layoutId="rail-active"
                      aria-hidden
                      className="absolute inset-0 rounded-2xl bg-[var(--rail-pill)] shadow-sm ring-1 ring-black/5"
                      transition={{ type: "spring", stiffness: 520, damping: 42 }}
                    />
                  )}
                  <span className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                    <span
                      className={`w-9 h-9 flex items-center justify-center rounded-xl ${
                        isActive ? `bg-gradient-to-br ${PAGE_GRADIENTS[id]} text-white shadow-sm` : ""
                      }`}
                    >
                      <Icon className={`w-5 h-5 transition-transform duration-150 ${isActive ? "" : "group-hover/row:translate-x-0.5"}`} strokeWidth={isActive ? 2.25 : 2} />
                    </span>
                  </span>
                  <span className={railLabelClass}>{label}</span>
                  {wip && <span className="sr-only">work in progress</span>}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <button
          onClick={() => setActivePage("profile")}
          className={`group/row relative z-10 flex items-center h-14 rounded-2xl transition-colors duration-150 shrink-0 mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12a0e1]/40 ${
            activePage === "profile" ? "text-[color:var(--rail-fg-strong)]"
              : "text-[color:var(--rail-fg)] hover:text-[color:var(--rail-fg-strong)] hover:bg-[var(--rail-hover)]"
          }`}
        >
          {/* The initials tile is inset in its slot, like the icons above it are
              in theirs. Filling the slot put the tile's edge against the label
              with nothing between them. */}
          {activePage === "profile" && (
            <motion.span
              layoutId="rail-active"
              aria-hidden
              className="absolute inset-0 rounded-2xl bg-[var(--rail-pill)] shadow-sm ring-1 ring-black/5"
              transition={{ type: "spring", stiffness: 520, damping: 42 }}
            />
          )}
          <span className="relative w-14 h-14 shrink-0 flex items-center justify-center">
            <span
              className={`w-9 h-9 flex items-center justify-center text-xs font-bold rounded-xl ${
                activePage === "profile" ? `bg-gradient-to-br ${PAGE_GRADIENTS.profile} text-white shadow-sm` : "bg-[var(--rail-tile)] text-[color:var(--rail-fg)]"
              }`}
            >
              {initials || "?"}
            </span>
          </span>
          <span className={railLabelClass}>{PAGES.profile.label}</span>
        </button>
      </nav>
    </>
  );
}
