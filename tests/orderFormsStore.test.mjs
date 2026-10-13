import { fileKey, shareable, reconcile } from "../src/lib/orderForms/store.js";

const film = (over = {}) => ({
  id: "universal-forgotten-island-motion",
  name: "Universal · Forgotten Island · Motion",
  source: { clientId: "universal", filmKey: "forgotten island|motion" },
  loadedAt: "2026-10-13T10:00:00Z",
  markets: [],
  ...over,
});

check("a Google film's key is its studio and film, the same for everyone", fileKey(film()), "universal-forgotten-island-motion");
check("a dropped workbook's key is its name", fileKey({ name: "Ebenezer (OOH).xlsx" }), "file-ebenezer-ooh");
check("change markers are not shared", "changes" in shareable(film({ changes: { NZ: {} } })), false);

const order = (title, status = "requested") => ({ tab: "T", row: 1, status, deliveryDeadline: "2026-11-01", xyi: { title } });

{
  const seen = film({ markets: [{ name: "NZ", orders: [order("F_A_B_NZ")] }] });
  const newer = film({ loadedAt: "2026-10-13T12:00:00Z", markets: [{ name: "NZ", orders: [order("F_A_B_NZ", "confirmed"), order("F_C_D_NZ")] }] });
  const got = reconcile([seen], [newer]);
  check("someone else refreshed: this person sees what changed since they looked",
    [got.files[0].changes.NZ.added, got.files[0].changes.NZ.confirmed], [["T|f_c_d_nz"], ["T|f_a_b_nz"]]);
  check("nothing to share or forget", [got.seed, got.forget], [[], []]);

  const unchanged = reconcile([film({ changes: { NZ: { added: ["x"], confirmed: [], moved: [], removed: 0 } } })], [film()]);
  check("not read again: markers not yet looked at are kept", unchanged.files[0].changes.NZ.added, ["x"]);
  check("a film this browser hasn't seen has no markers", "changes" in reconcile([], [film()]).files[0], false);
}

{
  const legacy = film({ id: "mf3k2-ab12cd" });
  const got = reconcile([legacy], []);
  check("a film loaded before sharing is shared once, under its shared id", [got.seed.map((f) => f.id), got.forget, got.files.map((f) => f.id)],
    [["universal-forgotten-island-motion"], ["mf3k2-ab12cd"], ["universal-forgotten-island-motion"]]);
  check("unless someone has shared that film already", reconcile([legacy], [film({ loadedAt: "2026-10-14T09:00:00Z" })]).seed, []);
  check("a film someone removed is dropped here, not shared again", [reconcile([film()], []).forget, reconcile([film()], []).seed], [["universal-forgotten-island-motion"], []]);
}

check("newest first", reconcile([], [film({ id: "a", loadedAt: "2026-10-01T00:00:00Z" }), film({ id: "b", loadedAt: "2026-10-09T00:00:00Z" })]).files.map((f) => f.id), ["b", "a"]);

{
  const stuck = film({ unshared: true, changes: { NZ: {} } });
  const got = reconcile([stuck], []);
  check("a film that couldn't be shared when it was loaded is shared the next time, not dropped",
    [got.seed.map((f) => f.id), got.forget, "unshared" in got.seed[0], "changes" in got.seed[0]],
    [["universal-forgotten-island-motion"], [], false, false]);
}
