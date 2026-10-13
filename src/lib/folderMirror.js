// Keeping the saved copy of Wrike's folder tree (wrike_sync_meta's
// folder_dictionary) in step between its daily refreshes. Wrike tells the
// Worker when a folder is created, renamed, moved or deleted; the Worker reads
// those folders again and patches the copy. Pure helpers, used by the Worker
// and tested without it.

// The folder events that change the tree's shape or names. Wrike also sends
// folder comments and attachments through the same hook; those don't.
const SHAPE_EVENTS = new Set(["FolderCreated", "FolderDeleted", "FolderTitleChanged", "FolderParentsAdded", "FolderParentsRemoved"]);

// What a batch of webhook events asks of the copy: folder ids to drop, and
// ids to read again from Wrike. A folder gained or lost by a parent means the
// parent's list of children changed too, so those are read again as well.
export function folderPatchPlan(events) {
  const remove = new Set();
  const refetch = new Set();
  for (const e of events || []) {
    if (!e?.folderId || e.taskId || !SHAPE_EVENTS.has(e.eventType)) continue;
    if (e.eventType === "FolderDeleted") remove.add(e.folderId);
    else refetch.add(e.folderId);
    for (const id of [...(e.addedParents || []), ...(e.removedParents || [])]) refetch.add(id);
  }
  for (const id of remove) refetch.delete(id);
  return { remove: [...remove], refetch: [...refetch] };
}

// Folders as Wrike returns them → entries for the copy, in the shape the daily
// refresh writes ({ id, title, childIds }). A folder in the recycle bin (scope
// "Rb…") is as good as deleted, so it goes in `remove`.
export function folderEntries(folders) {
  const upsert = {};
  const remove = [];
  for (const f of folders || []) {
    if (!f?.id) continue;
    if (/^Rb/i.test(f.scope || "")) remove.push(f.id);
    else upsert[f.id] = { id: f.id, title: f.title || "", childIds: f.childIds || [] };
  }
  return { upsert, remove };
}

// The parents of the folders just read that weren't read themselves: a new
// folder's parent has to learn it has a new child.
export const parentsToRead = (folders, alreadyRead) =>
  [...new Set((folders || []).flatMap((f) => f.parentIds || []))].filter((id) => !alreadyRead.includes(id));
