import React from "react";
import { Layers, CheckCircle, Film, Clock, BarChart2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { getTimesheetValue } from "../../utils/timeHelpers";

const PIE_COLORS = ["#12a0e1","#1cc1a5","#8b5cf6","#f59e0b","#ec4899","#10b981","#f43f5e","#6366f1"];

export default function AnalyticsTab({
  totalSecondsAllWeek,
  timePerJobData,
  campaignPieData,
  myActiveWrikeTasks,
  myCompletedWrikeTasks,
}) {
  const kpiCards = [
    { label: "Active Jobs", value: myActiveWrikeTasks.length, unit: "tasks", color: "text-[#12a0e1]", bg: "bg-[#12a0e1]/10", icon: Layers },
    { label: "30-Day Deliveries", value: myCompletedWrikeTasks.length, unit: "done", color: "text-[#1cc1a5]", bg: "bg-[#1cc1a5]/10", icon: CheckCircle },
    { label: "Campaigns", value: campaignPieData.length, unit: "active", color: "text-purple-600", bg: "bg-purple-500/10", icon: Film },
    { label: "Timesheet Total", value: getTimesheetValue(totalSecondsAllWeek), unit: "h logged", color: "text-amber-600", bg: "bg-amber-500/10", icon: Clock },
  ];

  return (
    <div className="h-full flex flex-col gap-6 animate-in fade-in duration-300">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map(({ label, value, unit, color, bg, icon: Icon }) => (
          <div key={label} className="bg-white border border-[#dce4ec] rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-2">
              <div className={`${bg} p-2 rounded-lg ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-xs font-black text-[#768994] uppercase tracking-widest">{label}</span>
            </div>
            <div className="text-2xl font-black text-[#122027]">
              {value} <span className="text-sm font-bold text-[#768994]">{unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[350px]">
        {/* Timesheet bar chart */}
        <div className="bg-white border border-[#dce4ec] rounded-2xl p-5 shadow-sm flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-black text-[#122027] tracking-tight">Timesheet Distribution</h3>
            <p className="text-[11px] text-[#768994] mt-0.5">Base vs. Additional time on your logged rows.</p>
          </div>
          {timePerJobData.length > 0 ? (
            <div className="flex-1 min-h-0 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timePerJobData} margin={{ top: 10, right: 10, left: -25, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#768994", fontSize: 9, fontWeight: 600 }} dy={10} angle={-25} textAnchor="end" />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#768994", fontSize: 10, fontWeight: 600 }} />
                  <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ backgroundColor: "#ffffff", borderColor: "#dce4ec", borderRadius: "12px", color: "#323b43", fontSize: "11px", fontWeight: 600, boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                  <Bar dataKey="TimeSpent" name="Base (Mins)" stackId="a" fill="#12a0e1" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="Additional" name="Additional (Mins)" stackId="a" fill="#1cc1a5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-[#768994]">
              <BarChart2 className="w-8 h-8 text-slate-200 mb-2" />
              <p className="text-sm font-bold">No time logged yet.</p>
            </div>
          )}
        </div>

        {/* Campaign pie chart */}
        <div className="bg-white border border-[#dce4ec] rounded-2xl p-5 shadow-sm flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-black text-[#122027] tracking-tight">Active Workload</h3>
            <p className="text-[11px] text-[#768994] mt-0.5">Which campaigns have the most active tasks.</p>
          </div>
          {campaignPieData.length > 0 ? (
            <div className="flex-1 min-h-0 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={campaignPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={4} dataKey="value" stroke="none">
                    {campaignPieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderColor: "#dce4ec", borderRadius: "12px", color: "#323b43", fontSize: "11px", fontWeight: 600, boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                  <Legend iconType="circle" layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: "10px", fontWeight: 600, color: "#768994" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-[#768994]">
              <Film className="w-8 h-8 text-slate-200 mb-2" />
              <p className="text-sm font-bold">No active campaigns found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
