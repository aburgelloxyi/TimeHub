import React, { useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import ReportProblemModal from "../legacy/ReportProblemModal";
import { supabase } from "../../lib/supabaseClient";
import { notify } from "../../lib/toast";

// "Report a problem" from Client Orders, dressed like the header's other
// round glass buttons: it widens to say what it is when pointed at. The note
// goes where Timesheets' does, Administration › Feedback, marked as from here.

const reveal =
  "grid grid-cols-[0fr] opacity-0 transition-[grid-template-columns,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none group-hover:grid-cols-[1fr] group-hover:opacity-100 group-focus-visible:grid-cols-[1fr] group-focus-visible:opacity-100";

export default function ReportButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const wrikeUserId = localStorage.getItem("wrike_user_id");

  const start = () => {
    if (!wrikeUserId) {
      notify("Connect Wrike in Profile first.");
      return;
    }
    setOpen(true);
    if (!name) {
      supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("wrike_user_id", wrikeUserId)
        .maybeSingle()
        .then(({ data }) => setName([data?.first_name, data?.last_name].filter(Boolean).join(" ")));
    }
  };

  return (
    <>
      <button
        onClick={start}
        aria-label="Report a problem"
        className="group press flex items-center h-10 rounded-full border overflow-hidden bg-white/15 hover:bg-white/25 border-white/25 text-white backdrop-blur-sm transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <span className="w-10 h-10 shrink-0 flex items-center justify-center">
          <MessageSquareWarning className="w-[17px] h-[17px]" />
        </span>
        <span className={reveal}>
          <span className="overflow-hidden">
            <span className="block whitespace-nowrap text-sm font-bold pr-4">Report a problem</span>
          </span>
        </span>
      </button>
      {open && (
        <ReportProblemModal
          wrikeUserId={wrikeUserId}
          userName={name}
          page="Client Orders"
          onClose={() => setOpen(false)}
          onSent={() => notify("Thanks, your report has been sent.", "success")}
        />
      )}
    </>
  );
}
