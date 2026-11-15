// The board footer's data (Zustand): what Claude and Codex have used and whether a phone is on the tailnet. The footer
// (components/footer/foot-bar.tsx) draws it, with the live terminal count from the server store (lib/server).
import { create } from "zustand";
import type { Usage } from "@lib/phone";
import { phoneStatus, type PhoneStatus } from "./footer-rules.ts";

export const useFooter = create<{ usage: Usage[] | null; phone: PhoneStatus | null; refreshing: boolean }>()(() => ({
  usage: null,
  phone: null,
  refreshing: false,
}));

// A refresh asked for (the button) spins its icon until the answer is in, and for at least SPIN_MS so a fast answer still shows.
const SPIN_MS = 700;
export async function loadUsage(refresh = false) {
  const t = Date.now();
  if (refresh) useFooter.setState({ refreshing: true });
  try {
    const r = await fetch("/usage" + (refresh ? "?refresh=1" : ""));
    if (r.ok) useFooter.setState({ usage: await r.json() });
  } catch {
    /* the footer keeps what it had */
  } finally {
    if (refresh) {
      await new Promise((done) => setTimeout(done, Math.max(0, SPIN_MS - (Date.now() - t))));
      useFooter.setState({ refreshing: false });
    }
  }
}
export async function loadPhone() {
  try {
    useFooter.setState({ phone: phoneStatus(await (await fetch("/phone")).json()) });
  } catch {}
}
// Read once, then usage every 5 minutes and the phone every minute. Returns the function that stops them.
export function startFooter() {
  void loadUsage();
  void loadPhone();
  const a = setInterval(() => void loadUsage(), 5 * 60_000),
    b = setInterval(() => void loadPhone(), 60_000);
  return () => (clearInterval(a), clearInterval(b));
}
