// A review link is an address made of file paths: `xyireviewer://compare?frame=0&market=/Volumes/.../Markets/
// Bulgaria/Renders/Batch_1/EBZR_INTL_Blue_DINTH_Stopcity_1080x1920px_60s_BG_V01.mov&master=...`.
// Readers of a note do not need the paths; they need to know what is being compared. This turns the address
// into the sentence the Hub shows in its own notes, without changing the address itself.

const clean = (file) => String(file || "").split("/").pop() || "";

/** The parts a render filename carries: film code, creative, art, market, size, duration, territory, version. */
const PRODUCTION_WORDS = ["DOOH", "DINTH", "DFOH", "FOH", "OOH", "DLP", "LED", "TVC", "BTS", "SOCIAL", "DIGITAL", "INTL", "DOM", "STATIC"];

function parts(file) {
  const name = clean(file).replace(/\.[a-z0-9]+$/i, "");
  const bits = name.split("_");
  return {
    creative: bits[2] || "",
    art: [bits[3], bits[4]].filter((b) => b && !PRODUCTION_WORDS.includes(b.toUpperCase())).join(" "),
    size: bits.find((b) => /^\d+x\d+(px)?$/i.test(b)) || "",
    duration: bits.find((b) => /^\d+(s|sec|secs)$/i.test(b)) || "",
    territory: bits[bits.length - 2] || "",
    version: bits[bits.length - 1] || "",
  };
}

/** "Bulgaria" from the market's path, which always has Markets/<territory>/ after it. */
function territory(file) {
  const bits = String(file || "").split("/");
  const i = bits.findIndex((b) => /markets$/i.test(b));
  return i >= 0 ? bits[i + 1] || "" : "";
}

/**
 * The readable form of a review link, or "" for any other address. Two sides, as the Reviewer works: the
 * market render first, then the master it is being compared with.
 */
export function reviewLinkLabel(href) {
  if (typeof href !== "string" || !href.startsWith("xyireviewer://compare")) return "";
  let url;
  try {
    url = new URL(href);
  } catch (e) {
    return "";
  }
  const market = url.searchParams.get("market") || "";
  const master = url.searchParams.get("master") || "";
  const m = parts(market);
  const v = parts(master);
  const where = territory(market) || m.territory;
  const marketText = [m.creative, m.art, m.size, m.duration, m.version].filter(Boolean).join(" ");
  const masterText = [v.creative, v.size, v.duration, v.version].filter(Boolean).join(" ");
  if (!marketText) return "Compare";
  return "Compare · " + [where, marketText].filter(Boolean).join(" · ")
    + (masterText ? ", with the " + masterText + " master" : "");
}
