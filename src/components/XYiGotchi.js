import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Trophy,
  Star,
  Monitor,
  PackageOpen,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

// --- ASSET DATABASE WITH FIXED COORDINATES ---
const STICKER_DB = [
  // Commons (50% chance)
  {
    id: "c1",
    name: "Spilled Coffee",
    rarity: "Common",
    icon: "☕",
    color: "text-slate-600",
    bg: "bg-slate-100",
    top: "15%",
    left: "15%",
  },
  {
    id: "c2",
    name: "Missing Fonts",
    rarity: "Common",
    icon: "🔤",
    color: "text-slate-600",
    bg: "bg-slate-100",
    top: "15%",
    left: "75%",
  },
  {
    id: "c3",
    name: "AE Crash",
    rarity: "Common",
    icon: "⚠️",
    color: "text-slate-600",
    bg: "bg-slate-100",
    top: "40%",
    left: "12%",
  },
  {
    id: "c4",
    name: "V1_Final",
    rarity: "Common",
    icon: "📄",
    color: "text-slate-600",
    bg: "bg-slate-100",
    top: "40%",
    left: "80%",
  },

  // Rares (30% chance)
  {
    id: "r1",
    name: "Midnight Pizza",
    rarity: "Rare",
    icon: "🍕",
    color: "text-blue-600",
    bg: "bg-blue-50",
    top: "70%",
    left: "15%",
  },
  {
    id: "r2",
    name: "Magic Keyframe",
    rarity: "Rare",
    icon: "🗝️",
    color: "text-blue-600",
    bg: "bg-blue-50",
    top: "70%",
    left: "75%",
  },
  {
    id: "r3",
    name: "Client Approved!",
    rarity: "Rare",
    icon: "✅",
    color: "text-blue-600",
    bg: "bg-blue-50",
    top: "20%",
    left: "35%",
  },

  // Epics (15% chance)
  {
    id: "e1",
    name: "Golden Node",
    rarity: "Epic",
    icon: "🖥️",
    color: "text-purple-600",
    bg: "bg-purple-50",
    top: "20%",
    left: "55%",
  },
  {
    id: "e2",
    name: "No Feedback",
    rarity: "Epic",
    icon: "🙌",
    color: "text-purple-600",
    bg: "bg-purple-50",
    top: "75%",
    left: "35%",
  },
  {
    id: "e3",
    name: "DOOH Master",
    rarity: "Epic",
    icon: "🏙️",
    color: "text-purple-600",
    bg: "bg-purple-50",
    top: "75%",
    left: "55%",
  },

  // Legendaries (5% chance)
  {
    id: "l1",
    name: "Matrix Code",
    rarity: "Legendary",
    icon: "👾",
    color: "text-amber-600",
    bg: "bg-amber-50",
    top: "55%",
    left: "6%",
  },
  {
    id: "l2",
    name: "Cannes Lion",
    rarity: "Legendary",
    icon: "🦁",
    color: "text-amber-600",
    bg: "bg-amber-50",
    top: "55%",
    left: "86%",
  },
];

export default function XYiGotchi({ wrikeData }) {
  const [currentUser, setCurrentUser] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("wrike_personal_token");
    if (token && !currentUser) {
      fetch("https://www.wrike.com/api/v4/contacts?me=true", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((json) => {
          if (json.data && json.data.length > 0) {
            setCurrentUser(json.data[0].firstName);
          }
        })
        .catch(() => {});
    }
  }, [currentUser]);

  // Derived Progression Stats (Based purely on Wrike data)
  const completedTasksCount = React.useMemo(() => {
    if (!wrikeData || !currentUser) return 0;
    return wrikeData.filter(
      (t) =>
        t.assignees &&
        t.assignees.includes(currentUser) &&
        (t.status === "Completed" || t.status === "Delivered")
    ).length;
  }, [wrikeData, currentUser]);

  // V4 Save State (Tracks Inventory and Opened Drops)
  const [studioState, setStudioState] = useState(() => {
    const saved = localStorage.getItem("xyistudio_save_v4");
    return saved
      ? JSON.parse(saved)
      : {
          claimedDrops: 0,
          inventory: [], // Now allows duplicates e.g. ["c1", "c1", "r2"]
        };
  });

  useEffect(() => {
    localStorage.setItem("xyistudio_save_v4", JSON.stringify(studioState));
  }, [studioState]);

  // Drop Token Math
  const DELIVERIES_PER_UNLOCK = 4;
  const totalEarnedDrops = Math.floor(
    completedTasksCount / DELIVERIES_PER_UNLOCK
  );
  const availableDrops = Math.max(
    0,
    totalEarnedDrops - studioState.claimedDrops
  );

  const deliveriesTowardsNext = completedTasksCount % DELIVERIES_PER_UNLOCK;
  const progressPercent = (deliveriesTowardsNext / DELIVERIES_PER_UNLOCK) * 100;

  // RNG Animation State
  const [isOpening, setIsOpening] = useState(false);
  const [packReward, setPackReward] = useState(null);

  const handleRevealDrop = () => {
    if (availableDrops <= 0 || isOpening) return;

    setIsOpening(true);
    setPackReward(null);

    // Gacha Animation Delay
    setTimeout(() => {
      const roll = Math.random() * 100;
      let rarityPool = "Common";

      if (roll > 95) rarityPool = "Legendary";
      else if (roll > 80) rarityPool = "Epic";
      else if (roll > 50) rarityPool = "Rare";

      const possibleStickers = STICKER_DB.filter(
        (s) => s.rarity === rarityPool
      );
      const wonSticker =
        possibleStickers[Math.floor(Math.random() * possibleStickers.length)];

      const isDuplicate = studioState.inventory.includes(wonSticker.id);

      // Save the pull
      setStudioState((prev) => ({
        ...prev,
        claimedDrops: prev.claimedDrops + 1,
        inventory: [...prev.inventory, wonSticker.id],
      }));

      // Show result
      setPackReward({
        name: wonSticker.name,
        desc: isDuplicate
          ? "Duplicate! Stacked in your vault."
          : `NEW ${wonSticker.rarity.toUpperCase()} UNLOCK!`,
        icon: wonSticker.icon,
        color: wonSticker.color,
        bg: wonSticker.bg,
        isNew: !isDuplicate,
      });

      setIsOpening(false);
    }, 1500);
  };

  // Space Level based on total deliveries
  const getSpaceTheme = () => {
    if (completedTasksCount >= 35) {
      return {
        level: 3,
        classes:
          "bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-900 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]",
        title: "Master Lab",
        iconColor: "text-white/10",
      };
    }
    if (completedTasksCount >= 15) {
      return {
        level: 2,
        classes:
          "bg-gradient-to-tr from-[#12a0e1]/10 to-[#1cc1a5]/10 shadow-inner",
        title: "Motion Studio",
        iconColor: "text-slate-300",
      };
    }
    return {
      level: 1,
      classes: "bg-slate-50 shadow-inner border-[#dce4ec]",
      title: "Creative Corner",
      iconColor: "text-slate-200",
    };
  };

  const theme = getSpaceTheme();

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-8 space-y-6 pb-16">
      <header className="bg-white shadow-sm border border-[#dce4ec] rounded-[2rem] p-6 sm:px-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative overflow-hidden">
        <div className="flex items-center gap-4 relative z-10">
          <div className="bg-gradient-to-br from-[#12a0e1] to-[#1cc1a5] p-3.5 rounded-2xl text-white shadow-lg shadow-[#12a0e1]/20">
            <Monitor className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[#122027]">
              Studio Tracker
            </h1>
            <p className="text-[#768994] text-sm font-medium mt-0.5">
              Your space evolves automatically as you deliver Wrike tasks.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-slate-50 px-5 py-3 rounded-2xl border border-slate-200 w-full md:w-auto relative z-10">
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#768994]">
              Total Deliveries
            </p>
            <p className="text-2xl font-black text-[#1cc1a5]">
              {completedTasksCount}{" "}
              <Trophy className="w-4 h-4 inline pb-1 text-[#1cc1a5]" />
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* THE ROOM */}
        <div
          className={`lg:col-span-2 rounded-[2.5rem] border h-[500px] md:h-[700px] relative overflow-hidden flex flex-col items-center justify-center transition-all duration-1000 ${theme.classes}`}
        >
          <div className="absolute top-6 left-6 bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl border border-white/30 flex items-center gap-2 z-20 shadow-sm">
            <Star
              className={`w-5 h-5 ${
                theme.level === 3 ? "text-yellow-400" : "text-slate-500"
              }`}
            />
            <span className="font-black text-slate-500 drop-shadow-md tracking-wider">
              {theme.title.toUpperCase()}
            </span>
          </div>

          {/* Background Monitor Placeholder */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <Monitor
              className={`w-64 h-64 transition-colors duration-1000 ${theme.iconColor}`}
            />
          </div>

          {/* Render UNIQUE Unlocked Stickers in the Room */}
          {[...new Set(studioState.inventory)].map((stickerId, index) => {
            const sticker = STICKER_DB.find((s) => s.id === stickerId);
            if (!sticker) return null;
            return (
              <div
                key={sticker.id}
                className="absolute text-4xl animate-bounce hover:scale-125 transition-transform cursor-pointer drop-shadow-lg z-10 opacity-90 hover:opacity-100"
                style={{
                  top: sticker.top,
                  left: sticker.left,
                  animationDelay: `${index * 0.2}s`,
                }}
                title={sticker.name}
              >
                {sticker.icon}
              </div>
            );
          })}
        </div>

        {/* PROGRESS & COLLECTION VAULT */}
        <div className="bg-white rounded-[2.5rem] border border-[#dce4ec] p-6 sm:p-8 shadow-xl shadow-slate-200/40 flex flex-col gap-6 h-[500px] md:h-[700px]">
          {/* Milestone Tracker */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-black text-[#122027] flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" /> Earn Artifacts
              </h3>
            </div>

            <div className="bg-slate-50 border border-[#dce4ec] rounded-2xl p-5 relative overflow-hidden mb-4">
              <div className="flex justify-between text-xs font-black text-[#768994] uppercase tracking-wider mb-3">
                <span>
                  {deliveriesTowardsNext} / {DELIVERIES_PER_UNLOCK} Deliveries
                </span>
                <span className="text-purple-600 flex items-center gap-1">
                  Drop Progress
                </span>
              </div>
              <div className="h-4 bg-slate-200 rounded-full overflow-hidden border border-slate-300 shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-500 transition-all duration-1000 ease-out"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>

            {/* RNG Unpack Button */}
            <button
              onClick={handleRevealDrop}
              disabled={availableDrops <= 0 || isOpening}
              className={`w-full relative overflow-hidden group rounded-2xl py-4 font-black text-white transition-all border border-white/20 shadow-lg ${
                availableDrops > 0 && !isOpening
                  ? "bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600 hover:opacity-90 shadow-purple-500/30 active:scale-95"
                  : "bg-slate-300 text-slate-500 shadow-none cursor-not-allowed"
              }`}
            >
              {isOpening ? (
                <span className="flex items-center justify-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin" /> Unpacking...
                </span>
              ) : availableDrops > 0 ? (
                <span className="flex items-center justify-center gap-2 relative z-10">
                  <PackageOpen className="w-5 h-5 group-hover:-translate-y-1 transition-transform" />
                  Reveal Asset Drop ({availableDrops} Available)
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> All Caught Up
                </span>
              )}
              {availableDrops > 0 && (
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 pointer-events-none"></div>
              )}
            </button>

            {/* Reward Reveal */}
            {packReward && !isOpening && (
              <div
                className={`mt-3 p-4 border rounded-2xl text-center animate-in zoom-in duration-300 ${packReward.bg}`}
              >
                <div className="text-3xl mb-1 animate-bounce">
                  {packReward.icon}
                </div>
                <div className="font-bold text-[#122027] text-sm leading-tight">
                  {packReward.name}
                </div>
                <div
                  className={`text-[10px] font-black uppercase mt-1 ${packReward.color}`}
                >
                  {packReward.desc}
                </div>
              </div>
            )}
          </div>

          <hr className="border-slate-100" />

          {/* Asset Vault Grid */}
          <div className="flex-1  custom-scrollbar pr-2">
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-white z-10">
              <h3 className="text-sm font-black text-[#122027] uppercase tracking-widest">
                Asset Vault
              </h3>
              <span className="text-xs font-bold bg-[#1cc1a5]/10 text-[#1cc1a5] px-2.5 py-1 rounded-lg">
                {[...new Set(studioState.inventory)].length} /{" "}
                {STICKER_DB.length} Found
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-6 pt-6">
              {STICKER_DB.map((sticker) => {
                const ownedCount = studioState.inventory.filter(
                  (id) => id === sticker.id
                ).length;
                const isOwned = ownedCount > 0;

                return (
                  <div
                    key={sticker.id}
                    className={`relative rounded-2xl border flex flex-col items-center justify-center p-2 transition-all ${
                      isOwned
                        ? `${sticker.bg} border-${
                            sticker.color.split("-")[1]
                          }-200 shadow-sm hover:scale-105`
                        : "bg-slate-50 border-slate-200 opacity-50 grayscale"
                    }`}
                  >
                    {/* Duplicate Counter Badge */}
                    {ownedCount > 1 && (
                      <span className="absolute -top-2 -right-2 bg-[#122027] text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full shadow-md z-10 animate-in zoom-in">
                        x{ownedCount}
                      </span>
                    )}

                    <div className="text-3xl mb-1 mt-1" title={sticker.rarity}>
                      {isOwned ? sticker.icon : "🔒"}
                    </div>
                    <div
                      className={`text-[9px] font-black leading-tight text-center px-1 pb-1 ${
                        isOwned ? sticker.color : "text-slate-400"
                      }`}
                    >
                      {isOwned ? sticker.name : "Locked"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
