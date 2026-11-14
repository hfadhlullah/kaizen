// The board footer's data (Zustand): what Claude and Codex have used and whether a phone is on the tailnet. The footer
// (components/footer/foot-bar.tsx) draws it, with the live terminal count from the server store (lib/server).
import { create } from "zustand";
import type { Usage } from "@lib/phone";
import { phoneStatus, type PhoneStatus } from "./footer-rules.ts";

export const useFooter = create<{ usage: Usage[] | null; phone: PhoneStatus | null }>()(() => ({
  usage: null,
  phone: null,
}));

export async function loadUsage(refresh = false) {
  try {
    const r = await fetch("/usage" + (refresh ? "?refresh=1" : ""));
    if (r.ok) useFooter.setState({ usage: await r.json() });
  } catch {
    /* the footer keeps what it had */
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
