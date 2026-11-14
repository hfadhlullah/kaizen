// The board footer's data (Zustand): what Claude and Codex have used, whether a phone is on the tailnet, and how many
// terminals are live. The footer (components/footer/foot-bar.tsx) draws it; the board's own code (workspace.ts) reports the
// terminal count, since it reads the sessions.
import { create } from "zustand";
import type { Usage } from "@lib/phone";
import { phoneStatus, type PhoneStatus } from "./footer-rules.ts";

export const useFooter = create<{ usage: Usage[] | null; phone: PhoneStatus | null; terms: number }>()(() => ({
  usage: null,
  phone: null,
  terms: 0,
}));
export const setFooterTerms = (terms: number) => useFooter.setState({ terms });

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
