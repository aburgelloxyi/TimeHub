// Reading a market's brief template from Wrike, and giving a batch task its
// description. The template is the market folder's description, copied from
// the film's _Market folder when the market's folder was made; if the market
// has no folder yet, or its description has lost the template's labels, the
// _Market folder's own is used.

import { planMarketFolderLive } from "./wrikeMarketFolder";
import { readTemplate } from "./briefTemplate";

const WRIKE = "/api/wrike";

async function wrikeData(path) {
  const res = await fetch(`${WRIKE}${path}`);
  if (!res.ok) throw new Error(`Wrike GET ${path} (${res.status})`);
  return (await res.json()).data || [];
}

const descriptionOf = async (folderId) => (await wrikeData(`/folders/${folderId}`))[0]?.description || "";

// { ok, html, source: "market" | "template", marketsJob, marketFolder } or { ok: false, reason }.
// `marketsJob` is the Markets job folder's title (it carries the job number),
// `marketFolder` the market's own folder's title: what the batch's Folder is worked out from.
export async function readBriefTemplate(request) {
  const place = await planMarketFolderLive(request);
  if (!place.ok) return { ok: false, reason: place.reason };
  const marketsJob = place.parent?.title || "";
  const marketFolder = place.existing?.title || place.title || "";
  if (place.existing) {
    const html = await descriptionOf(place.existing.id);
    if (readTemplate(html).fields.length) return { ok: true, html, source: "market", marketsJob, marketFolder };
  }
  const beside = place.parent ? await wrikeData(`/folders/${place.parent.id}/folders`) : [];
  const template = beside.find((f) => /^_market\b/i.test(String(f.title || "").trim()));
  if (template) {
    const html = await descriptionOf(template.id);
    if (html) return { ok: true, html, source: "template", marketsJob, marketFolder };
  }
  return { ok: false, reason: "Neither this market's folder nor the _Market folder beside it has a brief in its description." };
}

// Sent in the body, not the address: a filled brief is too long for a URL.
export async function setTaskDescription(taskId, html) {
  const res = await fetch(`${WRIKE}/tasks/${taskId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ description: html }),
  });
  if (!res.ok) throw new Error(`Wrike refused the description (${res.status})`);
}
