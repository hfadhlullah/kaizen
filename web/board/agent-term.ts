import { load } from "./api.ts";
import { $ } from "./dom.ts";
import { react } from "./views.ts";

// ---- the in-card agent (agent.launch: card). The terminal is React (components/panes/terminal-pane.tsx, drawn by
// react-mount.ts drawTerm into #pbody). One terminal is mounted at a time; a refresh that finds it already showing this
// session leaves it alone, so it never reconnects.
let termKey = null;
export function termStop() {
  if (termKey) react.drawTerm(null);
  termKey = null;
  $("panel").classList.remove("wide");
}
export function showTerm(c) {
  const k = c.pty.key;
  if (termKey === k && $("pbody").querySelector(".term")) return;
  termStop();
  termKey = k;
  $("panel").classList.add("wide");
  react.drawTerm({ key: k, onEnd: () => load(true) });
}
