// The run picker at the top of the workspace's run panel (#ppick, popover #ppop): the runs not
// over (waiting on you first), then History. run-view.ts decides which run the panel shows.
import { $, html } from "./dom.ts";
import { key } from "./cards.ts";
import { age } from "./labels.ts";
import { awaiting, dueWord, gitDue } from "./ws-tabs.ts";
import { stateOf, titleOf } from "./workspace.ts";

let sig = "";
export const setOpen = (on: boolean) => {
  $("ppop").hidden = !on;
  $("ppick").setAttribute("aria-expanded", String(on));
};
export const drawPick = (live: any[], hist: any[], cur: any) => {
  const now = Date.now(),
    other = live.some((c) => c !== cur && awaiting(c)),
    row = (c) => html`<button type="button" role="option" class="pk${c === cur ? " on" : ""}" aria-selected="${String(c === cur)}" data-pk="${key(c)}"><span class="si ${stateOf(c)}"></span><b>${titleOf(c)}</b><small>${gitDue(c) ? `waiting on you · ${dueWord(c)}` : awaiting(c) ? "needs you" : c.status} · ${age(c.moved ?? now, now)}</small></button>`;
  const out = String(html`${live.map(row)}${hist.length ? html`<b class="mh">History</b>${hist.map(row)}` : ""}`);
  const label = String(html`<span class="si ${stateOf(cur)}"></span><b>${titleOf(cur)}</b>${other ? html`<i class="pdot" title="Another run needs you"></i>` : ""}<svg class="fchev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
  if (sig === out + label) return;
  sig = out + label;
  $("ppop").innerHTML = out;
  $("ppick").innerHTML = label;
};
export const hidePick = () => ((sig = ""), setOpen(false));
// Wires the trigger once: a click on a row calls pick(key); Esc and a press outside close it.
export function initPick(pick: (k: string) => void) {
  $("ppick").onclick = () => setOpen($("ppop").hidden);
  $("ppop").onclick = (e) => {
    const k = (e.target as Element).closest<HTMLElement>("[data-pk]")?.dataset.pk;
    if (!k) return;
    setOpen(false);
    pick(k);
  };
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("ppop").hidden) (setOpen(false), $("ppick").focus());
  });
  addEventListener("pointerdown", (e) => {
    if (!$("ppop").hidden && !(e.target as Element).closest?.(".pwrap")) setOpen(false);
  });
}
