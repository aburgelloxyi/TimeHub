// A market's code as the studio writes it in names: MAGI's two-letter form, never the three letters the Drive folders
// carry ("Denmark (DEN)" is DK). A code or name MAGI doesn't pair is left as it is (CIS, LAS, UAE).

import { MAGI_TWO_LETTER } from "../../constants.js";

// "DEN" → "DK", "sui_fr" → "CH-FR"; anything else back unchanged.
export function twoLetterCode(code) {
  const text = String(code || "").trim();
  return MAGI_TWO_LETTER[text.toUpperCase().replace(/_/g, "-")] || text;
}

// A deliverable or task name with its closing market code made two-letter: "…_10s_DEN" → "…_10s_DK",
// "…_BEL_FL" → "…_BE_FL". Only the end of the name is read, where the studio's names put the market.
export function twoLetterName(name) {
  const text = String(name || "");
  const pair = /([_\s-])([A-Za-z]{3,4})([_-])([A-Za-z]{2,3})$/.exec(text);
  const pairTwo = pair && MAGI_TWO_LETTER[`${pair[2]}-${pair[4]}`.toUpperCase()];
  if (pairTwo) return text.slice(0, pair.index) + pair[1] + pairTwo.replace("-", pair[3]);
  const one = /([_\s-])([A-Za-z]{3})$/.exec(text);
  const oneTwo = one && MAGI_TWO_LETTER[one[2].toUpperCase()];
  return oneTwo ? text.slice(0, one.index) + one[1] + oneTwo : text;
}

// "Denmark (DEN)" → "Denmark (DK)", for showing a Drive folder's market.
export const twoLetterLabel = (name) =>
  String(name || "").replace(/\(([A-Za-z]{2,4})\)(\s*)$/, (all, code, space) => `(${twoLetterCode(code)})${space}`);
