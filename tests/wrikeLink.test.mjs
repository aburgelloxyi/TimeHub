import { wrikeNumber, wrikeLink } from "../src/lib/wrikeLink.js";

// Pairs read from the shared cache, as Wrike gave them.
check("older ids carry the number", ["IEAFZXYZKRDKERKU", "IEAFZXYZKRCRJO6G"].map(wrikeNumber), ["1185039700", "1158986694"]);
check("newer ids carry it too, past four bytes", ["MAAAAAERNTTf", "MAAAAAERIukB", "MAAAAAERIqT0"].map(wrikeNumber), ["4583666911", "4582467841", "4582450420"]);
check("not an id", ["", null, "folder-x", "hello world"].map(wrikeNumber), ["", "", "", ""]);
check("a permalink is used as it is", wrikeLink({ id: "MAAAAAERNTTf", permalink: "https://www.wrike.com/open.htm?id=1" }), "https://www.wrike.com/open.htm?id=1");
check("else made from the number", wrikeLink({ id: "MAAAAAERNTTf" }), "https://www.wrike.com/open.htm?id=4583666911");
check("nothing to link to", wrikeLink({ id: "" }), "");
