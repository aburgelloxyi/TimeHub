import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

// A quiet, self-contained date picker to replace the browser's native
// <input type="date"> (which renders differently per-OS and can't be themed).
// Value in/out is an ISO "YYYY-MM-DD" string (what the DB stores); the field
// displays en-GB DD/MM/YYYY to match the rest of the app.
//
// The popover is positioned in normal flow (absolute inside a relative wrapper),
// NOT portaled+fixed. That started as a fix for the app-wide html { zoom: 1.1 },
// where fixed positioning from getBoundingClientRect double-applied the zoom and
// the panel drifted further from its field the more the page was scrolled. The
// zoom is gone, but in-flow absolute is kept: it needs no coordinate math at all,
// so there is nothing to drift. It flips above the field when the
// trigger sits low in the viewport so the calendar never opens off-screen.
//
// `floating` is for a field inside something that clips or scrolls, such as a
// table cell: there the panel is drawn on <body> and placed from the field's
// position when it opens, and closes if the page scrolls under it. `compact`
// sizes the field for a cell, `changed` outlines it, and `onOpen` is told when
// the calendar opens.
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const toDMY = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
};
const isoOf = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export default function DateField({
  value, onChange, placeholder = "Select date…", allowClear = true, className = "",
  floating = false, compact = false, changed = false, ariaLabel, onOpen,
}) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [place, setPlace] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  const now = new Date();
  const [viewY, setViewY] = useState(value ? Number(value.slice(0, 4)) : now.getFullYear());
  const [viewM, setViewM] = useState(value ? Number(value.slice(5, 7)) - 1 : now.getMonth());

  // Jump the visible month to the selected date whenever the picker opens.
  const openPicker = () => {
    if (value) {
      setViewY(Number(value.slice(0, 4)));
      setViewM(Number(value.slice(5, 7)) - 1);
    }
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const up = r.bottom > window.innerHeight * 0.6;
      setDropUp(up);
      const left = Math.max(8, Math.min(window.innerWidth - 264 - 8, r.left));
      setPlace(up ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 });
    }
    onOpen?.();
    setOpen(true);
  };

  // Close on any click outside the field + popover.
  useEffect(() => {
    if (!open) return;
    const inside = (target) => wrapRef.current?.contains(target) || panelRef.current?.contains(target);
    const onDown = (e) => { if (!inside(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    // A floating panel is placed once; if the page moves under it, it closes.
    const onScroll = (e) => { if (floating && !panelRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, floating]);

  const cells = useMemo(() => {
    const startDow = (new Date(viewY, viewM, 1).getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
    const out = Array(startDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    return out;
  }, [viewY, viewM]);

  const todayIso = isoOf(now.getFullYear(), now.getMonth(), now.getDate());
  const stepMonth = (delta) => {
    let m = viewM + delta, y = viewY;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewM(m); setViewY(y);
  };
  const commit = (iso) => { onChange(iso); setOpen(false); };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button ref={btnRef} type="button" aria-label={ariaLabel} onClick={() => (open ? setOpen(false) : openPicker())}
        className={`w-full flex items-center justify-between gap-2 border text-sm text-[#122027] bg-white outline-none transition-colors ${
          compact ? "rounded-md px-2 py-1" : "rounded-2xl px-4 py-2.5 focus:ring-2 focus:ring-[#10b981]/15"
        } ${changed ? "border-indigo-500 ring-2 ring-indigo-500/15" : `border-[#dce4ec] ${compact ? "focus:border-[#12a0e1] hover:border-[#12a0e1]" : "focus:border-[#10b981] hover:border-slate-300"}`}`}>
        <span className={`truncate tabular-nums ${value ? "" : "text-[#b0bec5]"}`}>{value ? toDMY(value) : placeholder}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {value && allowClear && (
            <span role="button" tabIndex={-1} aria-label="Clear date"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="text-slate-300 hover:text-rose-500 transition-colors">
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <Calendar className={`${compact ? "w-3.5 h-3.5" : "w-4 h-4"} text-[#768994]`} />
        </span>
      </button>

      {open && (() => {
        const panel = (
        <div
          ref={panelRef}
          style={floating ? place : undefined}
          className={`w-[264px] bg-white border border-[#dce4ec] rounded-2xl shadow-2xl p-3 ${
            floating ? "fixed z-[99999]" : `absolute z-[200] left-0 ${dropUp ? "bottom-full mb-1.5" : "top-full mt-1.5"}`
          }`}
        >
          <div className="flex items-center justify-between mb-2 px-1">
            <button type="button" onClick={() => stepMonth(-1)} aria-label="Previous month"
              className="p-1 rounded-lg hover:bg-slate-100 text-[#768994]"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-bold text-[#122027]">{MONTHS[viewM]} {viewY}</span>
            <button type="button" onClick={() => stepMonth(1)} aria-label="Next month"
              className="p-1 rounded-lg hover:bg-slate-100 text-[#768994]"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map(w => <div key={w} className="text-[10px] font-black text-[#768994] text-center py-1">{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const iso = isoOf(viewY, viewM, d);
              const selected = iso === value;
              const today = iso === todayIso;
              return (
                <button key={i} type="button" onClick={() => commit(iso)}
                  className={`h-8 rounded-lg text-xs font-bold transition-colors ${
                    selected ? "bg-[#10b981] text-white"
                      : today ? "text-[#0d9488] bg-[#10b981]/10"
                        : "text-[#33454f] hover:bg-slate-100"
                  }`}>
                  {d}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#f0f4f8]">
            <button type="button" onClick={() => commit(todayIso)}
              className="text-[11px] font-bold text-[#0d9488] hover:underline px-1">Today</button>
            {allowClear && value && (
              <button type="button" onClick={() => commit("")}
                className="text-[11px] font-bold text-[#768994] hover:text-rose-500 px-1">Clear</button>
            )}
          </div>
        </div>
        );
        return floating ? createPortal(panel, document.body) : panel;
      })()}
    </div>
  );
}
