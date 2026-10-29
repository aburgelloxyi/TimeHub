import { fetchFolderAncestry, overlayFolders, getFolderCountries, jobFolderDescription } from "../src/lib/wrikeEnrich.js";

// Wrike as it is now: Cyprus made this morning, Taiwan moved from a holding
// folder into the campaign since the saved tree's refresh.
const wrike = {
  P: { id: "P", title: "Paramount", childIds: ["F"], parentIds: [] },
  F: { id: "F", title: "Ebenezer", childIds: ["C"], parentIds: ["P"] },
  C: { id: "C", title: "XY026292_INTL_DIGITAL_Outdoor_Campaign_Markets", childIds: ["dk", "cy", "tw"], parentIds: ["F"] },
  dk: { id: "dk", title: "Denmark 🇩🇰", childIds: [], parentIds: ["C"] },
  cy: { id: "cy", title: "Cyprus 🇨🇾", childIds: [], parentIds: ["C"] },
  tw: { id: "tw", title: "Taiwan 🇹🇼", childIds: [], parentIds: ["C"] },
  bin: { id: "bin", title: "Old", childIds: [], parentIds: ["C"], scope: "RbFolder" },
};
const saved = {
  P: { id: "P", title: "Paramount", childIds: ["F", "H"] },
  F: { id: "F", title: "Ebenezer", childIds: ["C"] },
  C: { id: "C", title: "XY026292_INTL_DIGITAL_Outdoor_Campaign_Markets", childIds: ["dk"] },
  H: { id: "H", title: "Holding", childIds: ["tw"] },
  dk: { id: "dk", title: "Denmark 🇩🇰", childIds: [] },
  tw: { id: "tw", title: "Taiwan 🇹🇼", childIds: [] },
};
const asked = [];
const read = async (ids) => { asked.push(ids); return ids.map((id) => wrike[id]).filter(Boolean); };

const { folders, complete } = await fetchFolderAncestry(["cy", "tw", "cy"], read);
check("climbs to the root", Object.keys(folders).sort(), ["C", "F", "P", "cy", "tw"]);
check("one request a level", asked, [["cy", "tw"], ["C"], ["F"], ["P"]]);
check("complete", complete, true);

const tree = overlayFolders(saved, folders);
const country = (id) => getFolderCountries({ parentIds: [id] }, tree.folderDictionary, tree.childToParent);
check("a folder made since the refresh is placed", country("cy"), ["Cyprus"]);
check("a moved folder climbs its new branch", tree.childToParent.tw, ["C"]);
check("...and still reaches the campaign", jobFolderDescription({ parentIds: ["tw"] }, "XY026292", tree.folderDictionary, tree.childToParent), "INTL DIGITAL Outdoor Campaign Markets");
check("the saved tree isn't changed", Object.keys(saved).includes("cy"), false);
check("a folder in the recycle bin is dropped", "bin" in overlayFolders(saved, { bin: wrike.bin }).folderDictionary, false);

const missing = await fetchFolderAncestry(["gone"], read);
check("a folder Wrike doesn't return makes it incomplete", missing.complete, false);
const failing = await fetchFolderAncestry(["cy"], async () => { throw new Error("offline"); });
check("Wrike unreachable: nothing, and incomplete", [failing.folders, failing.complete], [{}, false]);
