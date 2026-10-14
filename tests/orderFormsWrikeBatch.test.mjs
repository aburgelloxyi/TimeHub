import { batchCodes, suggestBatchName, suggestDue, planBatch, tidyTaskName } from "../src/lib/orderForms/wrikeBatch.js";

const o = (row, title, endDate = "2026-10-12", deliveryDeadline = "2026-10-19", artwork = "CandleSmoke") => ({ tab: "T", row, deliveryDeadline, deliveryName: "", artwork, xyi: { title, endDate } });
const hu = [o(4, "EBZR_INTL_CandleSmoke_OOH_CLP_118.5x175cm_CMYK_HU"), o(5, "EBZR_INTL_CandleSmoke_INTH_Panaflex_280x180cm_CMYK_HU", "2026-10-09")];

check("film and market codes from the orders' names", batchCodes(hu), { film: "EBZR", market: "HU" });
check("first batch in an empty folder", suggestBatchName([], hu), "EBZR_Batch1_HU");
check("one past the highest batch there, however it was written",
  [suggestBatchName(["EBZR_Batch1_HU", "EBZR_Batch 3_HU", "Notes"], hu), suggestBatchName(["FIL_DINTH_TH_B3", "FIL_INTH_B1_TH"], hu)],
  ["EBZR_Batch4_HU", "EBZR_Batch4_HU"]);
check("a size isn't taken for a batch number", suggestBatchName(["EBZR_INTL_B_1080x1920px_HU"], hu), "EBZR_Batch1_HU");
check("due: the earliest date XYi works to", suggestDue(hu), "2026-10-09");
check("due: the earliest deadline when the sheet gives no end date", suggestDue([o(4, "A_B_C_D", "", "2026-10-19"), o(5, "A_B_C_E", "", "2026-10-15")]), "2026-10-15");

const plan = planBatch({ name: " EBZR_Batch1_HU ", due: "2026-10-14", orders: hu });
check("a plan: the batch and a subtask an order", [plan.ok, plan.name, plan.tasks.map((t) => [t.row, t.title])],
  [true, "EBZR_Batch1_HU", [[4, "EBZR_INTL_CandleSmoke_OOH_CLP_118.5x175cm_CMYK_HU"], [5, "EBZR_INTL_CandleSmoke_INTH_Panaflex_280x180cm_CMYK_HU"]]]);
check("nothing to go on", planBatch({ name: "", due: "", orders: [] }).problems, ["Give the batch a name.", "Give the batch a due date.", "Tick the orders to brief."]);
check("an order with no name can't become a task", planBatch({ name: "X", due: "2026-10-14", orders: [o(7, "")] }).problems, ["Row 7 has no task name in the sheet."]);
check("nor one with no artwork chosen", planBatch({ name: "X", due: "2026-10-14", orders: [o(4, "A_B_C_HU", "", "", ""), o(5, "A_B_D_HU", "", "", " ")] }).problems,
  ["Rows 4, 5 have no artwork selected. Choose it in the sheet first."]);
check("the sheet's doubled underscores and spaces are tidied in the task name",
  [tidyTaskName("EBZR_INTL__DFOH__1920x1080px_10s_ZA"), tidyTaskName("FID_INTL_Trio_DINTH_Digital poster_1080x1920PX_RGB_BG"), tidyTaskName("_A__B_")],
  ["EBZR_INTL_DFOH_1920x1080px_10s_ZA", "FID_INTL_Trio_DINTH_Digital_poster_1080x1920PX_RGB_BG", "A_B"]);
check("a plan uses the tidied name", planBatch({ name: "X", due: "2026-10-14", orders: [o(4, "EBZR_INTL__DFOH__1920x1080px_10s_ZA")] }).tasks[0].title, "EBZR_INTL_DFOH_1920x1080px_10s_ZA");
check("two orders with one name are reported, not both made",
  planBatch({ name: "X", due: "2026-10-14", orders: [o(4, "A_B_C_HU"), o(9, "A__B_C_HU")] }).problems, ['Rows 4 and 9 would both become "A_B_C_HU".']);
