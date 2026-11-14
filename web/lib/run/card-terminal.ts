import { getServer, load } from "@lib/server";
import { getPanel, setPanel } from "./panel-store.ts";

// ---- the in-card agent (agent.launch: card). The terminal is React (components/panes/terminal-pane.tsx, drawn by
// pages/board/panel.tsx into #pbody). A terminal is mounted once per session and kept (`terms`), hidden while another body
// shows, so a tab or card switch never reconnects it and its screen and focus are as they were; it goes when its session does.
let termKey: string | null = null;
export function termStop() {
  if (termKey)
    setPanel((s) => (s.body === "term" ? { body: "", term: null, wide: false } : { term: null, wide: false }));
  termKey = null;
}
export function showTerm(c: { pty: { key: string } }) {
  const k = c.pty.key;
  if (termKey === k && getPanel().body === "term") return;
  termStop();
  termKey = k;
  setPanel((s) => ({
    body: "term",
    term: { key: k, onEnd: () => load(true) },
    wide: true,
    terms: s.terms.some((t) => t.key === k) ? s.terms : [...s.terms, { key: k, onEnd: () => load(true) }],
  }));
}
// A terminal whose session no card has any more is unmounted.
export function pruneTerms() {
  const live = new Set(
    getServer().state.cards.flatMap((c: any) => (c.pty ? [c.pty.key, ...(c.pty.all ?? [])] : [])) as string[],
  );
  const { terms } = getPanel();
  if (terms.some((t) => !live.has(t.key))) setPanel({ terms: terms.filter((t) => live.has(t.key)) });
}
