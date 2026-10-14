import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, RotateCcw, SlidersHorizontal } from "lucide-react";
import { SECTIONS, moveSection, toggleSection, defaultLayout } from "../../lib/orderForms/controlLayout";

// The Control Centre's Customise button and its panel: each section shown or
// hidden, and moved up or down. Every change is saved as it is made.

const labelOf = Object.fromEntries(SECTIONS.map((s) => [s.id, s.label]));

export default function CustomiseLayout({ layout, onChange }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const hidden = layout.filter((s) => !s.on).length;
  const arrow = "p-1 rounded-md text-[#768994] hover:text-[#122027] hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors";

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`press group flex items-center gap-2 h-full px-4 py-2.5 rounded-2xl border shadow-sm text-sm font-bold transition-colors ${
          open ? "bg-[#122027] border-[#122027] text-white" : "bg-white border-[#dce4ec] text-[#122027] hover:border-[#12a0e1]"
        }`}
      >
        <SlidersHorizontal className="w-4 h-4 transition-transform duration-300 group-hover:rotate-90" />
        Customise
        {hidden > 0 && <span className={`px-1.5 rounded-md text-[10px] ${open ? "bg-white/15" : "bg-slate-100 text-[#768994]"}`}>{hidden} hidden</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute right-0 top-full mt-2 z-30 w-80 origin-top-right rounded-2xl border border-[#dce4ec] bg-white shadow-2xl overflow-hidden"
          >
            <p className="px-4 pt-3 pb-2 text-[11px] text-[#768994]">
              <span className="block text-[10px] font-black uppercase tracking-widest text-[#122027] mb-0.5">Your Control Centre</span>
              Show the sections you work from, in your order. Only you see this layout.
            </p>
            <motion.ul layout className="px-2 pb-2">
              {layout.map((s, i) => (
                <motion.li
                  layout
                  key={s.id}
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50"
                >
                  <label className="flex-1 min-w-0 flex items-center gap-2.5 cursor-pointer">
                    {/* A switch, so on and off read at a glance. */}
                    <span className={`relative w-8 h-[18px] shrink-0 rounded-full transition-colors ${s.on ? "bg-gradient-to-r from-[#12a0e1] to-[#1cc1a5]" : "bg-slate-200"}`}>
                      <input type="checkbox" checked={s.on} onChange={() => onChange(toggleSection(layout, s.id))} className="sr-only" />
                      <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform duration-200 ${s.on ? "translate-x-3.5" : ""}`} />
                    </span>
                    <span className={`text-sm truncate ${s.on ? "font-bold text-[#122027]" : "text-[#768994]"}`}>{labelOf[s.id]}</span>
                  </label>
                  <button onClick={() => onChange(moveSection(layout, s.id, -1))} disabled={i === 0} aria-label={`Move ${labelOf[s.id]} up`} className={arrow}>
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => onChange(moveSection(layout, s.id, 1))} disabled={i === layout.length - 1} aria-label={`Move ${labelOf[s.id]} down`} className={arrow}>
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </motion.li>
              ))}
            </motion.ul>
            <button
              onClick={() => onChange(defaultLayout())}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-[#dce4ec] text-xs font-bold text-[#768994] hover:text-[#122027] hover:bg-slate-50 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Back to the standard layout
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
