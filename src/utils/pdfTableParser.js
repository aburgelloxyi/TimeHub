import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const TARGET_COLS = [
  { key: "mediaSiteName", match: /media.{0,10}site/i },
  { key: "pixelWidth",    match: /pixel.{0,30}width/i },
  { key: "pixelHeight",   match: /pixel.{0,30}height/i },
  { key: "duration",      match: /\bduration\b/i },
  { key: "soundReq",      match: /\bsound\b/i },
  { key: "fileSize",      match: /file.{0,20}size/i },
  { key: "bitRate",       match: /bit.{0,10}rate/i },
  { key: "specificVideo", match: /specific.{0,30}video/i },
];

// How many rows to treat as potential header area
const HEADER_ROWS = 20;

function groupIntoRows(items, tolerance = 4) {
  const rowMap = new Map();
  items.forEach(item => {
    const y = item.transform[5];
    let matched = null;
    for (const [ry] of rowMap) {
      if (Math.abs(ry - y) <= tolerance) { matched = ry; break; }
    }
    const key = matched ?? y;
    if (!rowMap.has(key)) rowMap.set(key, []);
    rowMap.get(key).push({ str: item.str.trim(), x: item.transform[4] });
  });
  return [...rowMap.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, cells]) => cells.filter(c => c.str).sort((a, b) => a.x - b.x));
}

function findDataStart(rows) {
  for (let i = 0; i < rows.length; i++) {
    const n = rows[i].filter(c => /^\d+(\.\d+)?$/.test(c.str)).length;
    if (n >= 2) return i;
  }
  return Math.floor(rows.length / 2);
}

/**
 * Build column map by scanning only the header rows (first HEADER_ROWS rows).
 *
 * Using only header rows means data values never pollute cluster text,
 * so the regex matches happen against clean column header strings.
 *
 * x-tolerance 8pt: tight enough to keep adjacent columns separate
 * (columns are typically 30-80pt apart), loose enough to join
 * multi-line headers like "PIXEL" (row A) + "WIDTH" (row B) at same x.
 *
 * xEnd = next cluster's x (from ALL header clusters, not just matched ones),
 * so non-target columns like FRAME RATE act as fences for data assignment.
 */
function buildColMap(rows) {
  const headerCells = rows.slice(0, HEADER_ROWS).flat();

  const clusters = [];
  headerCells.forEach(cell => {
    const ex = clusters.find(c => Math.abs(c.x - cell.x) < 8);
    if (ex) ex.strs.push(cell.str);
    else clusters.push({ x: cell.x, strs: [cell.str] });
  });

  clusters.sort((a, b) => a.x - b.x);
  clusters.forEach((c, i) => {
    c.xEnd = i < clusters.length - 1 ? clusters[i + 1].x : Infinity;
    c.text = [...new Set(c.strs)].join(" ");
  });

  console.log(
    "[PDF] header clusters:",
    clusters.map(c => ({ x: Math.round(c.x), text: c.text.slice(0, 60) }))
  );

  const colMap = [];
  TARGET_COLS.forEach(tc => {
    // Primary: whole-cluster match
    let hit = clusters.find(c => tc.match.test(c.text));

    // Secondary: adjacent-cluster pair (horizontal split header)
    if (!hit) {
      for (let i = 0; i < clusters.length - 1; i++) {
        if (tc.match.test(clusters[i].text + " " + clusters[i + 1].text)) {
          hit = clusters[i];
          break;
        }
      }
    }

    if (hit) {
      console.log(`[PDF] ✓ ${tc.key}  x=${Math.round(hit.x)}  "${hit.text.slice(0, 50)}"`);
      colMap.push({ key: tc.key, x: hit.x, xEnd: hit.xEnd });
    } else {
      console.warn(`[PDF] ✗ ${tc.key}  — no match`);
    }
  });

  return colMap;
}

/**
 * Assign a data row's cells to target columns using x-range fencing.
 *
 * Left boundary:  col.x - tol   (allow slightly left-aligned data)
 * Right boundary: col.xEnd      (exact start of next header cluster — correct fence)
 *
 * Previously used col.xEnd - tol on the right, which incorrectly shrank
 * the window and caused cells near the right edge to miss their column.
 */
function assignCells(row, colMap, tol = 12) {
  const record = {};
  row.forEach(cell => {
    const col = colMap.find(c => cell.x >= c.x - tol && cell.x < c.xEnd);
    if (col) {
      record[col.key] = record[col.key]
        ? record[col.key] + " " + cell.str
        : cell.str;
    }
  });
  return record;
}

export async function parsePdfDeliverySpecs(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const allItems = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    content.items.forEach(item => {
      if (item.str?.trim()) allItems.push(item);
    });
  }

  if (!allItems.length) return null;

  const rows = groupIntoRows(allItems);
  const colMap = buildColMap(rows);
  if (!colMap.length) return null;

  const dataStart = findDataStart(rows);
  console.log(
    `[PDF] dataStart=${dataStart}  first data row:`,
    rows[dataStart]?.map(c => `${Math.round(c.x)}:"${c.str}"`)
  );

  return rows
    .slice(dataStart)
    .map(row => assignCells(row, colMap))
    .filter(record => Object.values(record).some(v => v?.trim()));
}
