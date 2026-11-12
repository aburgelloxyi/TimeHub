import { mergeFilmMappings, filmCodeTable, isFilmCode, normalizeFilmCode } from "../src/lib/filmCodes.js";

check("film codes: discovery adds to what's known",
  mergeFilmMappings({ ODY: "Odyssey" }, { ZAL: "Zalo" }), { ODY: "Odyssey", ZAL: "Zalo" });
check("film codes: a corrected name beats a rediscovered one",
  mergeFilmMappings({ ODY: "Odyssey" }, { ODY: "Odyssey Trailer" }, { ODY: "The Odyssey" }), { ODY: "The Odyssey" });
check("film codes: a removed code stays removed",
  mergeFilmMappings({ FILM: "Film" }, { FILM: "Film" }, { FILM: null }), {});
check("film codes: a hand-added code appears", mergeFilmMappings({}, {}, { NEWF: "New Film" }), { NEWF: "New Film" });
check("film codes: shape", [isFilmCode("ODY"), isFilmCode("O"), isFilmCode("1AB"), isFilmCode(normalizeFilmCode(" wk2 "))], [true, false, false, true]);

// The table everything reads: hardcoded over discovered, hand edits over both.
const table = filmCodeTable({ WK2: "Wicked: For Good", EBZR: "Ebenezer" }, { AB3: "Angry Birds Three", NEWF: "New Film" });
check("film code table: a hardcoded name beats a discovered one", table.WK2, "Wicked II");
check("film code table: a discovered code with no hardcoded one is kept", table.EBZR, "Ebenezer");
check("film code table: a hand edit beats a hardcoded name", table.AB3, "Angry Birds Three");
check("film code table: a hand-added code appears", table.NEWF, "New Film");
check("film code table: with nothing saved, the hardcoded codes", filmCodeTable().FID, "Forgotten Island");
