import { parseAmends, amendKey, buildAmends, creativeOfName, marketOfName } from "../src/lib/amends/amends.js";

const review = [
  "SF_INTL_Trio_DOOH_RealPlazaChiclayo_1920x1080px_20s_PE_V01.mov",
  "SF_INTL_Trio_DOOH_RealPlazaCusco_1920x1080px_20s_PE_V01.mov",
  ":small_orange_diamond: On the EC the date is stuck in the bottom corner before coming in.",
  "",
  ":white_check_mark: The others are approved",
].join("\n");

const parsed = parseAmends(review);
check("a run of filenames shares the note under it", Object.keys(parsed.byKey).length, 2);
check("the version reviewed is kept", parsed.byKey[amendKey("SF_INTL_Trio_DOOH_RealPlazaCusco_1920x1080px_20s_PE_V01.mov")][0].version, 1);
check("creative is the token left of the artwork type", creativeOfName("SF_INTL_Trio_DOOH_RealPlazaCusco_1920x1080px_20s_PE"), "Trio");
check("market is the token after the length", marketOfName("SF_INTL_Trio_DOOH_RealPlazaCusco_1920x1080px_20s_PE_V01.mov"), "PE");

const job = { id: "J1", title: "SF Motion Outdoor PE 1", permalink: "https://wrike/J1", subTaskIds: ["S1"] };
const subs = { S1: { title: "SF_INTL_Trio_DOOH_RealPlazaCusco_1920x1080px_20s_PE", statusName: "Delivered" } };
const people = { REV: "Michael Sills", MO: "Antonio Burgello 🎬", PM: "Keeley ✨" };
const cusco = "SF_INTL_Trio_DOOH_RealPlazaCusco_1920x1080px_20s_PE";
const comments = {
  J1: [
    { id: "c1", authorId: "PM", at: "2026-09-20T09:00:00Z", text: `AMENDS\n\n${cusco}\nCTA\nCTA on Page 2 should be "Solo en cines"` },
    { id: "c2", authorId: "MO", at: "2026-09-28T09:00:00Z", text: `@Michael Sills renders for review:\n/Volumes/paramount/SF/Markets/Peru/Renders/Batch_01/${cusco}_V01.mov` },
    { id: "c3", authorId: "REV", at: "2026-09-29T09:00:00Z", text: review },
    { id: "c4", authorId: "MO", at: "2026-09-29T15:00:00Z", text: `Hey @Michael Sills , amended renders below:\n${cusco}_V02.mov\n\nFixed the Date poking through before animating in.` },
    { id: "c5", authorId: "REV", at: "2026-09-30T09:00:00Z", text: `${cusco}_V02.mov\n:small_orange_diamond: This still does it with the date poking through in the bottom left` },
  ],
};
const out = buildAmends({ jobs: [job], subs, comments, people, motionIds: ["MO"] });
const mine = out.notes.filter((n) => n.name === cusco);
check("a render sent with nothing said makes no note", out.notes.filter((n) => n.at === "2026-09-28T09:00:00Z").length, 0);
check("what was written before Motion started is marked", mine.filter((n) => n.pre).map((n) => n.kind), ["content"]);
check("the reviewer's notes are review amends, in order", mine.filter((n) => !n.pre && n.kind === "review").map((n) => n.version), [1, 2]);
check("a Motion member naming deliverables is replying", mine.filter((n) => n.kind === "fix").map((n) => n.who), ["Antonio Burgello"]);
check("a note carries its deliverable's status and parts", [mine[1].status, mine[1].site, mine[1].size, mine[1].length, mine[1].market], ["Delivered", "RealPlazaCusco", "1920x1080", "20s", "PE"]);
check("'please' is not an animation note", buildAmends({ jobs: [job], subs, people, motionIds: ["MO"], comments: { J1: [comments.J1[1], { id: "c9", authorId: "REV", at: "2026-10-01T09:00:00Z", text: `${cusco}_V02.mov\nPlease darken behind the bugs` }] } }).notes[0].themes, ["Artwork / colour"]);
