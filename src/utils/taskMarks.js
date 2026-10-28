// Timeline marks that name a Wrike task. XYi in Motion puts these on your day
// from the files you saved and rendered ("Colombia, from your files"), with the
// task's id and no job: the task's own job, country and category fill them in,
// worked out as a pulled row's are (rowFieldsFromTask). A mark with no taskId
// is untouched by everything here.

export const needsTask = (m) => !!m?.taskId && !m.jobNumber;

// A task's row fields as a mark's. A category the task can't tell keeps the
// mark's own.
export function markFieldsFromTask({ guessed = {}, client = "", filmTitle = "" } = {}, mark = {}) {
  return {
    jobNumber: guessed.jobNumber || "",
    territory: guessed.territory || mark.territory || "",
    category: guessed.category || mark.category || "",
    client,
    filmTitle,
  };
}

// Work marked against a task and not yet on the sheet, so the task's own
// suggestion counts it as covered rather than offering it again. Once added,
// the row carries the taskId and hoursLoggedFor finds it there.
export function markedForTask(marks, taskId, split) {
  return (marks || [])
    .filter((m) => taskId && m.taskId === taskId && m.kind === "work" && !m.added)
    .reduce(
      (t, m) => {
        const { regular, extra } = split(m);
        return { regular: t.regular + regular, extra: t.extra + extra };
      },
      { regular: 0, extra: 0 }
    );
}
