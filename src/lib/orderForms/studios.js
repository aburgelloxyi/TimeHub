// The studios Client Orders groups films under, and the one a PM last worked in.
// CLIENTS are the studios with Drive folders; the extras have a card before they
// have a folder. Files dropped on the page belong to no studio.
import { CLIENTS } from "./driveTree";

export const EXTRA_STUDIOS = [{ id: "amazonmgm", label: "Amazon MGM" }];

export const studioOf = (file) => file?.source?.clientId || "dropped";

export const studioLabel = (id) =>
  CLIENTS.find((c) => c.id === id)?.label || EXTRA_STUDIOS.find((s) => s.id === id)?.label || "Dropped files";

// One film however its order forms spell it: "Focker In-Law" and "Focker In Law" are the same film.
export const filmKey = (title) => String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// A film's order forms are either Motion or Print; older files only say so in their name.
export const mediumOf = (file) =>
  file?.kind === "print" || /print/i.test(String(file?.name || "")) ? "Print" : "Motion";

// The studio left open, or none. PMs mostly stay in one, so the page opens the way it was left: on that
// studio's films, or on the studio cards if it was closed.
const STORE = "orderforms.studio";

export const storedStudio = () => {
  try { return localStorage.getItem(STORE); } catch { return null; }
};

export const storeStudio = (id) => {
  try {
    if (id) localStorage.setItem(STORE, id);
    else localStorage.removeItem(STORE);
  } catch { /* private mode: the page opens on the studio cards */ }
};
