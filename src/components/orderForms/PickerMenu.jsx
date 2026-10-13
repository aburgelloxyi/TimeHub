import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, Trash2 } from "lucide-react";
import { HoverLabel } from "../shared/FloatingCard";

// Client Orders' dropdown: a button that opens a list of rows, each a name
// with an optional tag (Motion, Print) and a note at the right, under optional
// group headings. Used for picking a film to load and for switching between
// the films loaded, and for the dropdowns in a market's table.
//
// `items` are { id, label, tag, tagClass, note, alert, group }; `alert` is a
// note that needs noticing, shown in place of `note`. `trigger` replaces the
// default button with the caller's own, given ({ open, toggle }). `onRemove`
// adds a remove button to each row. `compact` is the default button sized for
// a table cell, and `changed` outlines it. `onOpen` is told when it opens.
// `autoOpen` opens it by itself once it has something to offer, for a step the
// page has just led someone to. `sideBySide` sets the groups next to each
// other as columns, so a long first group doesn't push the second off the
// bottom of the list.
//
// The list is drawn on <body> and placed by measurement, above the button when
// there is no room below. Inside the table it would be cut off by the table's
// own scrolling.

const TAG = "px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider shrink-0";
// A name long enough to be cut off in its row gets the app's hover card with
// the whole of it. Shorter ones are left alone: a card on every row is noise.
const LONG = 34;
function FullName({ text, children }) {
  if (String(text).length <= LONG) return children;
  return <HoverLabel label={<span className="break-all">{text}</span>} delay={250}>{children}</HoverLabel>;
}

const tagClass = (item) => `${TAG} ${item.tagClass || "bg-slate-100 text-slate-600"}`;

export default function PickerMenu({
  items, value, onChange, placeholder = "Pick one", icon: Icon, disabled = false,
  searchable = false, onRemove, trigger, compact = false, changed = false, onOpen, ariaLabel, autoOpen = false, sideBySide = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState(null);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) {
      setPlace(null);
      return;
    }
    const r = wrapRef.current.getBoundingClientRect();
    const across = sideBySide ? Math.max(1, new Set(items.map((item) => item.group || "")).size) : 1;
    const width = Math.min(Math.max(r.width, (compact ? 220 : 320) * across), window.innerWidth - 16);
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.left));
    const below = window.innerHeight - r.bottom;
    setPlace(below < 280 && r.top > below
      ? { left, width, bottom: window.innerHeight - r.top + 6, maxHeight: Math.min(384, r.top - 16) }
      : { left, width, top: r.bottom + 6, maxHeight: Math.min(384, below - 16) });
    // Measured when it opens; the items don't change while it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, compact, sideBySide]);
  const current = items.find((item) => item.id === value) || null;

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const inside = (target) => wrapRef.current?.contains(target) || menuRef.current?.contains(target);
    const onDown = (e) => { if (!inside(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    // The list is placed once; if the page moves under it, it closes.
    const onScroll = (e) => { if (!menuRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const ready = autoOpen && !disabled && items.length > 0;
  useEffect(() => {
    if (ready) setOpen(true);
  }, [ready]);

  const toggle = () => {
    if (disabled) return;
    if (!open) onOpen?.();
    setOpen((v) => !v);
  };
  const wanted = query.trim().toLowerCase();
  const shown = wanted ? items.filter((item) => `${item.label} ${item.tag || ""}`.toLowerCase().includes(wanted)) : items;
  const groups = new Map();
  for (const item of shown) {
    const group = item.group || "";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }

  return (
    <div ref={wrapRef} className="relative min-w-0">
      {trigger ? trigger({ open, toggle }) : (
        <button
          onClick={toggle}
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          className={`w-full flex items-center gap-2 bg-white border text-left transition-colors disabled:opacity-60 min-w-0 ${
            compact ? "pl-2 pr-1.5 py-1 rounded-md" : "pl-3 pr-2.5 py-2.5 rounded-xl shadow-sm"
          } ${changed ? "border-indigo-500 ring-2 ring-indigo-500/15" : "border-[#dce4ec] hover:border-[#12a0e1] disabled:hover:border-[#dce4ec]"}`}
        >
          {Icon && <Icon className="w-4 h-4 text-[#768994] shrink-0" />}
          <FullName text={current?.label || ""}>
            <span className={`flex-1 min-w-0 truncate text-sm ${!current ? "text-[#768994]" : compact ? "text-[#122027]" : "font-bold text-[#122027]"}`}>{current ? current.label : placeholder}</span>
          </FullName>
          {current?.tag && <span className={tagClass(current)}>{current.tag}</span>}
          <ChevronDown className={`${compact ? "w-3.5 h-3.5" : "w-4 h-4"} text-[#768994] shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      )}

      {open && place && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[99999] flex flex-col bg-white border border-[#dce4ec] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in duration-150"
          style={place}
        >
          {searchable && (
            <label className="flex items-center gap-2 px-4 py-2.5 border-b border-[#dce4ec]">
              <Search className="w-4 h-4 text-[#768994] shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="flex-1 min-w-0 text-sm text-[#122027] bg-transparent outline-none placeholder:text-[#9aabb5]"
              />
            </label>
          )}
          <div
            role="listbox"
            className={`flex-1 min-h-0 overflow-y-auto py-2 ${sideBySide && groups.size > 1 ? "grid divide-x divide-[#dce4ec]" : ""}`}
            style={sideBySide && groups.size > 1 ? { gridTemplateColumns: `repeat(${groups.size}, minmax(0, 1fr))` } : undefined}
          >
            {shown.length === 0 && <p className="px-4 py-3 text-sm text-[#768994]">Nothing matches.</p>}
            {[...groups].map(([group, list]) => (
              <div key={group} className="min-w-0">
                {group && <p className="px-4 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-[#768994]">{group}</p>}
                {list.map((item) => {
                  const active = item.id === value;
                  return (
                    <div key={item.id} className={`flex items-center ${active ? "bg-[#12a0e1]/10" : "hover:bg-slate-50"}`}>
                      <FullName text={item.label}>
                      <button
                        role="option"
                        aria-selected={active}
                        onClick={() => { onChange(item.id); setOpen(false); }}
                        className="flex-1 min-w-0 flex items-center gap-2 pl-4 pr-3 py-2 text-left"
                      >
                        <span className={`text-sm truncate ${compact ? "" : "font-bold"} ${active ? "text-sky-600" : "text-[#122027]"}`}>{item.label}</span>
                        {item.tag && <span className={tagClass(item)}>{item.tag}</span>}
                        {item.alert
                          ? <span className="ml-auto text-[11px] font-bold text-rose-600 shrink-0">{item.alert}</span>
                          : item.note && <span className="ml-auto text-[11px] text-[#768994] shrink-0">{item.note}</span>}
                      </button>
                      </FullName>
                      {onRemove && (
                        <button
                          onClick={() => onRemove(item.id)}
                          aria-label={`Remove ${item.label}`}
                          className="mr-2 p-1.5 rounded-lg text-[#9aabb5] hover:text-rose-600 hover:bg-rose-600/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
