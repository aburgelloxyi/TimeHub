import React, { useState } from "react";
import { motion } from "framer-motion";
import { Briefcase, FolderPlus, Activity } from "lucide-react";
import PageHeader from "./shared/PageHeader";
import { JobsSetupSection, JobBookSection, JobsFeedSection } from "./Management";

// The PMs' day-to-day surface: every Jobs tool on one page — Setup, the
// Book itself, and the Feed — without the rest of Administration around
// them. Same section components Administration renders in its Jobs tabs;
// one implementation, two doors. Tab ids deliberately match Management's
// ("jobsSetup" / "jobs" / "feed") so the sections' internal deep-links
// (e.g. Jobs Setup's "View in Job Book") work unchanged via setTab.
const TABS = [
  { id: "jobsSetup", label: "Jobs Setup", icon: FolderPlus },
  { id: "jobs",      label: "Job Book",   icon: Briefcase },
  { id: "feed",      label: "Jobs Feed",  icon: Activity },
];

export default function JobBook() {
  const [tab, setTab] = useState("jobs");
  const activeMeta = TABS.find((t) => t.id === tab);

  return (
    <div className="min-h-screen bg-slate-100 text-[#122027] font-sans pb-16">
      <PageHeader
        pageId="jobbook"
        icon={Briefcase}
        title="Job Book"
        subtitle="Live job numbers, setup & feed"
      />

      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white border border-[#dce4ec] rounded-2xl p-6 shadow-sm">
          {/* The tab switcher lives beside the content it controls now,
              instead of on the gradient header — Job Book's three tabs are
              "pick a tool" (Setup/Book/Feed), not a frequently-flipped
              filter like Motion Board's Today/Tomorrow/Next Week, so they
              don't need the header's visual weight. */}
          <div className="flex items-center justify-between gap-3 flex-wrap mb-5 pb-4 border-b border-[#dce4ec]">
            <div className="flex items-center gap-2.5">
              {activeMeta && <activeMeta.icon className="w-4 h-4 text-[#12a0e1]" />}
              <h2 className="text-sm font-black uppercase tracking-widest text-[#122027]">
                {activeMeta?.label}
              </h2>
            </div>

            {/* Tinted teal — Job Book's own accent (PAGE_GRADIENTS.jobbook is
                teal->emerald) — instead of neutral grey, so the switcher
                still reads as "this page's control" now that it's sitting
                in a plain white card instead of on the gradient header. */}
            <div className="flex bg-teal-50 border border-teal-100 p-1.5 rounded-xl">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`relative isolate flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-colors ${
                    tab === id ? "text-[#122027]" : "text-teal-700/70 hover:text-teal-900 hover:bg-white/60"
                  }`}
                >
                  {/* Shared layoutId — the pill slides between tabs instead of
                      popping on the newly-active one (same gesture as Motion
                      Board's timeframe switcher). */}
                  {tab === id && (
                    <motion.span
                      layoutId="jobbook-tab-pill"
                      className="absolute inset-0 bg-white rounded-lg shadow-sm"
                      transition={{ type: "spring", stiffness: 500, damping: 32 }}
                    />
                  )}
                  <Icon className="relative z-10 w-3.5 h-3.5" />
                  <span className="relative z-10">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {tab === "jobsSetup" && <JobsSetupSection setActiveTab={setTab} />}
          {tab === "jobs" && <JobBookSection setActiveTab={setTab} />}
          {tab === "feed" && <JobsFeedSection />}
        </div>
      </div>
    </div>
  );
}
