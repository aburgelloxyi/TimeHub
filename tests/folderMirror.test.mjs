import { folderPatchPlan, folderEntries, parentsToRead } from "../src/lib/folderMirror.js";

check("a new folder is read", folderPatchPlan([{ folderId: "F", eventType: "FolderCreated" }]), { remove: [], refetch: ["F"] });
check("a deleted folder is dropped, and not read", folderPatchPlan([{ folderId: "F", eventType: "FolderTitleChanged" }, { folderId: "F", eventType: "FolderDeleted" }]), { remove: ["F"], refetch: [] });
check("a move reads the folder and both parents",
  folderPatchPlan([{ folderId: "F", eventType: "FolderParentsAdded", addedParents: ["P2"] }, { folderId: "F", eventType: "FolderParentsRemoved", removedParents: ["P1"] }]),
  { remove: [], refetch: ["F", "P2", "P1"] });
check("task events and folder chatter are ignored",
  folderPatchPlan([{ taskId: "T", eventType: "TaskStatusChanged" }, { folderId: "F", eventType: "FolderCommentAdded" }, { folderId: "F", taskId: "T", eventType: "FolderCreated" }, null]),
  { remove: [], refetch: [] });

check("folders become entries shaped like the daily refresh's",
  folderEntries([{ id: "F", title: "Bulgaria", childIds: ["a"], parentIds: ["P"], scope: "WsFolder" }, { id: "G" }]).upsert,
  { F: { id: "F", title: "Bulgaria", childIds: ["a"] }, G: { id: "G", title: "", childIds: [] } });
check("a folder in the recycle bin is removed", folderEntries([{ id: "F", title: "x", scope: "RbFolder" }]), { upsert: {}, remove: ["F"] });
check("parents not read yet", parentsToRead([{ id: "F", parentIds: ["P", "Q"] }, { id: "G", parentIds: ["P", "F"] }], ["F", "G"]), ["P", "Q"]);
