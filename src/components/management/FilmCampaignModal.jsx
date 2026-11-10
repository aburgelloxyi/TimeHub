// One film's jobs, opened from the Films list: the same Jobs setup the Job Book
// page has, fixed on this film.
//
// Part of Administration. Split out of components/Management.jsx, which is
// still the entry point and re-exports what other screens import.
import { Film, X } from "lucide-react";
import { JobsSetupSection } from "./JobsSetupSection";

export function FilmCampaignModal({ filmTitle, onClose }) {
  return (
    <div
      className="fade-in-fast fixed inset-0 z-[9999] bg-[#122027]/60 backdrop-blur-sm flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      onMouseDown={onClose}
    >
      <div
        className="rise-in bg-white rounded-3xl shadow-2xl w-full max-w-6xl my-4 flex flex-col overflow-hidden border border-[#dce4ec]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-4 border-b border-[#dce4ec] flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#0f766e] mb-0.5">This film&rsquo;s jobs</p>
            <h2 className="text-xl font-black text-[#122027] truncate flex items-center gap-2">
              <Film className="w-4 h-4 text-[#768994] shrink-0" />
              {filmTitle}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="press p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5">
          <JobsSetupSection initialFilm={filmTitle} lockPickers />
        </div>
      </div>
    </div>
  );
}
