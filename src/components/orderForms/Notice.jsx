import { AlertTriangle } from "lucide-react";

// Something Client Orders wants a PM to know: a card like the page's others,
// with a small gradient chip saying what kind of thing it is, a one-line title,
// the detail in the page's quiet text, and what can be done about it.
const TONES = {
  warn: "from-[#f59e0b] to-[#f97316]",
  info: "from-[#12a0e1] to-[#1cc1a5]",
};

export default function Notice({ tone = "warn", icon: Icon = AlertTriangle, title, children, actions, role = "status" }) {
  return (
    <div role={role} className="view-in flex flex-wrap items-start gap-x-4 gap-y-3 rounded-2xl border border-[#dce4ec] bg-white px-4 py-3.5 shadow-sm">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${TONES[tone] || TONES.warn} text-white shadow-sm`}>
        <Icon className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-sm font-bold text-[#122027]">{title}</p>
        {children && <div className="mt-0.5 text-sm leading-relaxed text-[#768994]">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 self-center">{actions}</div>}
    </div>
  );
}

// The buttons a notice offers: a quiet one, and one for removing something.
export const noticeButton = "press rounded-xl border border-[#dce4ec] bg-white px-3 py-1.5 text-xs font-bold text-[#122027] transition-colors hover:border-[#12a0e1]";
export const noticeDanger = "press rounded-xl border border-[#dce4ec] bg-white px-3 py-1.5 text-xs font-bold text-rose-600 transition-colors hover:border-rose-400 hover:bg-rose-500/10";
