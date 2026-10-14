import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

// A right-click menu for a list's rows: the same few actions each row has,
// at the pointer, as a shortcut. Every action in one is also somewhere on the
// page, since a right-click can't be seen and a touch screen has none.
//
// useContextMenu() gives `menu` (render it once) and `bind(itemsFor)`, the
// props for a row: right-click, or a long press on a touch screen, opens it.
// Shift with right-click, and anywhere text is typed (where people want the
// browser's paste and spelling), are left to the browser's own menu.
//
// Items are { label, icon, onSelect, href, hint, danger, disabled } or
// "-" for a divider; `href` opens in a new tab, as the row's own links do.

const LONG_PRESS_MS = 500;
const typedIn = (target) => !!target?.closest?.("input, textarea, select, [contenteditable='true']");

function Menu({ at, items, onClose }) {
  const box = useRef(null);
  const [place, setPlace] = useState({ left: at.x, top: at.y });
  const [active, setActive] = useState(-1);
  const usable = items.map((it, i) => (it !== "-" && !it.disabled ? i : -1)).filter((i) => i >= 0);

  // Kept on screen: flipped left or up when there is no room.
  useLayoutEffect(() => {
    const r = box.current.getBoundingClientRect();
    setPlace({
      left: at.x + r.width > window.innerWidth - 8 ? Math.max(8, at.x - r.width) : at.x,
      top: at.y + r.height > window.innerHeight - 8 ? Math.max(8, at.y - r.height) : at.y,
    });
  }, [at]);

  useEffect(() => {
    const onDown = (e) => { if (!box.current?.contains(e.target)) onClose(); };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const at = usable.indexOf(active);
        const next = e.key === "ArrowDown" ? usable[(at + 1) % usable.length] : usable[(at - 1 + usable.length) % usable.length];
        setActive(next ?? -1);
      } else if (e.key === "Enter" && active >= 0) {
        e.preventDefault();
        box.current?.querySelector(`[data-item="${active}"]`)?.click();
      }
    };
    const onScroll = () => onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    window.addEventListener("blur", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("blur", onScroll);
    };
  }, [active, usable, onClose]);

  return (
    <motion.div
      ref={box}
      role="menu"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
      transition={{ duration: 0.14, ease: "easeOut" }}
      style={{ ...place, transformOrigin: `${place.left < at.x ? "right" : "left"} ${place.top < at.y ? "bottom" : "top"}` }}
      className="fixed z-[99999] min-w-[13rem] max-w-[20rem] py-1.5 bg-white border border-[#dce4ec] rounded-xl shadow-2xl"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => {
        if (it === "-") return <div key={`d${i}`} className="my-1.5 border-t border-slate-100" />;
        const Icon = it.icon;
        const cls = `w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors disabled:opacity-40 ${
          active === i ? "bg-slate-100" : "hover:bg-slate-50"
        } ${it.danger ? "text-rose-600" : "text-[#122027]"}`;
        const body = (
          <>
            {Icon ? <Icon className={`w-4 h-4 shrink-0 ${it.danger ? "" : "text-[#768994]"}`} /> : <span className="w-4 shrink-0" />}
            <span className="flex-1 min-w-0 truncate">{it.label}</span>
            {it.hint && <span className="text-[11px] text-[#9aabb5] shrink-0">{it.hint}</span>}
          </>
        );
        const common = { "data-item": i, role: "menuitem", onMouseEnter: () => setActive(i) };
        return it.href ? (
          <a key={it.label} {...common} href={it.href} target="_blank" rel="noreferrer" onClick={onClose} className={cls}>{body}</a>
        ) : (
          <button key={it.label} {...common} disabled={it.disabled} onClick={() => { onClose(); it.onSelect?.(); }} className={cls}>{body}</button>
        );
      })}
    </motion.div>
  );
}

export function useContextMenu() {
  const [open, setOpen] = useState(null); // { at: { x, y }, items }
  const press = useRef(null);
  const close = useCallback(() => setOpen(null), []);

  const show = (x, y, items) => {
    // No dividers at the ends, or two together, when items were left out.
    const tidy = [];
    for (const it of items || []) {
      if (!it) continue;
      if (it === "-" && (!tidy.length || tidy[tidy.length - 1] === "-")) continue;
      tidy.push(it);
    }
    if (tidy[tidy.length - 1] === "-") tidy.pop();
    if (tidy.some((it) => it !== "-")) setOpen({ at: { x, y }, items: tidy });
  };

  const bind = (itemsFor) => ({
    onContextMenu: (e) => {
      if (e.shiftKey || typedIn(e.target)) return; // the browser's own menu
      e.preventDefault();
      show(e.clientX, e.clientY, itemsFor());
    },
    onPointerDown: (e) => {
      if (e.pointerType !== "touch" || typedIn(e.target)) return;
      const { clientX, clientY } = e;
      press.current = setTimeout(() => show(clientX, clientY, itemsFor()), LONG_PRESS_MS);
    },
    onPointerUp: () => clearTimeout(press.current),
    onPointerMove: () => clearTimeout(press.current),
    onPointerCancel: () => clearTimeout(press.current),
  });

  const menu = createPortal(
    <AnimatePresence>{open && <Menu key={`${open.at.x},${open.at.y}`} at={open.at} items={open.items} onClose={close} />}</AnimatePresence>,
    document.body
  );
  return { menu, bind, close };
}
