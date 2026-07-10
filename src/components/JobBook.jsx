import React from "react";
import { Briefcase } from "lucide-react";
import PageHeader from "./shared/PageHeader";
import { JobBookSection } from "./Management";

// The PMs' day-to-day surface: the Job Book on its own page, without the
// rest of Administration around it. Same section component Administration
// renders in its "Job Book" tab — one implementation, two doors.
export default function JobBook() {
  return (
    <div className="min-h-screen bg-slate-100 text-[#122027] font-sans">
      <PageHeader
        pageId="jobbook"
        icon={Briefcase}
        title="Job Book"
        subtitle="Live job numbers & budgets"
      />
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-6">
        <JobBookSection />
      </div>
    </div>
  );
}
