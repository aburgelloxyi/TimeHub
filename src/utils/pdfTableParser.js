import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const TARGET_COLS = [
  { key: "mediaSiteName", match: /media.{0,10}site/i },
  { key: "pixelWidth",    match: /(pixel.{0,30}width|width.{0,10}pixel)/i },
  { key: "pixelHeight",   match: /(pixel.{0,30}height|height.{0,10}pixel)/i },
  { key: "duration",      match: /\bduration\b/i },
  { key: "soundReq",      match: /\bsound\b/i },
  { key: "fileSize",      match: /file.{0,20}size/i },
  { key: "bitRate",       match: /bit.{0,10}rate/i },
  { key: "specificVideo", match: /specific.{0,30}video/i },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function groupIntoRows(items, yTol = 4) {
  const map = new Map();
  items.forEach(item => {
    const y = item.transform[5];
    let key = null;
    for (const [ky] of map) { if (Math.abs(ky - y) <= yTol) { key = ky; break; } }
    if (key === null) key = y;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ str: item.str.trim(), x: item.transform[4] });
  });
  return [...map.entries()]
    .sort(([a], [b]) => b - a)          // descending y = top of page first
    .map(([, cells]) => cells.filter(c => c.str).sort((a, b) => a.x - b.x));
}

/**
 * Build x-clusters from a flat list of cells using a given tolerance.
 * Each cluster accumulates every cell whose x is within `xTol` of the cluster's
 * representative x. Returns clusters sorted left→right with xEnd set to the
 * next cluster's x (Infinity for the last).
 */
function buildXClusters(cells, xTol = 8) {
  const clusters = [];
  cells.forEach(cell => {
    const ex = clusters.find(c => Math.abs(c.x - cell.x) < xTol);
    if (ex) ex.strs.push(cell.str);
    else clusters.push({ x: cell.x, strs: [cell.str] });
  });
  clusters.sort((a, b) => a.x - b.x);
  clusters.forEach((c, i) => {
    c.xEnd = i < clusters.length - 1 ? clusters[i + 1].x : Infinity;
    c.text = [...new Set(c.strs)].join(" ");
  });
  return clusters;
}

// ─── column detection ─────────────────────────────────────────────────────────

/**
 * Scan only header rows (first HEADER_ROWS rows) to detect column positions.
 *
 * Key design decisions:
 * - Header-only scope: data cell values never pollute the cluster text, so regex
 *   matches happen against clean column-header strings only.
 * - Tight 8pt x-tolerance: keeps adjacent columns (typically 30-80pt apart)
 *   separate while joining multi-line headers ("PIXEL" row A, "WIDTH" row B)
 *   that appear at the same x position.
 * - ALL x-positions as fences: non-target columns (e.g. Frame Rate, Canvas
 *   Rotation) create cluster boundaries, so their data can't bleed into an
 *   adjacent target column's x-range.
 */
const HEADER_ROWS = 20;

function detectColumns(rows) {
  const headerCells = rows.slice(0, HEADER_ROWS).flat();
  const clusters = buildXClusters(headerCells, 5);

  console.log("[PDF] header clusters:", JSON.stringify(
    clusters.map(c => ({ x: Math.round(c.x), t: c.text.slice(0, 40) }))
  ));

  const colMap = [];
  TARGET_COLS.forEach(tc => {
    // Primary: match against the combined text at a single x-cluster
    let hit = clusters.find(c => tc.match.test(c.text));

    // Secondary: sliding window of up to 3 consecutive clusters
    // (handles "PIXEL" / "WIDTH" split across 2-3 separate clusters)
    if (!hit) {
      for (let i = 0; i < clusters.length - 1; i++) {
        const t2 = clusters[i].text + " " + clusters[i + 1].text;
        if (tc.match.test(t2)) { hit = clusters[i]; break; }
        if (i + 2 < clusters.length) {
          const t3 = t2 + " " + clusters[i + 2].text;
          if (tc.match.test(t3)) { hit = clusters[i]; break; }
        }
      }
    }

    if (hit) {
      let xEnd = hit.xEnd;
      // If this column's span is unusually narrow (≤8pt), a label cluster is
      // acting as a false fence. Skip it and use the next real cluster boundary.
      if (xEnd - hit.x <= 8) {
        const next = clusters.find(c => c.x > xEnd);
        if (next) xEnd = next.x;
      }
      console.log(`[PDF] ✓ ${tc.key}  x=${Math.round(hit.x)} xEnd=${Math.round(xEnd)}  "${hit.text.slice(0, 40)}"`);
      colMap.push({ key: tc.key, x: hit.x, xEnd });
    } else {
      console.warn(`[PDF] ✗ ${tc.key}`);
    }
  });

  // When two adjacent target columns share an exact boundary (col A's xEnd == col B's x),
  // data from col B can appear 1pt left of B's header and land in A instead.
  // Reduce xEnd by 1 for any column whose xEnd points exactly at another target col's x.
  const targetXSet = new Set(colMap.map(c => c.x));
  colMap.forEach(col => { if (targetXSet.has(col.xEnd)) col.xEnd -= 1; });

  return colMap;
}

// ─── data start detection ────────────────────────────────────────────────────

function findDataStart(rows, colMap) {
  // First row where at least one target column's x-range contains a pure number
  const numericKeys = ["pixelWidth", "pixelHeight", "duration"];
  const numCols = numericKeys.map(k => colMap.find(c => c.key === k)).filter(Boolean);

  for (let r = 0; r < rows.length; r++) {
    const hits = numCols.filter(col =>
      rows[r].some(cell =>
        /^\d+(\.\d+)?$/.test(cell.str) &&
        cell.x >= col.x - 10 && cell.x < col.xEnd
      )
    ).length;
    if (hits >= 1) return r;
  }
  return HEADER_ROWS;
}

// ─── cell assignment ──────────────────────────────────────────────────────────

/**
 * Assign data row cells to target columns via x-range fencing.
 *
 * Left boundary: max(col.x - tol, prevCol.xEnd) — the tolerance can't reach
 * past the previous column's right fence, eliminating cross-column bleed while
 * still allowing a small offset within the column's own space.
 */
function assignCells(row, colMap, tol = 8) {
  const sorted = [...colMap].sort((a, b) => a.x - b.x);
  sorted.forEach((col, i) => {
    col.xLeft = i > 0
      ? Math.max(col.x - tol, sorted[i - 1].xEnd)
      : col.x - tol;
  });
  const record = {};
  row.forEach(cell => {
    const col = sorted.find(c => cell.x >= c.xLeft && cell.x < c.xEnd);
    if (col) {
      record[col.key] = record[col.key]
        ? record[col.key] + " " + cell.str
        : cell.str;
    }
  });
  return record;
}

// ─── public API ───────────────────────────────────────────────────────────────

export async function parsePdfDeliverySpecs(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const allItems = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    content.items.forEach(item => { if (item.str?.trim()) allItems.push(item); });
  }

  if (!allItems.length) return null;

  const rows = groupIntoRows(allItems);
  const colMap = detectColumns(rows);
  if (!colMap.length) return null;

  const dataStart = findDataStart(rows, colMap);
  console.log(`[PDF] dataStart=${dataStart}`, rows[dataStart]?.map(c => `${Math.round(c.x)}:"${c.str}"`));

  const results = rows
    .slice(dataStart)
    .map(row => assignCells(row, colMap))
    .filter(rec => Object.values(rec).some(v => v?.trim()));

  return results.length ? results : null;
}
