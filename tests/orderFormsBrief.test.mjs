// A batch's brief from its market folder's description template. Two layouts
// of the same template, as Wrike's editor might write it: lines broken with
// <br />, and lines as paragraphs. The film and paths are invented.
import { readTemplate, fillTemplate, suggestFolder, tokenize, fieldKey, briefDefaults, batchDescription } from "../src/lib/orderForms/briefTemplate.js";

const BR = [
  `<u><i>____Job setup____</i></u><br />`,
  `<ul class="checklist"><li>Reporting: Parent task <b>NO</b> / subtask <b>YES</b></li><li>No more than 15 subtasks on average.</li></ul>`,
  `<u><i>__Delete all above__</i></u><br /><br />`,
  `<b>Notes:</b> <span style="color:#e53935"><i>PM to edit/update</i></span><br />`,
  `<ul><li><b>CTA:</b><ul><li></li></ul></li></ul>`,
  `----------------<br /><br />`,
  `<b>Folder:</b><br /><br />`,
  `<b>Master PDF's:</b><br />/Volumes/paramount/Night_Out/Digital/INT/XY000101_INTL_DIGITAL_Outdoor_Campaign_Masters/PDFs<br /><br />`,
  `<b>Master Renders:</b><br />/Volumes/paramount/Night_Out/Digital/INT/XY000101_INTL_DIGITAL_Outdoor_Campaign_Masters/Renders<br /><br />`,
  `<b>Specs:</b><br /><br />----------------<br /><br />`,
  `<b><span style="background-color:#c8e6c9">Delivery Checklist:</span></b><br />`,
  `<ul class="checklist"><li>TXTD Refs - see PDF specs</li><li>AM - please upload to ENT</li></ul>`,
  `<b>Link to the upload server:</b><br />/Volumes/uploads/Upload_To_ENT_New/Night_Out/Outdoor/DOOH`,
].join("");

const P = [
  `<p><u>Job setup</u></p><p>Reporting: Parent task NO</p><p><i>Delete all above</i></p>`,
  `<p><b>Notes:</b> PM to edit/update</p>`,
  `<p><b>Folder:</b></p>`,
  `<p><b>Master PDF's:</b></p><p>/Volumes/paramount/Night_Out/Digital/INT/XY000101_INTL_DIGITAL_Outdoor_Campaign_Masters/PDFs</p>`,
  `<p><b>Specs:</b> see the PDF</p>`,
].join("");

const br = readTemplate(BR);
check("job setup is dropped, the brief starts after the marker", [br.trimmed, br.tokens.some((t) => /Job setup|Reporting/.test(t.raw))], [true, false]);
check("its fields, in order", br.fields.map((f) => f.label), ["Notes", "CTA", "Folder", "Master PDF's", "Master Renders", "Specs", "Link to the upload server"]);
check("the delivery checklist is a heading over its checkboxes, not a field", br.fields.some((f) => f.key === "deliverychecklist"), false);
check("where each value sits", br.fields.map((f) => f.at.kind), ["inline", "empty", "empty", "next", "next", "empty", "next"]);
check("a path under its label is its value", br.fields.find((f) => f.key === "masterpdfs").value, "/Volumes/paramount/Night_Out/Digital/INT/XY000101_INTL_DIGITAL_Outdoor_Campaign_Masters/PDFs");
check("the PM's hint is a hint, not a value", [br.fields[0].value, br.fields[0].hint], ["", "PM to edit/update"]);
check("labels compare without punctuation", [fieldKey("Master PDF's"), fieldKey("Master PDFs")], ["masterpdfs", "masterpdfs"]);

// Nothing given: the template as it stands, less the job setup and the hint.
const plain = fillTemplate(br, {});
check("unfilled, the hint goes and everything else stays", [plain.includes("PM to edit"), plain.includes('<ul class="checklist"><li>TXTD Refs'), plain.includes("background-color:#c8e6c9")], [false, true, true]);
check("no orphan closing tags at the top", plain.startsWith("<b>Notes:</b>"), true);

const filled = fillTemplate(br, {
  notes: "Teaser one-sheet, 2 sizes",
  cta: "IN CINEMAS SOON",
  folder: "/Volumes/paramount/Night_Out/Digital/INT/XY000102_INTL_DIGITAL_Outdoor_Campaign_Markets/Bulgaria",
  specs: "Line one\nLine <two>",
  masterrenders: "/Volumes/x/Renders",
});
check("an inline value replaces the hint, outside the label's bold", filled.includes("<b>Notes:</b> Teaser one-sheet, 2 sizes<br />"), true);
check("a list label's value goes after its colon", filled.includes("<b>CTA:</b> IN CINEMAS SOON<ul>"), true);
check("an empty label's value goes on the line under it", filled.includes("<b>Folder:</b><br />/Volumes/paramount/Night_Out/Digital/INT/XY000102_INTL_DIGITAL_Outdoor_Campaign_Markets/Bulgaria<br />"), true);
check("a value under its label is replaced", filled.includes("<b>Master Renders:</b><br />/Volumes/x/Renders<br />"), true);
check("lines kept, and text escaped", filled.includes("<b>Specs:</b><br />Line one<br />Line &lt;two&gt;<br />"), true);
check("a value not given keeps the template's", filled.includes("XY000101_INTL_DIGITAL_Outdoor_Campaign_Masters/PDFs"), true);

const p = readTemplate(P);
check("paragraphs: the same fields", p.fields.map((f) => [f.key, f.at.kind]), [["notes", "inline"], ["folder", "empty"], ["masterpdfs", "next"], ["specs", "inline"]]);
const pFilled = fillTemplate(p, { folder: "/F", specs: "updated" });
check("paragraphs: filled in place", [pFilled.includes("<p><b>Folder:</b><br />/F</p>"), pFilled.includes("<p><b>Specs:</b> updated</p>"), pFilled.startsWith("<p><b>Notes:</b>")], [true, true, true]);

check("the batch's folder, from the masters' path and the markets' job", suggestFolder(br, "XY000102_INTL_DIGITAL_Outdoor_Campaign_Markets", "Bulgaria 🇧🇬"),
  "/Volumes/paramount/Night_Out/Digital/INT/XY000102_INTL_DIGITAL_Outdoor_Campaign_Markets/Bulgaria");
check("no masters' path, no suggestion", suggestFolder(p, "", "Bulgaria"), "");

// What runs is dropped: a brief is shown on the page.
const evil = tokenize(`<b onclick="x()">A</b><script>alert(1)</script><a href="javascript:alert(1)">l</a><img src=x onerror=alert(1)>`).map((t) => t.raw).join("");
check("scripts, handlers and javascript: links go", [/script|onclick|onerror|javascript:/i.test(evil), evil.includes("<b>A</b>")], [false, true]);
check("no template marker: the whole description is the brief", readTemplate("<b>Folder:</b><br />").trimmed, false);

// A batch's description: its own values over the template's, with its folder worked out.
const folder = suggestFolder(br, "XY000102_INTL_DIGITAL_Outdoor_Campaign_Markets", "Bulgaria");
check("the folder starts as the one worked out", briefDefaults(br, folder).folder, folder);
check("a saved value wins", batchDescription(br, folder, { folder: "/Mine" }).includes("<b>Folder:</b><br />/Mine<br />"), true);
check("nothing saved: the worked-out folder is in it", batchDescription(br, folder).includes(folder), true);
