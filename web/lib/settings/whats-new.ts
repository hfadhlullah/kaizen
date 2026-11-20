// What's New (cli/whats-new.ts): the installed version's highlights and fixes, shown as a card under Settings → General → About.
// It opens by itself the first time after an update (the Settings gear carries a dot until then), and the About bar's What's new
// button opens and closes it any time. Got it / Hide record it as seen on this machine, not just this browser.
import { create } from "zustand";
import { post } from "@lib/core";

type Entry = { version: string; highlights: { title: string; text: string }[]; fixes: string[] };
export type WhatsNew = {
  version: string;
  entry: Entry | null;
  next?: Entry | null; // the newest release's notes while it waits to be installed
  unseen: boolean;
};
// What the card shows: the newest release's notes while an update waits, else the installed version's.
export const shownEntry = (d: WhatsNew | null | undefined) => d?.next ?? d?.entry ?? null;
// open: null means "follow unseen", true / false is what the user chose.
export const useWhatsNew = create<{ data: WhatsNew | null; open: boolean | null }>()(() => ({
  data: null,
  open: null,
}));
export const loadWhatsNew = () =>
  fetch("/whats-new")
    .then((r) => (r.ok ? r.json() : null))
    .then((data: WhatsNew | null) => data && useWhatsNew.setState({ data }))
    .catch(() => {});
// Whether the card is showing: what the user chose, else whether this machine has not seen it yet. Nothing without an entry.
export const cardOpen = (s: { data: WhatsNew | null; open: boolean | null }) =>
  !!shownEntry(s.data) && (s.open ?? s.data!.unseen);
export const toggleWhatsNew = () => {
  const s = useWhatsNew.getState();
  if (cardOpen(s)) return void closeWhatsNew();
  useWhatsNew.setState({ open: true });
};
export async function closeWhatsNew() {
  useWhatsNew.setState({ open: false });
  const s = useWhatsNew.getState();
  if (!s.data?.unseen) return;
  const r = await post("/whats-new", {});
  if (r.ok) useWhatsNew.setState({ data: { ...s.data, unseen: false } });
}
