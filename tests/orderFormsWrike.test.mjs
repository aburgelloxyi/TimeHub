import { taskKey, indexTasks, indexParents, findTask, taskSummary, makeMatcher, titleSimilarity, orderKey, taskLink } from "../src/lib/orderForms/wrikeMatch.js";

// The sheet leaves a doubled underscore where the site name is empty; the task
// a PM makes from it has one.
check("doubled underscore", taskKey("SF_INTL_Trio_DOOH__1632x832px_30s_KZ"), taskKey("SF_INTL_Trio_DOOH_1632x832px_30s_KZ"));
check("spaces are underscores", taskKey("EBZR_INTL_CandleSmoke_INTH_Multi Panel_960x576px_CMYK_HR"), taskKey("EBZR_INTL_CandleSmoke_INTH_Multi_Panel_960x576px_CMYK_HR"));
check("case and padding", taskKey("  sf_intl_trio_dooh_1632x832px_30s_kz "), "sf_intl_trio_dooh_1632x832px_30s_kz");
check("a different size is a different task", taskKey("SF_INTL_Trio_DOOH_1632x832px_30s_KZ") === taskKey("SF_INTL_Trio_DOOH_1760x448px_30s_KZ"), false);
check("empty", taskKey(null), "");

const tasks = [
  { id: "A", title: "SF_INTL_Trio_DOOH_1632x832px_30s_KZ", updatedDate: "2026-10-01T10:00:00Z" },
  { id: "B", title: "SF_INTL_Trio_DOOH_1760x448px_20s_KZ", updatedDate: "2026-10-01T10:00:00Z" },
  { id: "C", title: "SF_INTL_Trio_DOOH_1760x448px_20s_KZ", updatedDate: "2026-10-05T10:00:00Z" },
  { id: "D", title: "Banner" },
  { id: "E", title: "OV_Masters" },
  { id: "F" },
];
const index = indexTasks(tasks);

check("indexed by tidied name", index.get("sf_intl_trio_dooh_1632x832px_30s_kz")?.id, "A");
check("same name twice: the most recently updated", index.get("sf_intl_trio_dooh_1760x448px_20s_kz")?.id, "C");
check("short and unstructured titles are left out", [index.has("banner"), index.has("ov_masters")], [false, false]);

const order = (title, deliveryName = "") => ({ xyi: { title }, deliveryName });
check("matched by the XYi title", findTask(index, order("SF_INTL_Trio_DOOH__1632x832px_30s_KZ"))?.id, "A");
check("matched by the delivery name when the XYi title is missing", findTask(index, order("", "SF_INTL_Trio_DOOH__1632x832px_30s_KZ"))?.id, "A");
check("no task with that name", findTask(index, order("SF_INTL_Trio_DOOH__512x1536px_8s_KZ")), null);
check("an order with no name matches nothing", findTask(index, order("")), null);
check("a vague name matches nothing even if a task has it", findTask(indexTasks([{ id: "D", title: "Banner" }]), order("Banner")), null);
check("no tasks loaded", findTask(indexTasks([]), order("SF_INTL_Trio_DOOH__1632x832px_30s_KZ")), null);
check("no index at all", findTask(null, order("SF_INTL_Trio_DOOH__1632x832px_30s_KZ")), null);


// People and dates usually sit on the parent task, not the per-size subtask.
const hub = { id: "P", title: "SF Motion Outdoor Bespoke KZ", subTaskIds: ["S"], assignees: "James C., AM T.", dates: { due: "2026-10-08T17:00:00" } };
const sub = { id: "S", title: "SF_INTL_Trio_DOOH_512x1536px_8s_KZ", assignees: "", dates: { due: "2026-10-07T17:00:00" } };
const parents = indexParents([hub, sub]);
check("a subtask's parent is found", parents.get("S")?.id, "P");
check("a top-level task has no parent", parents.get("P"), undefined);
check("bare subtask: the parent's people, and both due dates", taskSummary(sub, hub), {
  assignees: "James C., AM T.", assigneesFromParent: true, due: "2026-10-07", dueFromParent: false, parentDue: "2026-10-08",
});
check("the subtask's own people win", taskSummary({ ...sub, assignees: "Michael S." }, hub).assignees, "Michael S.");
check("same due date on both is said once", taskSummary({ ...sub, dates: hub.dates }, hub).parentDue, "");
check("undated subtask takes the parent's date", taskSummary({ ...sub, dates: {} }, hub), {
  assignees: "James C., AM T.", assigneesFromParent: true, due: "2026-10-08", dueFromParent: true, parentDue: "",
});
check("no parent loaded", taskSummary(sub, undefined), {
  assignees: "", assigneesFromParent: false, due: "2026-10-07", dueFromParent: false, parentDue: "",
});

// ── Close and hand-chosen matches ─────────────────────────────────────────────
{
  const o = (title, row = 1) => ({ tab: "T", row, xyi: { title }, deliveryName: "" });
  const hu = [
    { id: "ex", title: "EBZR_INTL_CandleSmoke_DINTH_LED_3840x600px_RGB_HU" },
    { id: "typo", title: "EBZR_INTL_CandleSmoke_OOH_CLP_118.5x157cm_CMYK_HU" },
    { id: "word", title: "EBZR_INTL_CandleSmoke_INTH_Panaflex_Foyer_280x180cm_CMYK_HU" },
    { id: "art", title: "EBZR_INTL_Eyes_DOOH_LED_2304x432px_RGB_HU" },
    { id: "hr", title: "EBZR_INTL_CandleSmoke_OOH_CLP_118.5x175cm_CMYK_HR" },
  ];
  const m = makeMatcher(hu);
  const how = (orders, links, briefed) => m.match(orders, links, briefed).map((r) => (r ? `${r.task.id}:${r.how}` : null));

  check("exact name", how([o("EBZR_INTL_CandleSmoke_DINTH_LED_3840x600px_RGB_HU")]), ["ex:exact"]);
  check("a size briefed with a typo is a close match", how([o("EBZR_INTL_CandleSmoke_OOH_CLP_118.5x175cm_CMYK_HU")]), ["typo:close"]);
  check("a word added to the task is a close match", how([o("EBZR_INTL_CandleSmoke_INTH_Panaflex_280x180cm_CMYK_HU")]), ["word:close"]);
  check("a changed creative is a close match", how([o("EBZR_INTL_CandleSmoke_DOOH_LED_2304x432px_RGB_HU")]), ["art:close"]);
  check("never another market's task", how([o("EBZR_INTL_CandleSmoke_OOH_CLP_118.5x175cm_CMYK_AT")]), [null]);
  check("a different size and placement is not close", how([o("EBZR_INTL_CandleSmoke_FOH_Standee_100x200cm_CMYK_HU")]), [null]);
  check("one task goes to one order: the exact name keeps it, the near one goes without",
    how([o("EBZR_INTL_CandleSmoke_DINTH_LED_3840x600px_RGB_HU", 1), o("EBZR_INTL_CandleSmoke_DINTH_LED_3840x610px_RGB_HU", 2)]),
    ["ex:exact", null]);

  const order = o("EBZR_INTL_CandleSmoke_OOH_CLP_118.5x175cm_CMYK_HU", 4);
  check("chosen by hand wins", how([order], { [orderKey(order)]: "art" }), ["art:chosen"]);
  check("marked as not in Wrike: no close match offered", how([order], { [orderKey(order)]: "none" }), [null]);
  check("a task made from the page counts before TimeHub has loaded it",
    how([order], {}, { [orderKey(order)]: { id: "new1", title: "EBZR_Batch1_HU sub", permalink: "https://x" } }), ["new1:created"]);
  check("candidates: same film and market, nearest first", m.candidates(order).map((c) => c.task.id)[0], "typo");
  check("candidates never include another market", m.candidates(order).some((c) => c.task.id === "hr"), false);

  check("sizes written differently are the same", titleSimilarity("A_B_118,5x175_C", "A_B_118.5x175cm_C"), 1);
  check("the key moves with the row", orderKey(o("X_Y_Z_W", 4)) === orderKey(o("X_Y_Z_W", 5)), false);
  check("a cached task still has a link, by its number", [taskLink({ id: "MAAAAAERNTTf" }), taskLink({ id: "IEAB", permalink: "https://x/y" }), taskLink(null)],
    ["https://www.wrike.com/open.htm?id=4583666911", "https://x/y", ""]);
}

// ── Motion and print are kept apart ───────────────────────────────────────────
{
  const { makeMatcher, mediumOf, taskMediumOf } = await import("../src/lib/orderForms/wrikeMatch.js");
  const filed = (title, jobNumber) => ({ title, customFields: jobNumber ? [{ id: "JN", value: jobNumber }] : [] });
  check("a task's kind: its job number before its name", [
    taskMediumOf(filed("EBZR_INTL_CandleSmoke_DINTH_LED_3840x600px_RGB_HU", "XY026287_INTL_PRINT_Outdoor_Campaign_Markets")),
    taskMediumOf(filed("EBZR_INTL_CandleSmoke_FOH_Banner_6x3m_CMYK_HU", "XY026288_DIGITAL_Outdoor_INTL_Campaign")),
    taskMediumOf(filed("EBZR_INTL__DFOH__1920x1080px_10s_HU", "XY026289_DOOH_INTL_Campaign")),
  ], ["print", "motion", "motion"]);
  check("a task's kind: its name when the job number says neither", [
    taskMediumOf(filed("EBZR_INTL__DFOH__1920x1080px_10s_HU", "XY026290_Outdoor_INTL_Campaign")),
    taskMediumOf(filed("EBZR_INTL_CandleSmoke_FOH_Banner_6x3m_CMYK_HU")),
  ], ["motion", "print"]);
  {
    const hu = { tab: "Hungary (HUN)", row: 6, xyi: { title: "EBZR_INTL__DINTH_LED_ETELE_3840x1400px_15s_HU" } };
    const printLed = { id: "P", title: "EBZR_INTL_CandleSmoke_DINTH_LED_3840x600px_RGB_HU", customFields: [{ id: "JN", value: "XY026287_INTL_PRINT_Outdoor_Campaign_Markets" }] };
    const m = makeMatcher([printLed]);
    check("a motion order isn't matched to a print task named with a digital word", m.match([hu], {}, {}, "motion"), [null]);
    check("nor offered it by hand", m.candidates(hu, "motion").length, 0);
  }
  check("a name's kind", ["EBZR_INTL__DFOH__1920x1080px_10s_ZA", "EBZR_INTL_CandleSmoke_FOH_Banner_6x3m_CMYK_ZA", "EBZR_Batch1_ZA"].map(mediumOf), ["motion", "print", ""]);
  const za = [
    { id: "p1", title: "EBZR_INTL_CandleSmoke_FOH_Banner_6x3m_CMYK_ZA" },
    { id: "m1", title: "EBZR_INTL_CandleSmoke_DFOH_Screen_1920x1080px_10s_ZA" },
  ];
  const order = { tab: "T", row: 4, xyi: { title: "EBZR_INTL__DFOH__1920x1080px_10s_ZA" } };
  check("a motion order is offered only motion tasks", makeMatcher(za).candidates(order, "motion").map((c) => c.task.id), ["m1"]);
  check("without a kind, everything for the film and market", makeMatcher(za).candidates(order).map((c) => c.task.id).sort(), ["m1", "p1"]);
}

// A deleted task (in Wrike's recycle bin) is never a match.
{
  const { makeMatcher } = await import("../src/lib/orderForms/wrikeMatch.js");
  const tasks = [
    { id: "live", title: "SF_INTL_StaticLegendary_DOOH_DigitalCityLights_1080x1920px_10s_AT", scope: "WsTask" },
    { id: "gone", title: "SF_INTL_StaticLegendary_DOOH_DigitalCityLights_1080x1920px_10s_AT", scope: "RbTask" },
  ];
  const o = (row) => ({ tab: "T", row, xyi: { title: "SF_INTL_StaticLegendary_DOOH_DigitalCityLights_1080x1920px_10s_AT" } });
  check("two orders, one live task and one deleted: the second order matches nothing", makeMatcher(tasks).match([o(4), o(5)]).map((m) => m?.task.id || null), ["live", null]);
}
