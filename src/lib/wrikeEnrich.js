import { FILM_MAPPINGS, MOTION_TEAM_NAME_MAP } from "../constants.js";

// ---------------------------------------------------------------------------
// Parse a Wrike task's HTML description into structured fields
// ---------------------------------------------------------------------------
export function parseWrikeData(htmlString) {
  if (!htmlString) return { tableHtml: "", notesText: "", extractedPathData: "" };

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
}

// ---------------------------------------------------------------------------
// Climb the folder tree to find the film name for a task
// ---------------------------------------------------------------------------
export function getFilmName(task, folderDictionary, extractedPath = "") {
  if (!task.title) return "Unknown Project";

  // 1. Tree-climb: find "DIGITAL" folder, then take its parent as film name
  if (task.parentIds?.length > 0) {
    let queue = [...task.parentIds];
    let visited = new Set(queue);
    let foundFilmName = null;

    while (queue.length > 0) {
      const currentId = queue.shift();
      const currentFolder = folderDictionary[currentId];
      if (!currentFolder) continue;

      if (currentFolder.title?.trim().toUpperCase() === "DIGITAL") {
        for (const pid of currentFolder.parentIds || []) {
          const pName = folderDictionary[pid]?.title || "";
          const pUpper = pName.toUpperCase();
          if (
            pUpper &&
            !pUpper.includes("UNIVERSAL") &&
            !pUpper.includes("PARAMOUNT") &&
            !pUpper.includes("SONY") &&
            !pUpper.includes("MOTION") &&
            !pUpper.match(/^20\d{2}/) &&
            !pUpper.includes("ARCHIVE")
          ) {
            foundFilmName = pName;
            break;
          }
        }
        if (foundFilmName) break;
      }

      for (const pid of currentFolder.parentIds || []) {
        if (!visited.has(pid)) {
          visited.add(pid);
          queue.push(pid);
        }
      }
    }

    if (foundFilmName) {
      return foundFilmName
        .replace(/[_|-]/g, " ")
        .trim()
        .toLowerCase()
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }

  // 2. Path fallback
  if (extractedPath) {
    const parts = extractedPath.split("/");
    const digIdx = parts.findIndex((p) => p.toUpperCase() === "DIGITAL");
    if (digIdx > 0) {
      let back = digIdx - 1;
      while (
        back > 0 &&
        (parts[back].toUpperCase().includes("UNIVERSAL") ||
          parts[back].toUpperCase().includes("PARAMOUNT") ||
          parts[back].toUpperCase().includes("MOTION") ||
          parts[back].match(/^20\d{2}/) ||
          parts[back].toUpperCase().includes("ARCHIVE"))
      ) back--;
      if (back > 0 && parts[back].trim()) {
        return decodeURIComponent(parts[back])
          .replace(/[_|-]/g, " ")
          .trim()
          .toLowerCase()
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
      }
    }
  }

  // 3. Dictionary / prefix fallback
  const rawPrefix = task.title.split(/[_|-]/)[0].trim();
  const lookupKey = rawPrefix.toUpperCase();
  if (FILM_MAPPINGS?.[lookupKey]) return FILM_MAPPINGS[lookupKey];

  return rawPrefix
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Filter raw tasks down to Motion team relevance
// ---------------------------------------------------------------------------
export function filterToMotionTeam(tasks, folderDictionary, contactDictionary) {
  const tasksById = new Map(tasks.map((t) => [t.id, t]));

  return tasks.filter((task) => {
    if (!task.title) return false;
    const upper = task.title.toUpperCase();

    const matchesKeywords =
      upper.includes("DOOH") || upper.includes("DINTH") || upper.includes("MATRIX");
    const matchesAssignee = task.responsibleIds?.some(
      (id) => contactDictionary[id] && MOTION_TEAM_NAME_MAP[contactDictionary[id]]
    );
    const matchesDigital = task.parentIds?.some((pid) =>
      folderDictionary[pid]?.title?.toUpperCase().includes("DIGITAL")
    );

    if (matchesKeywords || matchesDigital || matchesAssignee) return true;

    return task.subTaskIds?.some((subId) => {
      const sub = tasksById.get(subId);
      if (!sub?.title) return false;
      const subUpper = sub.title.toUpperCase();
      return (
        subUpper.includes("DOOH") ||
        subUpper.includes("DINTH") ||
        subUpper.includes("MATRIX") ||
        sub.parentIds?.some((pid) => folderDictionary[pid]?.title?.toUpperCase().includes("DIGITAL")) ||
        sub.responsibleIds?.some((id) => contactDictionary[id] && MOTION_TEAM_NAME_MAP[contactDictionary[id]])
      );
    }) ?? false;
  });
}

// ---------------------------------------------------------------------------
// Enrich raw Wrike tasks with computed fields (film name, paths, status, etc.)
// ---------------------------------------------------------------------------
export function enrichTasks(rawTasks, folderDictionary, contactDictionary, statusDictionary) {
  return rawTasks.map((task) => {
    const parsed = parseWrikeData(task.description);
    delete task.description;

    return {
      ...task,
      extractedPathData: parsed.extractedPathData,
      tableHtml: parsed.tableHtml,
      notesText: parsed.notesText,
      projectName: getFilmName(task, folderDictionary, parsed.extractedPathData),
      assignees: (task.responsibleIds || [])
        .map((id) => contactDictionary[id] || "User")
        .join(", "),
      customStatusName: task.customStatusId
        ? statusDictionary[task.customStatusId] || task.status
        : task.status,
      dueDate: task.dates?.due ?? "No Due Date",
    };
  });
}

// ---------------------------------------------------------------------------
// Fetch missing parent folder IDs from Wrike API (archives, etc.)
// ---------------------------------------------------------------------------
export async function hydrateMissingFolders(tasks, folderDictionary, token) {
  let missing = new Set();
  tasks.forEach((t) => t.parentIds?.forEach((pid) => {
    if (!folderDictionary[pid]) missing.add(pid);
  }));

  let loopCount = 0;
  while (missing.size > 0 && loopCount < 3) {
    loopCount++;
    const ids = [...missing];
    missing.clear();
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      try {
        const res = await fetch(`https://www.wrike.com/api/v4/folders/${chunk.join(",")}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          (await res.json()).data?.forEach((f) => {
            folderDictionary[f.id] = f;
            f.parentIds?.forEach((pid) => {
              if (!folderDictionary[pid]) missing.add(pid);
            });
          });
        }
      } catch (e) {
        console.error("Folder hydration chunk failed", e);
      }
    }
  }

  return folderDictionary;
}
