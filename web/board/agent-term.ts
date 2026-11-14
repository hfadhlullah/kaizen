import { termLoad } from "@lib/run";
import { load } from "./api.ts";
import { $ } from "./dom.ts";

// again: something changed on the server, so the doc is read afresh: a note sent, a plan
// written or a commit made elsewhere shows in nothing the page already holds. One /run
// fetch per change while a run panel is open; a tab switch reuses the doc.
// ---- the in-card agent (agent.launch: card). xterm.js is loaded the first time a
// terminal is shown. One terminal is mounted at a time, in #pbody; a refresh that
// finds it already showing this session leaves it alone, so it never reconnects.
let termKey = null,
  termOff = null;
export const where = (r) => (r.pty ? "running in its workspace" : "opened in your terminal");
// The script loader moved to lib/run/term-loader.ts; the Home window and the Terminal page still import it from here.
export { termLoad };
export function termStop() {
  if (termOff) termOff();
  termOff = null;
  termKey = null;
  $("panel").classList.remove("wide");
}
export async function showTerm(c) {
  const k = c.pty.key;
  if (termKey === k && $("pbody").querySelector(".term")) return;
  termStop();
  termKey = k;
  $("panel").classList.add("wide");
  $("pbody").innerHTML = `<div class="term" aria-label="Agent terminal"></div>`;
  let mount;
  try {
    mount = await termLoad();
  } catch {
    $("pbody").innerHTML = `<p style="color:var(--dim)">The terminal could not load.</p>`;
    return;
  }
  if (termKey !== k) return;
  termOff = mount($("pbody").querySelector(".term"), k, () => load(true));
}
