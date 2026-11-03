import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { searchIndex, searchOrders, groupHits } from "../../lib/orderForms/search";
import { SearchResults } from "./ControlSearch";

// Client Orders' search, in the page header beside the Google button and
// dressed like it: a round glass button that widens into a search box when
// pointed at or focused, and stays open while it holds a query. It searches
// the same way as the Control Centre's (search.js), and a result opens its
// market at that order. ⌘K puts the cursor in it.
//
// It searches where you are: every film from the front page, the open film
// (both its sides) inside one, the open market inside that. `scope` says which
// ({ label, fileIds, market? }), shown as a chip in the box; the chip's × widens
// the search to everything until the page moves on.

const linkTo = (fileId, market, action) =>
  `#orderforms/${encodeURIComponent(fileId)}${market ? `/${encodeURIComponent(market)}` : ""}${action ? `/${action}` : ""}`;

export default function HeaderSearch({ files, matcher, today, scope = null }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false); // the results, shown while searching
  const wrap = useRef(null);
  const input = useRef(null);

  const index = useMemo(
    () => (files?.length ? searchIndex(files, today, (file, market) => matcher.match(market.orders, file.links?.[market.name], file.briefed?.[market.name], market.kind || file.kind)) : []),
    [files, today, matcher]
  );
  const [wide, setWide] = useState(false);
  const scopeKey = scope ? `${scope.fileIds.join(",")}|${scope.market || ""}` : "";
  useEffect(() => setWide(false), [scopeKey]);
  const narrow = scope && !wide;
  const searched = useMemo(
    () => (narrow ? index.filter((h) => scope.fileIds.includes(h.fileId) && (!scope.market || h.market === scope.market)) : index),
    // scopeKey stands for scope's contents, which is a new object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, narrow, scopeKey]
  );
  const result = useMemo(() => searchOrders(searched, query), [searched, query]);
  const searching = query.trim().length > 0;

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    const onDown = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    // Following a result goes to its market: the search has done its job.
    const onHash = () => { setOpen(false); setQuery(""); input.current?.blur(); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  // Open by pointer or focus, like the Google button; held open by a query.
  const held = searching ? "grid-cols-[1fr] opacity-100" : "grid-cols-[0fr] opacity-0";
  const reveal = `grid ${held} transition-[grid-template-columns,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none group-hover:grid-cols-[1fr] group-hover:opacity-100 group-focus-within:grid-cols-[1fr] group-focus-within:opacity-100 [@media(hover:none)]:grid-cols-[1fr] [@media(hover:none)]:opacity-100`;

  return (
    // Drawn above its neighbour, so the G's glow passes under the glass and
    // is blurred with the rest of what's behind it.
    <div ref={wrap} className="relative z-10">
      <label
        className="group flex items-center h-10 rounded-full border overflow-hidden cursor-text bg-white/15 hover:bg-white/25 focus-within:bg-white/25 border-white/25 text-white backdrop-blur-sm transition-colors duration-300"
        aria-label={narrow ? `Search ${scope.label}` : "Search every order"}
      >
        <span className="w-10 h-10 shrink-0 flex items-center justify-center">
          <Search className="w-[17px] h-[17px] transition-transform duration-300 group-hover:scale-110" />
        </span>
        <span className={reveal}>
          <span className="overflow-hidden">
            <span className="flex items-center gap-1 pr-2">
              {narrow && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setWide(true); input.current?.focus(); }}
                  title="Search every film instead"
                  className="group/scope mr-1 flex max-w-[11rem] shrink-0 items-center gap-1 rounded-full bg-white/20 py-0.5 pl-2.5 pr-1.5 text-[11px] font-bold text-white transition-colors hover:bg-white/30"
                >
                  <span className="truncate">In {scope.label}</span>
                  <X className="h-3 w-3 shrink-0 transition-transform duration-200 group-hover/scope:rotate-90" />
                </button>
              )}
              <input
                ref={input}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); e.currentTarget.blur(); } }}
                placeholder={narrow ? `Search ${scope.label}…` : "Search every order…"}
                className="w-56 sm:w-72 bg-transparent text-sm font-bold text-white placeholder:text-white/60 placeholder:font-normal focus:outline-none"
              />
              {searching ? (
                <button onClick={() => { setQuery(""); input.current?.focus(); }} aria-label="Clear the search" className="p-1 rounded-full text-white/70 hover:text-white hover:bg-white/15">
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <kbd className="hidden sm:inline-flex px-1.5 py-0.5 rounded-md border border-white/25 text-[10px] font-bold text-white/70">⌘K</kbd>
              )}
            </span>
          </span>
        </span>
      </label>

      <AnimatePresence>
        {open && searching && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute right-0 top-full mt-2 z-50 w-[min(46rem,calc(100vw-2rem))] origin-top-right rounded-2xl border border-[#dce4ec] bg-white shadow-2xl overflow-hidden text-left"
          >
            {/* The panel is the card and scrolls inside itself, with the
                app's thin scrollbar held clear of the rounded corners. */}
            <div className="max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-inset">
              <SearchResults compact query={query} result={result} groups={groupHits(result.hits)} films={files?.length || 0} today={today} linkTo={linkTo} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
