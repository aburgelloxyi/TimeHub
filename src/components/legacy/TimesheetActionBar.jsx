import { motion } from "framer-motion";
import { CheckCircle, Copy, Layers, LayoutList, Lock, MessageSquareWarning, MessagesSquare, Settings } from "lucide-react";
import { HoverLabel } from "../shared/FloatingCard";
import PullDefaultsPopover from "./PullDefaultsPopover";
import PullTimesButton from "./PullTimesButton";
import PasteNextSteps from "../shared/PasteNextSteps";

// Bottom-bar tools that are an icon until hovered or focused. The label's
// width is animated, so the button grows instead of a tooltip appearing; on a
// touch screen it stays an icon and aria-label names it.
const quietToolClass =
  "group/tool flex items-center p-3 bg-white hover:bg-slate-50 text-[#122027] text-sm font-bold border border-[#dce4ec] rounded-xl shadow-sm transition-[background-color,transform] active:scale-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#12a0e1]/30";

// The table settings opening and closing: a spring to the real width of the
// controls, soft enough to settle without a visible bounce.
const TONGUE_SPRING = { type: "spring", stiffness: 210, damping: 26, mass: 0.9 };

const tongueFold = (shown) => ({ width: shown ? "auto" : 0, opacity: shown ? 1 : 0 });

const quietToolLabelClass =
  "max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,margin] duration-500 ease-in-out [@media(hover:hover)]:group-hover/tool:max-w-[10rem] [@media(hover:hover)]:group-hover/tool:opacity-100 [@media(hover:hover)]:group-hover/tool:ml-2 group-focus-visible/tool:max-w-[10rem] group-focus-visible/tool:opacity-100 group-focus-visible/tool:ml-2";

// The bar under the timesheet table: the occasional tools and the table's view
// settings on the left, then pulling times, locking the day and copying it out.
// State and handlers are the timesheet's own (LegacyTimesheets.js), passed in.
export default function TimesheetActionBar({
  activeDay, canDebugPull, consolidatedView, defaultCategory, groupMultiCountry, handleCopyJSON,
  handleOpenWrikeModal, handlePullTimes, isAdmin, isDayFrozen, isPulling, jsonCopied, lockIconRef,
  setPrefs, setPullDefaultsOpen, setShowCommentTrail, setShowPasteSteps, setShowReportProblem,
  setTongueFocus, setTongueHover, setTonguePinned, showPasteSteps, showToast, switchConsolidated,
  toggleFreeze, tongueLeaveTimer, tongueOpen, tongueRef, topCategories, wrikeUserId,
}) {
  return (
    <div className="p-4 pt-7 2xl:pt-4 border-t border-[#dce4ec] bg-slate-50 rounded-b-2xl flex flex-wrap gap-3 justify-between items-center">
      {/* The two occasional tools: icons at rest, opening out to their
          names on hover or keyboard focus. */}
      <div className="flex gap-3 flex-wrap items-center">
        <button
          onClick={handleOpenWrikeModal}
          aria-label="Wrike Timesheets"
          className={quietToolClass}
        >
          <LayoutList className="w-4 h-4 shrink-0" />
          <span className={quietToolLabelClass}>Wrike Timesheets</span>
        </button>
        <button
          onClick={() => {
            if (!wrikeUserId) {
              showToast("Please connect Wrike in Profile → Settings first.");
              return;
            }
            setShowReportProblem(true);
          }}
          aria-label="Report a problem"
          className={quietToolClass}
        >
          <MessageSquareWarning className="w-4 h-4 shrink-0" />
          <span className={quietToolLabelClass}>Report a problem</span>
        </button>
        {/* The table's view controls, behind a cog: a third tool that
            opens out along the bar to Consolidated, Lock and the pull
            defaults (see tongueOpen for when). The cog is tinted when one
            of them is switched on, a locked day most of all, so that
            isn't hidden while it's closed. */}
        <div
          ref={tongueRef}
          // Mouse only: a touch fires pointerenter too, and would open it
          // with nothing to close it. It stays open a little after the
          // pointer leaves, so drifting off it on the way to a control
          // doesn't shut it.
          onPointerEnter={(e) => {
            if (e.pointerType !== "mouse") return;
            clearTimeout(tongueLeaveTimer.current);
            setTongueHover(true);
          }}
          onPointerLeave={() => {
            clearTimeout(tongueLeaveTimer.current);
            tongueLeaveTimer.current = setTimeout(() => setTongueHover(false), 500);
          }}
          // Keyboard focus only, so a mouse click on a control doesn't hold
          // it open after the pointer has gone.
          onFocus={(e) => setTongueFocus(e.target.matches(":focus-visible"))}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setTongueFocus(false);
          }}
          className="flex items-center bg-white border border-[#dce4ec] rounded-xl shadow-sm"
        >
          <button
            onClick={() => setTonguePinned((v) => !v)}
            aria-label="Table settings"
            aria-expanded={tongueOpen}
            // h-11 with the wrapper's border is the height of the two tools
            // beside it, whose (hidden) labels set a taller line than an icon.
            className={`flex items-center justify-center h-11 px-3 rounded-xl hover:bg-slate-50 transition-[background-color,transform] active:scale-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#12a0e1]/30 ${
              isDayFrozen ? "text-amber-600"
              : consolidatedView || defaultCategory || groupMultiCountry ? "text-[#12a0e1]"
              : "text-[#122027]"
            }`}
          >
            <motion.span initial={false} animate={{ rotate: tongueOpen ? 120 : 0 }} transition={TONGUE_SPRING} className="flex">
              <Settings className="w-4 h-4 shrink-0" />
            </motion.span>
          </button>
          <motion.div initial={false} animate={tongueFold(tongueOpen)} transition={TONGUE_SPRING} className="overflow-hidden min-w-0">
            <div className="flex items-center gap-1 pr-2 whitespace-nowrap">
              <HoverLabel label="One row per job, with its markets and categories nested underneath">
                <button
                  onClick={() => switchConsolidated()}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                    consolidatedView ? "text-[#12a0e1]" : "text-[#768994] hover:text-[#122027]"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Consolidated
                  <span className={`ml-0.5 text-[10px] font-black px-1.5 py-0.5 rounded ${consolidatedView ? "bg-[#12a0e1] text-white" : "bg-slate-100 text-slate-600"}`}>
                    {consolidatedView ? "ON" : "OFF"}
                  </span>
                </button>
              </HoverLabel>
              <span className="w-px h-4 bg-[#dce4ec] shrink-0" />
              <HoverLabel label={isDayFrozen ? "Unlock day to allow edits" : "Lock this day to prevent edits"}>
                <button
                  onClick={toggleFreeze}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                    isDayFrozen ? "text-amber-600" : "text-[#768994] hover:text-[#122027]"
                  }`}
                >
                  <Lock ref={lockIconRef} className="w-3.5 h-3.5" />
                  {isDayFrozen ? `${activeDay} locked` : `Lock ${activeDay}`}
                </button>
              </HoverLabel>
              <span className="w-px h-4 bg-[#dce4ec] shrink-0" />
              <PullDefaultsPopover
                defaultCategory={defaultCategory}
                groupMultiCountry={groupMultiCountry}
                setPrefs={setPrefs}
                onOpenChange={setPullDefaultsOpen}
                pinnedCategories={topCategories}
              />
            </div>
          </motion.div>
        </div>
      </div>
      {/* Left to right in the order they're used: get rows in (from
          comments, or from Wrike's own times), then copy them out. */}
      <div className="flex gap-3 flex-wrap">
        <HoverLabel label="Suggests rows from your Wrike comments">
          <button
            onClick={() => {
              if (!wrikeUserId) {
                showToast("Please connect Wrike in Profile → Settings first.");
                return;
              }
              setShowCommentTrail(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-white hover:bg-slate-50 text-[#122027] border border-[#dce4ec] rounded-xl shadow-sm transition-[background-color,transform] active:scale-95"
          >
            <MessagesSquare className="w-4 h-4" />
            Where Did My Day Go?
          </button>
        </HoverLabel>
        {/* isAdmin stays in the OR so the admin keeps the date picker
            without waiting on (or depending on) the profile read landing. */}
        <PullTimesButton
          isPulling={isPulling}
          disabled={isDayFrozen}
          canPickDate={isAdmin || canDebugPull}
          onPull={handlePullTimes}
        />
        {/* The steps hang off the button that produced them, so the answer
            to "what do I do with this?" is where the question was asked.
            Upward and right-aligned: this is the bottom action bar, and the
            right-hand end of it. */}
        <div className="relative">
          <HoverLabel label="Copies this week's rows, ready to paste into your timesheet bookmark">
            <button
              onClick={handleCopyJSON}
              data-bubble-avoid
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl shadow-sm transition-[background-color,box-shadow,transform] active:scale-95 ${
                jsonCopied
                  ? "bg-[#1cc1a5] text-white shadow-[#1cc1a5]/30"
                  : "bg-[#12a0e1] hover:bg-[#0d8bc4] text-white shadow-[#12a0e1]/30"
              }`}
            >
              {jsonCopied ? (
                <CheckCircle className="pop-in w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              {jsonCopied ? "Copied!" : "Copy Me!"}
            </button>
          </HoverLabel>

          {showPasteSteps && (
            <PasteNextSteps
              copied
              popover
              onDismiss={() => setShowPasteSteps(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
