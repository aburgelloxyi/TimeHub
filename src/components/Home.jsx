import React, { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { Clock, LayoutList, Layout, Database, User, ChevronRight, Key } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { supabase } from "../lib/supabaseClient";
import { PAGE_GRADIENTS } from "../lib/pageGradients";
import "@fontsource-variable/bricolage-grotesque";

gsap.registerPlugin(useGSAP);

// Gradients are deliberately one step darker than the app's chip palette so
// white ink stays legible on the hover sweep and full-screen wash (≥3:1 at
// display sizes) in both themes.
const SECTIONS = [
  {
    id: "timesheet",
    label: "Timesheeter",
    desc: "Track today's time",
    icon: Clock,
    // Brand blue→teal at full brightness (owner's call: brand pop over the
    // ~3:1 large-text contrast the darkened variant hit).
    gradient: PAGE_GRADIENTS.timesheet,
  },
  {
    id: "todayslist",
    label: "Motion Board",
    desc: "Team task allocation",
    icon: LayoutList,
    gradient: PAGE_GRADIENTS.todayslist,
  },
  {
    id: "canvas",
    label: "Digi Canvas",
    desc: "MATRIX visualiser",
    icon: Layout,
    gradient: PAGE_GRADIENTS.canvas,
  },
  {
    id: "legacy",
    label: "Legacy",
    desc: "Old timesheet database",
    icon: Database,
    gradient: PAGE_GRADIENTS.legacy,
  },
  {
    id: "profile",
    label: "Profile hub",
    desc: "Your jobs & settings",
    icon: User,
    gradient: PAGE_GRADIENTS.profile,
  },
];

// Play the full entrance ceremony once per app session; returning to the
// menu afterwards gets a shortened rise so daily navigation never drags.
let entrancePlayed = false;

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function useFirstName() {
  const [firstName, setFirstName] = useState("");
  useEffect(() => {
    const uid = localStorage.getItem("wrike_user_id");
    if (!uid) return;
    supabase
      .from("profiles")
      .select("first_name")
      .eq("wrike_user_id", uid)
      .single()
      .then(({ data }) => {
        if (data?.first_name) setFirstName(data.first_name);
      });
  }, []);
  return firstName;
}

export default function Home({ onNavigate, hasToken = true }) {
  const firstName = useFirstName();
  const containerRef = useRef(null);
  const headerRef = useRef(null);
  const rowRefs = useRef([]);
  const fillRefs = useRef([]);
  const contentRefs = useRef([]);
  const metaRefs = useRef([]);
  const addRowRef = useCallback((el) => {
    if (el && !rowRefs.current.includes(el)) rowRefs.current.push(el);
  }, []);
  const addFillRef = useCallback((el) => {
    if (el && !fillRefs.current.includes(el)) fillRefs.current.push(el);
  }, []);
  const addContentRef = useCallback((el) => {
    if (el && !contentRefs.current.includes(el)) contentRefs.current.push(el);
  }, []);
  const addMetaRef = useCallback((el) => {
    if (el && !metaRefs.current.includes(el)) metaRefs.current.push(el);
  }, []);

  const idOrder = useMemo(() => SECTIONS.map((s) => s.id), []);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return; // JSX renders in its final state

      const firstVisit = !entrancePlayed;
      entrancePlayed = true;

      gsap.set(headerRef.current, { opacity: 0, y: -12 });
      // Classic masked reveal: each row's icon+label sits inside an
      // overflow-hidden box (see Row below) and slides up from fully
      // below it — no opacity fade, just a clean wipe into place.
      gsap.set(contentRefs.current, { yPercent: firstVisit ? 110 : 40 });

      gsap
        .timeline()
        .to(headerRef.current, {
          opacity: 1,
          y: 0,
          duration: firstVisit ? 0.5 : 0.25,
          ease: "power3.out",
        })
        .to(
          contentRefs.current,
          {
            yPercent: 0,
            duration: firstVisit ? 0.8 : 0.4,
            ease: "expo.out",
            stagger: firstVisit ? 0.08 : 0.03,
          },
          "-=0.2"
        );
    },
    { scope: containerRef }
  );

  const handleHoverIn = (i) => {
    gsap.to(fillRefs.current[i], { scaleX: 1, duration: 0.4, ease: "power3.out", overwrite: "auto" });
  };

  const handleHoverOut = (i) => {
    gsap.to(fillRefs.current[i], { scaleX: 0, duration: 0.3, ease: "power2.in", overwrite: "auto" });
  };

  const handlePick = (sectionId) => {
    if (prefersReducedMotion()) {
      onNavigate(sectionId);
      return;
    }

    const index = idOrder.indexOf(sectionId);
    const clickedRow = rowRefs.current[index];
    const clickedFill = fillRefs.current[index];
    const clickedContent = contentRefs.current[index];
    const otherContents = contentRefs.current.filter((_, i) => i !== index);

    gsap.killTweensOf([
      ...rowRefs.current,
      ...fillRefs.current,
      ...contentRefs.current,
      ...metaRefs.current,
    ]);

    // Full-screen colour wash: the row's own fill (already a flat, full-width
    // rectangle from the hover sweep) grows to cover the viewport, then we
    // navigate. The clicked row is lifted above its siblings so the wash
    // paints over them (rows no longer clip — see Row), and the container's
    // own overflow-hidden stops the oversized fill spawning scrollbars.
    gsap.set(clickedRow, { zIndex: 60 });
    const rowRect = clickedRow.getBoundingClientRect();

    // Scale from an origin placed proportionally to the space above vs below
    // the row, so the wash's top and bottom edges reach the viewport edges at
    // the same moment. A centre origin only does that for the middle row —
    // edge rows hit their near edge early and visibly kept sweeping alone.
    const gapAbove = Math.max(rowRect.top, 0);
    const gapBelow = Math.max(window.innerHeight - rowRect.bottom, 0);
    const totalGap = gapAbove + gapBelow;
    const originY =
      totalGap > 0 ? (rowRect.height * gapAbove) / totalGap : rowRect.height / 2;
    // Both edges arrive exactly at scale = 1 + totalGap/height; the extra 4%
    // is a safety margin against subpixel rounding leaving hairline gaps.
    const scaleYNeeded = 1 + totalGap / rowRect.height + 0.04;
    gsap.set(clickedFill, { transformOrigin: `left ${originY}px` });

    // Mirrors the entrance mask reveal, run in reverse: other rows' labels
    // slide back down out of their masks, the clicked one slides up and out
    // as the fill washes over it — no opacity fades on the type itself.
    // The gradient is passed along so App can swap in an identical fixed
    // overlay the frame this component unmounts (see wash overlay in App).
    gsap
      .timeline({
        onComplete: () => onNavigate(sectionId, SECTIONS[index].gradient),
      })
      .to(otherContents, { yPercent: 110, duration: 0.2, ease: "power2.in", stagger: 0.018 }, 0)
      .to(headerRef.current, { opacity: 0, duration: 0.16, ease: "power2.inOut" }, 0)
      .to(metaRefs.current, { opacity: 0, duration: 0.1, ease: "power2.out" }, 0)
      .to(clickedFill, { scaleX: 1, scaleY: scaleYNeeded, duration: 0.26, ease: "power2.inOut" }, 0)
      .to(clickedContent, { yPercent: -110, duration: 0.2, ease: "power2.in" }, 0.03);
  };

  return (
    // h-dvh + overflow-hidden: the menu owns exactly one viewport (no phantom
    // scroll) and the exit wash can't spawn scrollbars while it expands.
    <div
      ref={containerRef}
      className="h-dvh min-h-[540px] overflow-hidden bg-slate-100 flex flex-col"
    >
      <div
        ref={headerRef}
        className="px-6 sm:px-16 pt-10 pb-6 flex items-end justify-between gap-4"
      >
        <div>
          <p className="text-sm font-bold text-[#12a0e1] uppercase tracking-widest mb-1">
            {greeting()}{firstName ? `, ${firstName}` : ""}
          </p>
          <h1 className="text-2xl sm:text-3xl font-black text-[#122027] tracking-tight">
            Where to?
          </h1>
        </div>
        {!hasToken && (
          <button
            onClick={() => onNavigate("profile")}
            className="flex items-center gap-2 bg-amber-50 border border-amber-200 hover:border-amber-400 rounded-full px-4 py-2 shrink-0 transition-colors"
          >
            <Key className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="text-xs font-bold text-amber-800 hidden sm:inline">
              Wrike not connected
            </span>
            <span className="text-xs font-black text-amber-600">Connect →</span>
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col">
        {SECTIONS.map((section, i) => (
          <Row
            key={section.id}
            section={section}
            index={i}
            addRowRef={addRowRef}
            addFillRef={addFillRef}
            addContentRef={addContentRef}
            addMetaRef={addMetaRef}
            onClick={() => handlePick(section.id)}
            onHoverIn={() => handleHoverIn(i)}
            onHoverOut={() => handleHoverOut(i)}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  section,
  addRowRef,
  addFillRef,
  addContentRef,
  addMetaRef,
  onClick,
  onHoverIn,
  onHoverOut,
}) {
  const { label, desc, icon: Icon, gradient } = section;

  return (
    // No overflow-hidden here: the fill must escape the row for the exit
    // wash. The label keeps its own mask (inner div below), and keyboard
    // focus drives the same sweep as hover.
    <button
      ref={addRowRef}
      onClick={onClick}
      onMouseEnter={onHoverIn}
      onMouseLeave={onHoverOut}
      onFocus={onHoverIn}
      onBlur={onHoverOut}
      className="group relative flex-1 flex items-center justify-between gap-4 px-6 sm:px-16 border-b border-[#dce4ec] last:border-b-0 text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[#12a0e1]"
    >
      <div
        ref={addFillRef}
        className={`absolute inset-0 bg-gradient-to-r ${gradient}`}
        style={{ transform: "scaleX(0)", transformOrigin: "left center" }}
      />

      <div className="relative z-10 overflow-hidden">
        <div ref={addContentRef} className="flex items-center gap-5 sm:gap-8">
          <Icon
            className="w-8 h-8 sm:w-10 sm:h-10 text-[#122027] group-hover:text-white group-focus:text-white transition-colors duration-300 shrink-0"
            strokeWidth={1.75}
          />
          <p className="font-display text-4xl sm:text-6xl font-bold tracking-tight leading-none text-[#122027] group-hover:text-white group-focus:text-white transition-colors duration-300">
            {label}
          </p>
        </div>
      </div>

      <div ref={addMetaRef} className="relative z-10 flex items-center gap-4 shrink-0">
        <span className="hidden md:block text-sm font-bold text-white opacity-0 translate-x-3 group-hover:opacity-100 group-hover:translate-x-0 group-focus:opacity-100 group-focus:translate-x-0 transition-all duration-300 delay-75 pointer-events-none">
          {desc}
        </span>
        <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-[#768994] group-hover:text-white group-focus:text-white group-hover:translate-x-1 transition-all duration-300" />
      </div>
    </button>
  );
}
