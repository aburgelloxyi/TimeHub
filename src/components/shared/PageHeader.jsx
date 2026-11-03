import React, { createContext, useContext } from "react";
import { ChevronRight, Key } from "lucide-react";
import { PAGE_GRADIENTS } from "../../lib/pageGradients";
import { PAGES } from "../../lib/departments";

// Full-bleed page header whose gradient matches the Home row it was
// navigated from (see src/lib/pageGradients.js) — the header IS the row,
// grown, so the Home wash-transition resolves directly into it instead of
// cutting to an unrelated white card. Used by every top-level page. A page
// marked `wip` in the registry wears a "Work in progress" tag by its title.
//
// No icon: the rail already shows the page's, and the header says where you
// are in words. A page with depth passes `crumbs`, the levels above the title
// as { label, onClick }, drawn as a small trail that leads back up.
//
// A page about one thing with a picture of its own (a film's poster) can pass
// it as `cover`, shown small beside the title, and `backdrop`, washed blurred
// across the band so the header takes on its colours. `meta` is a row under the
// title for that thing's own controls and facts.
//
// With Wrike not connected, a notice runs along the header's foot. It belongs
// to the header so the gradient still starts at the top of the page. Profile
// leaves it out: that is where you connect.

// App provides this: whether Wrike is connected, and how to go and connect it.
export const WrikeConnectionContext = createContext({ connected: true, connect: () => {} });

export default function PageHeader({ pageId, title, subtitle, crumbs, cover, backdrop, meta, children, maxWidthClass = "max-w-[1800px]" }) {
  const gradient = PAGE_GRADIENTS[pageId] || PAGE_GRADIENTS.timesheet;
  const { connected, connect } = useContext(WrikeConnectionContext);

  return (
    <>
    <div data-page={pageId} className={`page-header relative bg-gradient-to-br ${gradient} py-6 sm:py-7`}>
      {/* Clipped on its own layer, not the band, so menus opening from the header aren't cut off. */}
      {backdrop && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <img
            key={backdrop}
            src={backdrop}
            alt=""
            className="header-backdrop view-fade absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-2xl saturate-150"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-black/10 to-transparent" />
        </div>
      )}
      {/* Padding lives inside the max-width box, not on this outer
          full-bleed wrapper — matching the page body's own
          max-w-[1800px] + px-6 pattern exactly, so the header's
          right-aligned children line up with the content below at any width
          (see the >1800px alignment fix). */}
      <div className={`relative ${maxWidthClass} mx-auto px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center gap-5`}>
        <div className="flex items-center gap-5 min-w-0 flex-1">
          {cover && (
            <img
              key={cover}
              src={cover}
              alt=""
              className="view-fade hidden sm:block h-24 w-16 shrink-0 rounded-lg object-cover shadow-lg ring-1 ring-white/25"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          )}
          <div className="min-w-0">
            {crumbs?.length > 0 && (
              <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1.5 min-w-0 text-[11px] font-bold uppercase tracking-[0.14em] text-white/65">
                {crumbs.map((c, i) => (
                  <React.Fragment key={`${i}:${c.label}`}>
                    {i > 0 && <ChevronRight aria-hidden className="w-3 h-3 shrink-0 text-white/40" strokeWidth={2.75} />}
                    {c.onClick ? (
                      <button
                        type="button"
                        onClick={c.onClick}
                        className="truncate uppercase underline decoration-transparent decoration-2 underline-offset-4 transition-colors hover:text-white hover:decoration-white/50 focus-visible:outline-none focus-visible:text-white focus-visible:decoration-white/70"
                      >
                        {c.label}
                      </button>
                    ) : (
                      <span className="truncate">{c.label}</span>
                    )}
                  </React.Fragment>
                ))}
              </nav>
            )}
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Keyed on the title, so going a level down or up fades the new one in rather than swapping it. */}
              <h1 key={title} className="view-fade font-display text-2xl sm:text-[2rem] sm:leading-tight font-bold text-white tracking-tight truncate">
                {title}
              </h1>
              {PAGES[pageId]?.wip && (
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-white/20 border border-white/30 text-[10px] font-black text-white uppercase tracking-widest">
                  Work in progress
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-xs sm:text-sm text-white/75 font-medium mt-1 truncate">
                {subtitle}
              </p>
            )}
            {meta && <div className="mt-2.5 flex flex-wrap items-center gap-2">{meta}</div>}
          </div>
        </div>

        {children && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {children}
          </div>
        )}
      </div>
    </div>
    {!connected && pageId !== "profile" && (
      <div className="bg-amber-50 border-b border-amber-200">
        <div className={`${maxWidthClass} mx-auto px-4 sm:px-6 py-2 flex items-center gap-3`}>
          <Key className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-xs font-bold text-amber-800 flex-1">
            Wrike isn't connected.
          </p>
          <button
            onClick={connect}
            className="text-xs font-black text-amber-600 hover:text-amber-800 underline underline-offset-2 shrink-0 transition-colors"
          >
            Connect
          </button>
        </div>
      </div>
    )}
    </>
  );
}

// Shared className for action buttons rendered inside a PageHeader — white
// translucent pill, legible on any of the section gradients.
export const pageHeaderActionClass =
  "flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur-sm rounded-xl transition-colors shadow-sm font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed";
