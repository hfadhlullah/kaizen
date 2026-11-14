import { load } from "./api.ts";
import { $ } from "./dom.ts";
import { setPanel } from "@lib/run";

// ---- the in-card agent (agent.launch: card). The terminal is React (components/panes/terminal-pane.tsx, drawn by
// pages/board/panel.tsx into #pbody). One terminal is mounted at a time; a refresh that finds it already showing this
// session leaves it alone, so it never reconnects.
let termKey = null;
export function termStop() {
  if (termKey) setPanel((s) => (s.body === "term" ? { body: "", term: null } : { term: null }));
  termKey = null;
  $("panel").classList.remove("wide");
}
export function showTerm(c) {
  const k = c.pty.key;
  if (termKey === k && $("pbody").querySelector(".term")) return;
  termStop();
  termKey = k;
  $("panel").classList.add("wide");
  setPanel({ body: "term", term: { key: k, onEnd: () => load(true) } });
}
