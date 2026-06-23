import React, { useState } from "react";
import {
  Download,
  RefreshCw,
  Server,
  AlertCircle,
  FileJson,
  Key,
  Search,
  ArrowUpDown,
  Filter,
} from "lucide-react";
import { FILM_MAPPINGS } from "../constants.js";

// --- MOTION TEAM MAPPING ---
const NAME_MAP = {
  "Antonio Burgello": "Antonio 🐍",
  "Antonio Burgello 🐍": "Antonio 🐍",
  "Aaron Gunasingham": "Aaron 🦉",
  "Aaron Gunasingham 🦉": "Aaron 🦉",
  "Jacqui Harrington": "Jacqui 🐝",
  "Jacqui Harrington 🐝": "Jacqui 🐝",
  "Maria Cerrato": "Maria 🦊",
  "Maria Cerrato 🦊": "Maria 🦊",
  Nicholas: "Nicholas 😎",
  "Nicholas 😎": "Nicholas 😎",
  "Trott ⚡️": "Luke Trott 🐴",
  "Luke Trott": "Luke Trott 🐴",
  "Luke Trott 🐴": "Luke Trott 🐴",
  Turk: "Turk 👻",
  "Turk 👻": "Turk 👻",
};

export default function WrikeTest({
  wrikeData,
  setWrikeData,
  setFolderDictionary,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [apiToken, setApiToken] = useState(() => {
    return localStorage.getItem("wrike_personal_token") || "";
  });

  const handleTokenChange = (e) => {
    const newVal = e.target.value;
    setApiToken(newVal);
    localStorage.setItem("wrike_personal_token", newVal);
  };

  const fetchWrikeData = async () => {
    if (!apiToken.trim()) {
      setError("Please enter your Wrike Permanent Token to fetch data.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. DATE SETUP (2 Months)
      const lookbackDate = new Date();
      lookbackDate.setMonth(lookbackDate.getMonth() - 2);
      const formattedDate = lookbackDate.toISOString().split(".")[0] + "Z";
      const dateFilter = encodeURIComponent(`{"start":"${formattedDate}"}`);

      // THE REAL FIX FOR WRIKE URLS: Hardcoded brackets, NO double quotes, NO JSON.stringify.
      const fieldsFilter = encodeURIComponent(
        "[customFields,parentIds,responsibleIds,subTaskIds,description]"
      );

      // ==========================================
      // STAGE 1: FETCH BASE METADATA
      // ==========================================
      const [foldersRes, contactsRes, workflowsRes] = await Promise.all([
        fetch("https://www.wrike.com/api/v4/folders", {
          headers: { Authorization: `Bearer ${apiToken}` },
        }),
        fetch("https://www.wrike.com/api/v4/contacts", {
          headers: { Authorization: `Bearer ${apiToken}` },
        }),
        fetch("https://www.wrike.com/api/v4/workflows", {
          headers: { Authorization: `Bearer ${apiToken}` },
        }),
      ]);

      if (!foldersRes.ok)
        throw new Error("API Fetch failed. Check your token.");

      const folderDictionary = {};
      (await foldersRes.json()).data.forEach((item) => {
        folderDictionary[item.id] = item;
      });

      const contactDictionary = {};
      (await contactsRes.json()).data.forEach((u) => {
        contactDictionary[u.id] = `${u.firstName || ""} ${
          u.lastName || ""
        }`.trim();
      });

      const statusDictionary = {};
      (await workflowsRes.json()).data.forEach((workflow) => {
        if (workflow.customStatuses) {
          workflow.customStatuses.forEach((status) => {
            statusDictionary[status.id] = status.name;
          });
        }
      });

      // ==========================================
      // STAGE 2: FETCH ALL TASKS (Single Pass)
      // ==========================================
      let rawTasks = [];
      let nextPageToken = null;
      let hasMore = true;

      while (hasMore) {
        let url = `https://www.wrike.com/api/v4/tasks?fields=${fieldsFilter}&updatedDate=${dateFilter}&pageSize=1000`;
        if (nextPageToken) url += `&nextPageToken=${nextPageToken}`;

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${apiToken}` },
        });

        if (!response.ok) throw new Error("Failed to fetch tasks.");

        const json = await response.json();
        rawTasks = [...rawTasks, ...(json.data || [])];
        nextPageToken = json.nextPageToken;
        hasMore = !!nextPageToken;
      }

      // ==========================================
      // STAGE 3: HYDRATE MISSING ARCHIVE FOLDERS
      // ==========================================
      // Wrike hides archives. We scan our fetched tasks, find missing parent IDs, and fetch them explicitly.
      let missingFolderIds = new Set();
      rawTasks.forEach((task) => {
        task.parentIds?.forEach((pid) => {
          if (!folderDictionary[pid]) missingFolderIds.add(pid);
        });
      });

      // Fetch missing folders in safe chunks of 50
      let loopCount = 0;
      while (missingFolderIds.size > 0 && loopCount < 3) {
        loopCount++;
        const idsToFetch = Array.from(missingFolderIds);
        missingFolderIds.clear();

        for (let i = 0; i < idsToFetch.length; i += 50) {
          const chunk = idsToFetch.slice(i, i + 50);
          try {
            const fUrl = `https://www.wrike.com/api/v4/folders/${chunk.join(
              ","
            )}`;
            const fRes = await fetch(fUrl, {
              headers: { Authorization: `Bearer ${apiToken}` },
            });
            if (fRes.ok) {
              (await fRes.json()).data?.forEach((f) => {
                folderDictionary[f.id] = f;
                // If this unarchived folder has a parent we also don't know, queue it up
                f.parentIds?.forEach((pid) => {
                  if (!folderDictionary[pid]) missingFolderIds.add(pid);
                });
              });
            }
          } catch (e) {
            console.error("Folder hydration chunk failed", e);
          }
        }
      }

      if (setFolderDictionary) setFolderDictionary(folderDictionary);

      // ==========================================
      // STAGE 4: FILTER DOWN TO MOTION TEAM TASKS
      // ==========================================
      const tasksById = new Map();
      rawTasks.forEach((t) => tasksById.set(t.id, t));

      const relevantTasks = rawTasks.filter((task) => {
        if (!task.title) return false;
        const upperTitle = task.title.toUpperCase();

        const matchesKeywords =
          upperTitle.includes("DOOH") ||
          upperTitle.includes("DINTH") ||
          upperTitle.includes("MATRIX");
        const matchesAssignee = task.responsibleIds?.some(
          (id) => contactDictionary[id] && NAME_MAP[contactDictionary[id]]
        );

        let matchesDigitalTag = false;
        if (task.parentIds) {
          matchesDigitalTag = task.parentIds.some((pId) =>
            folderDictionary[pId]?.title?.toUpperCase().includes("DIGITAL")
          );
        }

        if (matchesKeywords || matchesDigitalTag || matchesAssignee)
          return true;

        if (task.subTaskIds && task.subTaskIds.length > 0) {
          return task.subTaskIds.some((subId) => {
            const subTask = tasksById.get(subId);
            if (!subTask || !subTask.title) return false;

            const subUpper = subTask.title.toUpperCase();
            const subMatchesKeywords =
              subUpper.includes("DOOH") ||
              subUpper.includes("DINTH") ||
              subUpper.includes("MATRIX");
            const subMatchesAssignee = subTask.responsibleIds?.some(
              (id) => contactDictionary[id] && NAME_MAP[contactDictionary[id]]
            );
            const subMatchesDigital = subTask.parentIds?.some((pId) =>
              folderDictionary[pId]?.title?.toUpperCase().includes("DIGITAL")
            );

            return (
              subMatchesKeywords || subMatchesDigital || subMatchesAssignee
            );
          });
        }
        return false;
      });

      // ==========================================
      // STAGE 5: THE OMNI-CLIMBER & PARSER
      // ==========================================
      const getFilmName = (task, extractedPath = "") => {
        if (!task.title) return "Unknown Project";

        // 1. OMNI-CLIMBER: Crawls up parents, looks for "Digital", grabs the real film name
        if (task.parentIds && task.parentIds.length > 0) {
          let queue = [...task.parentIds];
          let visited = new Set(queue);
          let foundFilmName = null;

          while (queue.length > 0) {
            let currentId = queue.shift();
            let currentFolder = folderDictionary[currentId];
            if (!currentFolder) continue;

            if (currentFolder.title?.trim().toUpperCase() === "DIGITAL") {
              let validParentName = null;
              for (const pid of currentFolder.parentIds || []) {
                const pName = folderDictionary[pid]?.title || "";
                const pUpper = pName.toUpperCase();

                // Ignore generic hubs so we get "Jurassic World", not "Universal Pictures"
                if (
                  pUpper &&
                  !pUpper.includes("UNIVERSAL") &&
                  !pUpper.includes("PARAMOUNT") &&
                  !pUpper.includes("SONY") &&
                  !pUpper.includes("MOTION") &&
                  !pUpper.match(/^20\d{2}/) &&
                  !pUpper.includes("ARCHIVE")
                ) {
                  validParentName = pName;
                  break;
                }
              }

              if (validParentName) {
                foundFilmName = validParentName;
                break;
              }
            }

            if (currentFolder.parentIds) {
              for (let pid of currentFolder.parentIds) {
                if (!visited.has(pid)) {
                  visited.add(pid);
                  queue.push(pid);
                }
              }
            }
          }

          if (foundFilmName) {
            return foundFilmName
              .replace(/[_|-]/g, " ")
              .trim()
              .toLowerCase()
              .split(" ")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ");
          }
        }

        // 2. PATH FALLBACK: If tree climbing fails, parse the /Volumes/ path
        if (extractedPath) {
          const pathParts = extractedPath.split("/");
          const digitalIndex = pathParts.findIndex(
            (p) => p.toUpperCase() === "DIGITAL"
          );

          if (digitalIndex > 0) {
            let backIndex = digitalIndex - 1;
            while (
              backIndex > 0 &&
              (pathParts[backIndex].toUpperCase().includes("UNIVERSAL") ||
                pathParts[backIndex].toUpperCase().includes("PARAMOUNT") ||
                pathParts[backIndex].toUpperCase().includes("MOTION") ||
                pathParts[backIndex].match(/^20\d{2}/) ||
                pathParts[backIndex].toUpperCase().includes("ARCHIVE"))
            ) {
              backIndex--;
            }

            if (backIndex > 0 && pathParts[backIndex].trim() !== "") {
              return decodeURIComponent(pathParts[backIndex])
                .replace(/[_|-]/g, " ")
                .trim()
                .toLowerCase()
                .split(" ")
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");
            }
          }
        }

        // 3. DICTIONARY/PREFIX FALLBACK
        const rawPrefix = task.title.split(/[_|-]/)[0].trim();
        const lookupKey = rawPrefix.toUpperCase();
        if (FILM_MAPPINGS && FILM_MAPPINGS[lookupKey])
          return FILM_MAPPINGS[lookupKey];

        return rawPrefix
          .toLowerCase()
          .split(" ")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      };

      const parseWrikeData = (htmlString) => {
        if (!htmlString)
          return { tableHtml: "", notesText: "", extractedPathData: "" };
        const tableMatch = htmlString.match(/<table[\s\S]*?<\/table>/i);
        const tableHtml = tableMatch ? tableMatch[0] : "";

        let extractedPathData = "";
        const plainText = htmlString.replace(/<[^>]*>?/gm, " ");
        const folderMatches = plainText.match(/\/Volumes\/[^\s]+/gi);
        if (folderMatches) extractedPathData = folderMatches.join(" ");

        const xyMatch = plainText.match(/(XY\d{5,6})/i);
        if (xyMatch && !extractedPathData.includes(xyMatch[1])) {
          extractedPathData += " " + xyMatch[1];
        }

        let rawText = htmlString
          .replace(/<table[\s\S]*?<\/table>/i, "")
          .replace(/<\/p>/gi, "\n\n")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<li>/gi, "• ")
          .replace(/<\/li>/gi, "\n")
          .replace(/<[^>]*>/g, "")
          .replace(/\n\s*\n\s*\n/g, "\n\n")
          .trim();
        const textArea = document.createElement("textarea");
        textArea.innerHTML = rawText;

        return {
          tableHtml,
          notesText: textArea.value,
          extractedPathData: extractedPathData.toUpperCase(),
        };
      };

      // Apply processing
      const enrichedTasks = relevantTasks.map((task) => {
        const parsedData = parseWrikeData(task.description);

        // Memory cleanup
        delete task.description;

        return {
          ...task,
          extractedPathData: parsedData.extractedPathData,
          tableHtml: parsedData.tableHtml,
          notesText: parsedData.notesText,
          projectName: getFilmName(task, parsedData.extractedPathData),
          assignees: (task.responsibleIds || [])
            .map((id) => contactDictionary[id] || "User")
            .join(", "),
          customStatusName: task.customStatusId
            ? statusDictionary[task.customStatusId] || task.status
            : task.status,
          dueDate:
            task.dates && task.dates.due ? task.dates.due : "No Due Date",
        };
      });

      setWrikeData(enrichedTasks);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!wrikeData) return;

    const dataStr = JSON.stringify(wrikeData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `Wrike_Tasks_Export_${
      new Date().toISOString().split("T")[0]
    }.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [sortConfig, setSortConfig] = useState({
    key: "createdDate",
    direction: "desc",
  });

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const processedData = React.useMemo(() => {
    if (!wrikeData) return null;
    let data = [...wrikeData];

    if (statusFilter !== "All") {
      data = data.filter((task) => task.status === statusFilter);
    }

    if (searchTerm) {
      const lowercasedTerm = searchTerm.toLowerCase();
      data = data.filter(
        (task) =>
          task.title.toLowerCase().includes(lowercasedTerm) ||
          (task.projectName &&
            task.projectName.toLowerCase().includes(lowercasedTerm)) ||
          (task.assignees &&
            task.assignees.toLowerCase().includes(lowercasedTerm)) ||
          (task.customStatusName &&
            task.customStatusName.toLowerCase().includes(lowercasedTerm))
      );
    }

    data.sort((a, b) => {
      let aVal = a[sortConfig.key] || "";
      let bVal = b[sortConfig.key] || "";

      if (sortConfig.key === "createdDate") {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      } else {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
      }

      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

    return data;
  }, [wrikeData, searchTerm, statusFilter, sortConfig]);

  return (
    <div className="min-h-screen bg-slate-100 text-[#122027] font-sans pb-12">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 pt-8 space-y-6">
        <header className="bg-white shadow-sm border border-[#dce4ec] rounded-[2rem] p-6 sm:px-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-500 p-3.5 rounded-2xl text-white shadow-lg shadow-indigo-500/20">
              <Server className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-[#122027] tracking-tight">
                Wrike API Sandbox
              </h1>
              <p className="text-[#768994] text-sm font-medium mt-0.5">
                Fetch, view, and export raw task data
              </p>
            </div>
          </div>

          <div className="flex gap-3 w-full sm:w-auto">
            <button
              onClick={fetchWrikeData}
              disabled={loading}
              className="flex items-center justify-center gap-2 bg-[#122027] hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
              {loading ? "Fetching..." : "Fetch Wrike Data"}
            </button>

            <button
              onClick={handleDownload}
              disabled={!wrikeData}
              className="flex items-center justify-center gap-2 bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 px-6 py-3 rounded-xl font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Download JSON
            </button>
          </div>
        </header>

        <div className="bg-white shadow-sm border border-[#dce4ec] rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="bg-amber-100 p-2 rounded-xl text-amber-600 shrink-0">
              <Key className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <label className="text-xs font-black text-[#122027] uppercase tracking-widest mb-1 block">
                Wrike Access Token
              </label>
              <input
                type="password"
                value={apiToken}
                onChange={handleTokenChange}
                placeholder="Paste your Permanent Token here..."
                className="w-full md:w-96 bg-slate-50 border border-[#dce4ec] text-[#122027] focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 rounded-xl px-3 py-2 text-sm outline-none shadow-sm transition-all font-mono"
              />
            </div>
          </div>
          <p className="text-xs text-[#768994] md:max-w-xs leading-relaxed">
            Your token is stored safely in your own browser's local storage. It
            is never saved to the shared code.
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-2xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-500" />
            <p className="font-bold text-sm">{error}</p>
          </div>
        )}

        {processedData ? (
          <div className="bg-white rounded-3xl border border-[#dce4ec] shadow-xl shadow-slate-200/40 overflow-hidden">
            <div className="p-5 border-b border-[#dce4ec] bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-base font-black text-[#122027] flex items-center gap-2">
                <FileJson className="w-4 h-4 text-indigo-500" /> Task Array (
                {processedData.length} items)
              </h2>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-[#768994] absolute left-3" />
                  <input
                    type="text"
                    placeholder="Search tasks..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-3 py-2 bg-white border border-[#dce4ec] rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all w-full sm:w-64"
                  />
                </div>

                <div className="relative flex items-center">
                  <Filter className="w-4 h-4 text-[#768994] absolute left-3" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="pl-9 pr-8 py-2 bg-white border border-[#dce4ec] rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer appearance-none"
                  >
                    <option value="All">All Base Statuses</option>
                    <option value="Active">Active</option>
                    <option value="Completed">Completed</option>
                    <option value="Deferred">Deferred</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[600px] overflow-y-auto scrollbar-thin">
              <table className="w-full text-left text-sm text-[#122027]">
                <thead className="bg-slate-50 text-xs uppercase text-[#768994] font-black sticky top-0 border-b border-[#dce4ec] shadow-sm z-10">
                  <tr>
                    <th className="px-6 py-4">
                      <button
                        onClick={() => handleSort("customStatusName")}
                        className="flex items-center gap-1.5 hover:text-[#122027] transition-colors"
                      >
                        Workflow / Status <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="px-6 py-4">
                      <button
                        onClick={() => handleSort("projectName")}
                        className="flex items-center gap-1.5 hover:text-[#122027] transition-colors"
                      >
                        Film / Project <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="px-6 py-4">Assignees</th>
                    <th className="px-6 py-4">
                      <button
                        onClick={() => handleSort("title")}
                        className="flex items-center gap-1.5 hover:text-[#122027] transition-colors"
                      >
                        Task Title <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="px-6 py-4">
                      <button
                        onClick={() => handleSort("createdDate")}
                        className="flex items-center gap-1.5 hover:text-[#122027] transition-colors"
                      >
                        Created <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="px-6 py-4">
                      <button
                        onClick={() => handleSort("importance")}
                        className="flex items-center gap-1.5 hover:text-[#122027] transition-colors"
                      >
                        Importance <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dce4ec]">
                  {processedData.length > 0 ? (
                    processedData.map((task) => (
                      <tr
                        key={task.id}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md border ${
                              task.status === "Completed"
                                ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                : task.status === "Active"
                                ? "bg-blue-50 text-blue-600 border-blue-100"
                                : "bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                          >
                            {task.customStatusName}
                          </span>
                        </td>
                        <td
                          className="px-6 py-4 font-bold text-indigo-600 truncate max-w-[200px]"
                          title={task.projectName}
                        >
                          {task.projectName}
                        </td>

                        <td className="px-6 py-4 text-[#768994] font-medium truncate max-w-[150px]">
                          {task.assignees}
                        </td>

                        <td
                          className="px-6 py-4 font-bold max-w-md truncate"
                          title={task.title}
                        >
                          <a
                            href={task.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-indigo-500 hover:underline decoration-2 underline-offset-2 transition-colors cursor-pointer"
                          >
                            {task.title}
                          </a>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-[#768994] font-medium">
                          {new Date(task.createdDate).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 capitalize text-[#768994]">
                          {task.importance}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan="6"
                        className="px-6 py-12 text-center text-[#768994] font-medium"
                      >
                        No tasks match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-dashed border-[#dce4ec] h-64 flex flex-col items-center justify-center text-[#768994] gap-3">
            <Server className="w-10 h-10 opacity-20" />
            <p className="font-bold text-sm">
              Hit fetch to grab your live Wrike data
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
