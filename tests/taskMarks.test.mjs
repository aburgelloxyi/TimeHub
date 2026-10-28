import { needsTask, markFieldsFromTask, markedForTask } from "../src/utils/taskMarks.js";
import { splitMarked } from "../src/utils/commentActivity.js";

check("a task's mark with no job needs its task", needsTask({ taskId: "IEA1", jobNumber: "" }), true);
check("a task's mark with a job doesn't", needsTask({ taskId: "IEA1", jobNumber: "Ebenezer : XY026292, Markets" }), false);
check("a hand-drawn mark is never asked about", needsTask({ jobNumber: "" }), false);

check("fields from the task",
  markFieldsFromTask(
    { guessed: { jobNumber: "Ebenezer : XY026292, Markets", territory: "Colombia", category: "Motion" }, client: "Paramount Pictures", filmTitle: "Ebenezer" },
    { category: "Design" }),
  { jobNumber: "Ebenezer : XY026292, Markets", territory: "Colombia", category: "Motion", client: "Paramount Pictures", filmTitle: "Ebenezer" });
check("a category the task can't tell keeps the mark's",
  markFieldsFromTask({ guessed: { jobNumber: "XY026292" } }, { category: "Design" }).category, "Design");

const marks = [
  { id: "a", taskId: "IEA1", kind: "work", from: 600, to: 720 },               // 10:00-12:00
  { id: "b", taskId: "IEA1", kind: "work", from: 780, to: 810, added: true },  // on the sheet already
  { id: "c", taskId: "IEA2", kind: "work", from: 720, to: 780 },
  { id: "d", kind: "work", from: 900, to: 960 },                                // hand-drawn, no task
  { id: "e", taskId: "IEA1", kind: "break", from: 720, to: 735 },
];
check("marked work for a task, not yet added", markedForTask(marks, "IEA1", splitMarked), { regular: 2, extra: 0 });
check("another task's", markedForTask(marks, "IEA2", splitMarked), { regular: 1, extra: 0 });
check("no task, nothing", markedForTask(marks, "", splitMarked), { regular: 0, extra: 0 });
check("no marks", markedForTask(undefined, "IEA1", splitMarked), { regular: 0, extra: 0 });
