// A link that opens a Wrike task or folder.
//
// Wrike's links take the item's number (open.htm?id=4581665262), not the id
// the API uses (IEAFZXYZKRDKERKU, MAAAAAERNTTf); given an API id, Wrike
// opens the user's dashboard instead. The number is carried inside the API
// id, so a link can be made without asking Wrike: the older ids are base32
// with the number in their last four bytes, the newer ones base64 with it in
// every byte after the first. The shared cache drops stored permalinks (see
// useWrikeCache.js), so this is what most links are built from.

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const bytesOf = (text, alphabet, bitsPerChar) => {
  let bits = 0;
  let value = 0n;
  for (const ch of text) {
    const n = alphabet.indexOf(ch);
    if (n < 0) return null;
    value = (value << BigInt(bitsPerChar)) | BigInt(n);
    bits += bitsPerChar;
  }
  const out = [];
  for (let left = bits - 8; left >= 0; left -= 8) out.push(Number((value >> BigInt(left)) & 0xffn));
  return out;
};
const numberOf = (bytes) => bytes.reduce((n, b) => n * 256 + b, 0);

// The number in a Wrike API id, as a string, or "" when it isn't one.
export function wrikeNumber(id) {
  const s = String(id || "");
  if (/^\d+$/.test(s)) return s;
  if (/^[A-Z2-7]{16}$/.test(s)) {
    const bytes = bytesOf(s, BASE32, 5);
    return bytes ? String(numberOf(bytes.slice(-4))) : "";
  }
  if (/^[A-Za-z0-9+/_-]{12}$/.test(s)) {
    const bytes = bytesOf(s.replace(/-/g, "+").replace(/_/g, "/"), BASE64, 6);
    return bytes ? String(numberOf(bytes.slice(1))) : "";
  }
  return "";
}

// The item's own permalink when it has one, else one made from its id.
export function wrikeLink(item) {
  if (item?.permalink) return item.permalink;
  const number = wrikeNumber(item?.id);
  return number ? `https://www.wrike.com/open.htm?id=${number}` : "";
}

export const wrikeLinkForId = (id) => wrikeLink({ id });
