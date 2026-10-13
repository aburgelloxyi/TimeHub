import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal } from "lucide-react";
import TableSearchableSelect from "./TableSearchableSelect";
import { HoverLabel } from "../shared/FloatingCard";
import { CATEGORIES } from "../../constants.js";

// The two "how should my pulled rows arrive" preferences, as a popover hanging
// off the table settings in the action bar, next to Lock.
//
// It opens UPWARD because the action bar is at the foot of the table: a
// downward panel would open into the page footer and off the bottom of the
// viewport.
//
// The panel is portalled to <body> and fixed above the button. Inside the
// tongue it could never rise above the table: the tongue is its own stacking
// context at z-10, so the panel's z-index only counted within it, and the
// table's country and category cells drew straight over the panel.
//
// The default category is chosen with the same picker as the table's Category
// column (grouped, with the most-used ones on top), so it is one thing to
// learn. Its list places itself, above the field when there's no room below.
export default function PullDefaultsPopover({
  defaultCategory,
  groupMultiCountry,
  setPrefs,
  onOpenChange,
  pinnedCategories = [],
}) {
  const [open, setOpen] = useState(false);
  // TableSearchableSelect is open when this names it.
  const [activeDropdown, setActiveDropdown] = useState(null);
  // The tongue stays opened out while this panel is up; see LegacyTimesheets.
  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);
  // Where the panel sits: centred on the button, its bottom edge just above it,
  // kept inside the window. Measured, since the panel lives outside the tongue.
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(320, window.innerWidth - 16);
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.left + r.width / 2 - width / 2));
      setPos({ left, width, bottom: window.innerHeight - r.top + 8 });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Close on outside click and on Escape. Both listeners are only attached
  // while open, so a closed popover costs nothing.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setActiveDropdown(null);
  }, [open]);

  // A set default is the thing worth surfacing on the closed button — it
  // silently changes what every future pull produces, so it should not be
  // discoverable only by opening the panel.
  const label = defaultCategory
    ? defaultCategory.replace(" - ", " · ")
    : "Pull defaults";

  return (
    <div className="relative" ref={wrapRef}>
      <HoverLabel label="Default category and market grouping for pulled rows">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors max-w-[220px] ${
            open || defaultCategory || groupMultiCountry
              ? "text-[#12a0e1]"
              : "text-[#768994] hover:text-[#122027]"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      </HoverLabel>

      {open && pos && createPortal(
        // Two elements on purpose. tailwindcss-animate's `enter` keyframe sets
        // `transform: translate3d(var(--tw-enter-translate-x, 0), …)`, and its
        // end state is the element's own computed transform. Put `animate-in`
        // and `-translate-x-1/2` on the SAME element and the animation runs
        // from translateX(0) to translateX(-50%) — the panel starts half its
        // width to the right of centre and slides left into place, which reads
        // as "why is it coming in from the right".
        //
        // So the outer element owns the position and never animates; the inner
        // one owns the animation and has no transform of its own.
        <div
          ref={panelRef}
          className="fixed z-[99999]"
          style={{ left: pos.left, bottom: pos.bottom, width: pos.width }}
        >
          <div className="w-full bg-white border border-[#dce4ec] rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* Merge markets */}
            <div className="p-4 border-b border-[#dce4ec] flex items-center gap-3">
              {/* Label only. What the merge costs you is spelled out in
                Profile → Settings, which is where there is room for it. */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-[#122027]">
                  Merge markets into one entry
                </p>
              </div>
              <button
                onClick={() =>
                  setPrefs({ groupMultiCountry: !groupMultiCountry })
                }
                role="switch"
                aria-checked={groupMultiCountry}
                aria-label="Merge markets into one entry"
                className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${
                  groupMultiCountry ? "bg-[#12a0e1]" : "bg-slate-200"
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    groupMultiCountry ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Default category */}
            <div className="p-4">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <p className="text-xs font-black text-[#122027]">Default category</p>
                {/* Clearing the default is a real choice, not an absence of one:
                    it hands the category back to the PRINT/REVISION keyword
                    guess, so it needs to be as reachable as picking one. */}
                {defaultCategory && (
                  <button
                    onClick={() => setPrefs({ defaultCategory: null })}
                    className="text-[11px] font-bold text-[#768994] hover:text-[#122027] underline underline-offset-2"
                  >
                    No default
                  </button>
                )}
              </div>
              <div className="rounded-xl border border-[#dce4ec] bg-white">
                <TableSearchableSelect
                  options={CATEGORIES}
                  value={defaultCategory || ""}
                  onChange={(picked) => setPrefs({ defaultCategory: picked || null })}
                  placeholder="No default"
                  isGrouped={true}
                  pinnedOptions={pinnedCategories}
                  dropdownId="pull-default-category"
                  activeDropdown={activeDropdown}
                  setActiveDropdown={setActiveDropdown}
                  isCategory={true}
                />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
