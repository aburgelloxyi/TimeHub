import { planMarketFolder } from "../src/lib/orderForms/wrikeMarketFolder.js";
import { aliasClash } from "../src/lib/orderForms/wrikeFilm.js";
import { TERRITORY_FLAGS } from "../src/constants.js";

const tree = (extra = {}) => {
  const byId = {
    studio: { id: "studio", title: "Universal", childIds: ["film", "other"] },
    film: { id: "film", title: "Forgotten_Island", childIds: ["digital", "print"] },
    digital: { id: "digital", title: "Digital", childIds: ["dm"] },
    print: { id: "print", title: "Print", childIds: ["pm"] },
    dm: { id: "dm", title: "XY026040_FID_INTL_DIGITAL_Outdoor_Campaign_Markets", childIds: ["dk", "cz", "local"] },
    pm: { id: "pm", title: "XY025813_INTL_PRINT_Outdoor_Campaign_Markets", childIds: [] },
    dk: { id: "dk", title: `Denmark ${TERRITORY_FLAGS.Denmark}`, childIds: [] },
    cz: { id: "cz", title: `Czech Republic ${TERRITORY_FLAGS["Czech Republic"]}`, childIds: [] },
    local: { id: "local", title: "_Localised_Master_Suites", childIds: [] },
    other: { id: "other", title: "Other_Film", childIds: ["om"] },
    om: { id: "om", title: "XY1_INTL_DIGITAL_Outdoor_Campaign_Markets", childIds: [] },
    ...extra,
  };
  return byId;
};
const plan = (request, byId = tree()) => planMarketFolder(byId, { filmTitle: "forgotten island", kind: "motion", ...request });

const bg = plan({ marketName: "Bulgaria (BG)" });
check("goes in the film's own digital markets folder", [bg.ok, bg.film, bg.parent.id], [true, "Forgotten_Island", "dm"]);
check("named like the folders already there: country and flag, no code", bg.title, `Bulgaria ${TERRITORY_FLAGS.Bulgaria}`);
check("nothing there yet", bg.existing, null);
check("print orders go in the print markets folder", plan({ marketName: "Bulgaria (BG)", kind: "print" }).parent.id, "pm");
check("already there", plan({ marketName: "DENMARK (DK)" }).existing, { id: "dk", title: `Denmark ${TERRITORY_FLAGS.Denmark}` });
check("already there under another spelling, known by its flag", plan({ marketName: "Czechia (CZE)" }).existing?.id, "cz");
check("an unknown market gets its plain name", plan({ marketName: "Atlantis" }).title, "Atlantis");

check("film not in Wrike", plan({ marketName: "Bulgaria (BG)", filmTitle: "Nope" }).reason, 'No film called "Nope" was found in Wrike.');
check("no markets folder for the medium",
  planMarketFolder(tree({ print: { id: "print", title: "Print", childIds: [] } }), { filmTitle: "Forgotten Island", kind: "print", marketName: "Bulgaria" }).ok, false);
check("two markets folders: refuses instead of picking",
  plan({ marketName: "Bulgaria" }, tree({ digital: { id: "digital", title: "Digital", childIds: ["dm", "dm2"] }, dm2: { id: "dm2", title: "XY9_INTL_DIGITAL_Outdoor_Campaign_Markets", childIds: [] } })).ok, false);

check("a film punctuated differently in Wrike is still found",
  planMarketFolder(tree({ film: { id: "film", title: "Focker In-Law", childIds: ["digital", "print"] } }), { filmTitle: "Focker In Law", kind: "motion", marketName: "Slovakia (SVK)" }).film,
  "Focker In-Law");

// A sheet that names the film by one of its aliases (films.aliases).
const birds = tree({ film: { id: "film", title: "Angry_Birds_3_Movie", childIds: ["digital", "print"] } });
const aliased = [{ title: "Angry Birds 3 Movie", aliases: ["Angry Birds 3"] }];
check("a film named by an alias is found under its own title",
  planMarketFolder(birds, { filmTitle: "Angry Birds 3", kind: "motion", marketName: "Peru (PER)", films: aliased }).film, "Angry_Birds_3_Movie");
check("an alias matches whatever its punctuation",
  planMarketFolder(birds, { filmTitle: "ANGRY BIRDS-3", kind: "motion", marketName: "Peru (PER)", films: aliased }).ok, true);
check("without the alias, not found",
  planMarketFolder(birds, { filmTitle: "Angry Birds 3", kind: "motion", marketName: "Peru (PER)" }).ok, false);

// One name leads to one film.
const list = [{ id: 1, title: "Angry Birds 3 Movie", aliases: ["Angry Birds 3"] }, { id: 2, title: "Shrek 5", aliases: [] }];
check("an alias is refused when it is the film's own name, another film's name or alias, or blank", [
  aliasClash(list, 1, "angry birds 3 movie"), aliasClash(list, 2, "Angry-Birds 3"), aliasClash(list, 1, "Shrek 5"), aliasClash(list, 2, " - "),
], ['"angry birds 3 movie" is already this film\'s name.', '"Angry-Birds 3" already names Angry Birds 3 Movie.', '"Shrek 5" already names Shrek 5.', "An alias needs at least one letter or digit."]);
check("a new name is fine", aliasClash(list, 2, "Shrek Forever"), "");
