import { store } from "./store.ts";
import { where } from "./agent-term.ts";
import { post } from "./api.ts";
import { key, via } from "./cards.ts";
import { $, html } from "./dom.ts";
import { openRun } from "./panel.ts";
import { askNotify, toast } from "./toast.ts";

// Resume: a run whose in-card agent ended, or one stalled with no progress, gets its agent
// back on the run (its conversation, where the tool can resume one), in its card.
export const resumable = (c) => c.status === "stalled" || !!(c.pty && !c.pty.alive);
export async function resume(c, b) {
  b.disabled = true;
  askNotify();
  const r = await post("/resume", { dir: c.state, id: c.id });
  if (!r.ok) {
    b.disabled = false;
    return;
  }
  toast("Resumed, " + where(r) + ": " + via(r.agent));
  if (r.pty) store.wantTerm = key(c);
  if (store.openKey === key(c)) {
    $("pfoot").innerHTML = "";
    openRun(c, true);
  }
}
export const APPROVAL = {
    "approvals.plan": "Plan ready.",
    "approvals.review": "Ready to check.",
    findings: "Open findings.",
  },
  decided = new Set(),
  answer = (c) => key(c) + ":" + c.awaiting + ":" + c.moved;
export async function decide(c, b, why, answers) {
  b.disabled = true;
  askNotify();
  const r = await post("/decide", {
    dir: c.state,
    id: c.id,
    awaiting: c.awaiting,
    ...(why === undefined ? {} : { why }),
    ...(answers ? { answers } : {}),
  });
  // A failed send keeps the footer, and with it a typed comment.
  if (!r.ok) {
    b.disabled = false;
    return;
  }
  decided.add(answer(c));
  toast((why === undefined ? "Approved" : "Sent back") + ", " + where(r) + ": " + via(r.agent));
  if (r.pty) store.wantTerm = key(c);
  if (store.openKey === key(c)) {
    $("pfoot").innerHTML = "";
    openRun(c, true);
  }
}
export function confirmRevise(c) {
  const foot = $("pfoot"),
    plan = c.awaiting === "approvals.plan";
  foot.innerHTML = html`<div class="inl" style="flex:1"><div class="q">${plan ? "What should the plan do differently?" : "What should change in the work?"}</div><div class="q dim">Opens your agent on this run with your comment.${plan ? " It revises the plan and comes back here for approval." : " It changes the work, rechecks it and comes back here."}</div><textarea aria-label="Revise comment"></textarea><div class="row"><button class="btn ghost" data-a="c">Cancel</button><button class="btn pri" data-a="s">Send back</button></div></div>`;
  const inp = foot.querySelector("textarea");
  inp.focus();
  foot.querySelector("[data-a=c]").onclick = () => {
    foot.innerHTML = "";
    openRun(c, true);
  };
  foot.querySelector("[data-a=s]").onclick = (e) => {
    const why = inp.value.trim();
    if (!why) {
      toast("Say what should change");
      inp.focus();
      return;
    }
    decide(c, e.target, why);
  };
}
// The plan's questions, answered with the approval: the recommended option preselected,
// a note for what the options miss. Each answer reaches the agent as one line.
export function confirmAnswers(c, qs) {
  const foot = $("pfoot");
  foot.innerHTML = html`<div class="inl qa" style="flex:1"><div class="q">The plan asks ${qs.length === 1 ? "one question" : qs.length + " questions"}.</div><div class="q dim">Your answers go to your agent with the approval. It records them and builds the plan.</div>${qs.map((x, i) => html`<fieldset><legend>${x.q}</legend>${x.options.map((o, j) => html`<label><input type="${x.multi ? "checkbox" : "radio"}" name="q${i}" value="${j}"${o.rec || (!x.multi && !j && !x.options.some((p) => p.rec)) ? " checked" : ""}> ${o.text}</label>`)}<input type="text" data-n="${i}" placeholder="Note (optional)" aria-label="Note: ${x.q}"></fieldset>`)}<div class="row"><button class="btn ghost" data-a="c">Cancel</button><button class="btn pri" data-a="s">Approve with these answers</button></div></div>`;
  foot.querySelector("[data-a=c]").onclick = () => {
    foot.innerHTML = "";
    openRun(c, true);
  };
  foot.querySelector("[data-a=s]").onclick = (e) =>
    decide(
      c,
      e.target,
      undefined,
      qs.map((x, i) => {
        const picked =
            [...foot.querySelectorAll(`[name=q${i}]:checked`)]
              .map((n) => `"${x.options[+n.value].label}"`)
              .join(", ") || "none of the options",
          note = foot.querySelector(`[data-n="${i}"]`).value.trim();
        return `${x.q} — ${picked}${note ? "; " + note : ""}`;
      }),
    );
}
