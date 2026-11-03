// Whether an order's artwork has been chosen. While they decide, markets type a
// placeholder ("TBC", "TBCStatic", "TBA", "to be confirmed"), which isn't an
// artwork: such an order isn't ready to brief, and two of them aren't the same
// order. "TBC" and its kin count at the start of the cell; the rest only as the
// whole of it, so an artwork called "Nature" isn't mistaken for "n/a".
const STARTS = /^(tbc|tba|tbd)(?![a-z])|^(tbc|tba|tbd)(static|motion|print)/i;
const WHOLE = /^(to be (confirmed|advised|decided)|n\/?a|none|-+|\?+)$/i;

export function artworkChosen(value) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return !!text && !STARTS.test(text) && !WHOLE.test(text);
}
