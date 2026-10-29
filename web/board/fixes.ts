import { store } from "./store.ts";
import { where } from "./agent-term.ts";
import { post } from "./api.ts";
import { key, via } from "./cards.ts";
import { $, html, raw } from "./dom.ts";
import { md } from "./markdown.ts";
import { openRun } from "./panel.ts";
import { askNotify, toast } from "./toast.ts";

// Fix picked findings, under the review: open ones ticked, closed and sent ones ticked but
// locked. Unticked and sent findings live outside the form, which every refresh rebuilds,
// keyed "run:number"; sent ones also survive a reload of this tab. A finding is one line,
// so md() gives one paragraph; its wrapper is dropped to sit inline in the label.
export const SK = "kz-sent",
  fixOff = new Set(),
  fixSent = new Set(
    (() => {
      try {
        return JSON.parse(sessionStorage.getItem(SK)) || [];
      } catch (e) {
        return [];
      }
    })(),
  );
export function fixForm(c) {
  const k = (n) => c.id + ":" + n,
    sent = (f) => fixSent.has(k(f.n)),
    fs = store.runDoc.findings || [],
    open = fs.filter((f) => !f.done && !sent(f));
  if (
    c.archived ||
    !fs.some((f) => !f.done) ||
    !(c.status === "done" || c.awaiting === "findings" || c.awaiting === "approvals.review")
  )
    return;
  const el = document.createElement("div");
  el.className = "inl fix";
  el.innerHTML = html`<div class="q">Fix findings</div><div class="q dim">Opens your agent in this project, told to fix the ticked findings and recheck them.</div>${c.status === "waiting" ? html`<div class="q dim">An agent is already open on this run; the fix is sent to it when it runs in its card, else another one opens.</div>` : ""}${
    fs
      .map((f) => {
        const x = f.done ? " (closed)" : sent(f) ? " (sent)" : "";
        return html`<label class="${f.done ? "off done" : x ? "off" : ""}"><input type="checkbox" data-n="${f.n}" ${x ? "checked disabled" : fixOff.has(k(f.n)) ? "" : "checked"}><span>${f.n}. ${raw(md(f.text).replace(/^<p>|<\/p>$/g, ""))}${x}</span></label>`;
      })
}${open.length
      ? html`<div class="row"><button class="btn ghost" data-a="all"></button><button class="btn pri" data-a="s"></button></div>`
      : ""}`;
  if (!open.length) return $("pbody").appendChild(el);
  const go = el.querySelector("[data-a=s]"),
    allb = el.querySelector("[data-a=all]"),
    picks = () => open.filter((f) => !fixOff.has(k(f.n))).map((f) => f.n);
  const sync = () => {
    const n = picks().length;
    go.textContent = n === open.length ? "Fix all " + n : "Fix " + n + " selected";
    go.disabled = !n;
    allb.textContent = n === open.length ? "Select none" : "Select all";
    el.querySelectorAll("input:not(:disabled)").forEach((i) => (i.checked = !fixOff.has(k(i.dataset.n))));
  };
  el.onchange = (e) => {
    const n = k(e.target.dataset.n);
    e.target.checked ? fixOff.delete(n) : fixOff.add(n);
    sync();
  };
  allb.onclick = () => {
    const none = picks().length === open.length;
    open.forEach((f) => (none ? fixOff.add(k(f.n)) : fixOff.delete(k(f.n))));
    sync();
  };
  go.onclick = async () => {
    const nums = picks();
    go.disabled = true;
    askNotify();
    const r = await post("/fix", { dir: c.state, id: c.id, nums });
    // Sent findings lock as sent, so a second press cannot open a second agent on them.
    if (r.ok) {
      toast(
        "Fixing " + nums.length + " finding" + (nums.length === 1 ? "" : "s") + ", " +
          (r.reused ? "sent to the agent already open in its card" : where(r) + ": " + via(r.agent)),
      );
      if (r.pty) store.wantTerm = key(c);
      nums.forEach((n) => fixSent.add(k(n)));
      try {
        sessionStorage.setItem(SK, JSON.stringify([...fixSent]));
      } catch (e) {}
      openRun(c, true);
    } else sync();
  };
  sync();
  $("pbody").appendChild(el);
}
