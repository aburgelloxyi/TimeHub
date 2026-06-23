import React, { useState, useEffect } from "react";
import {
  Trophy,
  RefreshCw,
  AlertCircle,
  Key,
  Activity,
  CalendarDays,
  CheckCircle2,
  Clock,
} from "lucide-react";

export default function WorldCup() {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("football_api_key") || ""
  );
  const [matches, setMatches] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("ALL"); // ALL, LIVE, UPCOMING, FINISHED

  useEffect(() => {
    localStorage.setItem("football_api_key", apiKey);
  }, [apiKey]);

  const fetchWorldCupMatches = async () => {
    if (!apiKey.trim()) {
      setError("Please enter your football-data.org API key first.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const proxyUrl = "https://cors-anywhere.herokuapp.com/";
      const targetUrl =
        "https://api.football-data.org/v4/competitions/2000/matches";

      const response = await fetch(proxyUrl + targetUrl, {
        headers: {
          "X-Auth-Token": apiKey,
        },
      });

      if (!response.ok)
        throw new Error(
          `API Error: ${response.status} - Access denied or token invalid.`
        );

      const data = await response.json();
      setMatches(data.matches || []);
    } catch (err) {
      setError(
        err.message +
          " (Remember to click 'Request temporary access' on the cors-anywhere demo site!)"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // --- FILTER & GROUP LOGIC ---
  const filteredMatches = React.useMemo(() => {
    if (activeFilter === "LIVE") {
      return matches.filter(
        (m) => m.status === "IN_PLAY" || m.status === "PAUSED"
      );
    }
    if (activeFilter === "UPCOMING") {
      return matches.filter(
        (m) => m.status === "TIMED" || m.status === "SCHEDULED"
      );
    }
    if (activeFilter === "FINISHED") {
      return matches.filter((m) => m.status === "FINISHED");
    }
    return matches;
  }, [matches, activeFilter]);

  const groupedMatches = React.useMemo(() => {
    const groups = {};
    filteredMatches.forEach((match) => {
      const date = new Date(match.utcDate);
      const dateKey = date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(match);
    });
    return groups;
  }, [filteredMatches]);

  // --- UI HELPERS ---
  const formatTime = (utcDateString) => {
    return new Date(utcDateString).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatStage = (match) => {
    if (match.group) return match.group.replace("_", " ");
    if (match.stage) return match.stage.replace(/_/g, " ");
    return "WORLD CUP";
  };

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-8 space-y-6 pb-16">
      {/* HEADER */}
      <header className="bg-white shadow-sm border border-[#dce4ec] rounded-[2rem] p-6 sm:px-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-10 -mt-10 w-48 h-48 bg-amber-400/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex items-center gap-4 relative z-10">
          <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-3.5 rounded-2xl text-white shadow-lg shadow-orange-500/20">
            <Trophy className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[#122027]">
              World Cup Hub
            </h1>
            <p className="text-[#768994] text-sm font-medium mt-0.5">
              Live tournament coverage & schedules
            </p>
          </div>
        </div>

        <div className="flex w-full lg:w-auto relative z-10">
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Key className="w-4 h-4 text-slate-400" />
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="API Token..."
              className="w-full lg:w-48 bg-slate-50 border border-[#dce4ec] rounded-l-xl pl-10 pr-3 py-3 text-sm font-medium focus:border-orange-500 outline-none transition-all"
            />
          </div>
          <button
            onClick={fetchWorldCupMatches}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 bg-[#122027] hover:bg-[#25373c] text-white px-5 py-3 rounded-r-xl font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
            />
            {isLoading ? "Syncing..." : "Sync"}
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium leading-relaxed">{error}</p>
        </div>
      )}

      {/* MATCHES DASHBOARD */}
      <div className="bg-white border border-[#dce4ec] shadow-xl shadow-slate-200/40 rounded-[2rem] overflow-hidden flex flex-col min-h-[600px]">
        {/* Filter Navigation */}
        <div className="flex overflow-x-auto custom-scrollbar border-b border-[#dce4ec] bg-slate-50/50 p-2 gap-2 shrink-0">
          {[
            { id: "ALL", label: "All Matches", icon: CalendarDays },
            { id: "LIVE", label: "Live Now", icon: Activity },
            { id: "UPCOMING", label: "Upcoming", icon: Clock },
            { id: "FINISHED", label: "Results", icon: CheckCircle2 },
          ].map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                activeFilter === filter.id
                  ? "bg-white text-orange-500 shadow-sm border border-slate-200"
                  : "text-[#768994] hover:bg-slate-100 hover:text-[#122027] border border-transparent"
              }`}
            >
              <filter.icon
                className={`w-4 h-4 ${
                  filter.id === "LIVE" && activeFilter === "LIVE"
                    ? "animate-pulse"
                    : ""
                }`}
              />
              {filter.label}
              {filter.id === "LIVE" &&
                matches.some((m) => m.status === "IN_PLAY") && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse ml-1"></span>
                )}
            </button>
          ))}
        </div>

        {/* Matches List */}
        <div className="p-6 sm:p-8 flex-1 bg-slate-50/30 overflow-y-auto">
          {matches.length === 0 && !isLoading && !error ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-50 py-20">
              <Trophy className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="font-bold text-xl text-[#122027]">No Data Synced</p>
              <p className="text-sm text-[#768994] mt-2">
                Enter your API key and sync to load the tournament.
              </p>
            </div>
          ) : Object.keys(groupedMatches).length === 0 && !isLoading ? (
            <div className="text-center py-20 text-[#768994]">
              <p className="font-bold text-lg">
                No matches found for "{activeFilter}"
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {Object.entries(groupedMatches).map(([date, dayMatches]) => (
                <div key={date}>
                  {/* Date Header */}
                  <h3 className="text-xs font-black uppercase tracking-widest text-[#768994] mb-4 flex items-center gap-3">
                    {date}
                    <div className="h-px flex-1 bg-[#dce4ec]"></div>
                  </h3>

                  {/* Games Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dayMatches.map((match) => {
                      const isLive =
                        match.status === "IN_PLAY" || match.status === "PAUSED";
                      const isFinished = match.status === "FINISHED";
                      const homeScore =
                        match.score?.fullTime?.home ??
                        (isLive ? match.score?.current?.home ?? 0 : "-");
                      const awayScore =
                        match.score?.fullTime?.away ??
                        (isLive ? match.score?.current?.away ?? 0 : "-");

                      const homeTeamName =
                        match.homeTeam?.shortName ||
                        match.homeTeam?.name ||
                        "TBD";
                      const awayTeamName =
                        match.awayTeam?.shortName ||
                        match.awayTeam?.name ||
                        "TBD";

                      return (
                        <div
                          key={match.id}
                          className={`bg-white border rounded-2xl p-4 transition-all hover:shadow-md ${
                            isLive
                              ? "border-rose-400 shadow-sm shadow-rose-100"
                              : "border-[#dce4ec] hover:border-orange-300"
                          }`}
                        >
                          {/* Card Header (Stage & Time) */}
                          <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                              {formatStage(match)}
                            </span>
                            {isLive ? (
                              <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md flex items-center gap-1.5 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>{" "}
                                LIVE
                              </span>
                            ) : isFinished ? (
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                                FT
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold text-[#122027]">
                                {formatTime(match.utcDate)}
                              </span>
                            )}
                          </div>

                          {/* Teams & Scores */}
                          <div className="flex flex-col gap-2.5">
                            {/* Home Team Row */}
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                {match.homeTeam?.crest ? (
                                  <img
                                    src={match.homeTeam.crest}
                                    alt=""
                                    className="w-6 h-6 object-contain"
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200"></div>
                                )}
                                <span
                                  className={`text-sm font-bold ${
                                    isFinished && homeScore > awayScore
                                      ? "text-[#122027]"
                                      : isFinished
                                      ? "text-slate-500"
                                      : "text-[#122027]"
                                  }`}
                                >
                                  {homeTeamName}
                                </span>
                              </div>
                              <span
                                className={`text-lg font-black ${
                                  isLive
                                    ? "text-rose-600"
                                    : isFinished
                                    ? homeScore > awayScore
                                      ? "text-[#122027]"
                                      : "text-slate-400"
                                    : "text-slate-300"
                                }`}
                              >
                                {homeScore}
                              </span>
                            </div>

                            {/* Away Team Row */}
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                {match.awayTeam?.crest ? (
                                  <img
                                    src={match.awayTeam.crest}
                                    alt=""
                                    className="w-6 h-6 object-contain"
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200"></div>
                                )}
                                <span
                                  className={`text-sm font-bold ${
                                    isFinished && awayScore > homeScore
                                      ? "text-[#122027]"
                                      : isFinished
                                      ? "text-slate-500"
                                      : "text-[#122027]"
                                  }`}
                                >
                                  {awayTeamName}
                                </span>
                              </div>
                              <span
                                className={`text-lg font-black ${
                                  isLive
                                    ? "text-rose-600"
                                    : isFinished
                                    ? awayScore > homeScore
                                      ? "text-[#122027]"
                                      : "text-slate-400"
                                    : "text-slate-300"
                                }`}
                              >
                                {awayScore}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
