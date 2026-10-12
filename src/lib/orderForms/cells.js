// Cell addresses, as a spreadsheet writes them.

// 0 → "A", 25 → "Z", 26 → "AA".
export function columnLetter(index) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// Zero-based row and column → "C5".
export const a1 = (row, col) => `${columnLetter(col)}${row + 1}`;

// The range of one cell on a tab, as the Sheets API wants it.
export const cellRange = (tab, cell) => `'${tab.replace(/'/g, "''")}'!${cell}`;
