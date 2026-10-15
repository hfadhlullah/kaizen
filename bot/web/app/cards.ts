import { store } from "./store.ts";
import { api } from "./api.ts";
import { avatar, el, toast } from "./dom.ts";
import { liveFrames, liveImgs } from "./live.ts";
import { mdNodes, mdTree } from "./markdown.ts";
import { bots, loadBots } from "./sidebar.ts";
import { upsert } from "./thread.ts";

export const TITLE = {
  idea: "Board",
  note: "Board",
  memory: "Memory",
  draft: "Draft",
  start_run: "Run",
  decision: "Run",
  fix: "Run",
  abort: "Run",
  computer: "Computer",
};
const SANDBOX = {
  starting: "Starting the sandbox",
  running: "Running in the sandbox",
  stopping: "Saving files, then removing the sandbox",
  stopped: "Stopped · sandbox removed",
  error: "Error",
};
export const PILL = {
  needed: "Action needed",
  working: "Working",
  done: "Done",
  declined: "Declined",
  failed: "Failed",
};
const STAGE = {
  plan: "Planning",
  build: "Building",
  review: "Review",
  done: "Done",
  abandoned: "Abandoned",
  starting: "Starting…",
};

async function act(a, body, btn) {
  if (btn) btn.disabled = true;
  try {
    upsert(await api(`/actions/${a.id}`, { method: "POST", body }));
  } catch (e) {
    toast(e.message);
    try {
      (await api(`/bots/${a.bot_id}/messages`)).actions.forEach(upsert);
    } catch {}
  } finally {
    if (btn) btn.disabled = false;
    loadBots();
  }
}
export function card(a) {
  // A memory save is a quiet line, not a card: the fact itself stays out of the thread.
  if (a.kind === "memory") {
    // A taught teammate since deleted reads as such, not as this agent. A fact written
    // into another agent's memory is shown, so a cross-agent write is never invisible.
    const to = a.body?.for ? bots.find((b) => b.id === a.body.for) : store.current;
    return el(
      "div",
      { class: "memline", id: `act-${a.id}` },
      "Updated memory for ",
      to ? el("span", { class: "who" }, avatar(to, "sm"), to.name) : "a deleted agent",
      a.body?.for && a.body.fact ? el("span", { class: "fact" }, `“${a.body.fact}”`) : null,
    );
  }
  const s = a.snapshot || {};
  const live = a.kind === "start_run" && s.launched;
  const c = el(
    "div",
    { class: a.status === "needed" || a.status === "working" ? "act pin" : "act", id: `act-${a.id}` },
    el(
      "div",
      { class: "hd" },
      el("b", {}, TITLE[a.kind] || "Action"),
      el("span", { class: `pill ${a.status}` }, live && a.status === "needed" ? "Waiting on you" : PILL[a.status]),
    ),
    el("div", { class: "desc" }, a.summary),
  );
  const acts = el("div", { class: "acts" });

  if (a.kind === "draft") {
    const view = el(
      "div",
      { class: "box" },
      el("div", { class: "k" }, `To: ${a.recipient}${a.subject ? ` · ${a.subject}` : ""}`),
      el("div", { class: "draft-body" }, a.draft_body),
    );
    c.append(view);
    if (a.status === "needed") {
      const to = el("input", { class: "f", value: a.recipient, "aria-label": "To" });
      const subj = el("input", { class: "f", value: a.subject, placeholder: "Subject", "aria-label": "Subject" });
      const body = el("textarea", { class: "f", "aria-label": "Body", rows: "6" });
      body.value = a.draft_body;
      const edit = el(
        "div",
        { class: "box", hidden: true },
        to,
        subj,
        body,
        el(
          "div",
          { class: "acts" },
          el(
            "button",
            {
              class: "btn",
              onclick: (e) =>
                act(a, { op: "edit", recipient: to.value, subject: subj.value, body: body.value }, e.currentTarget),
            },
            "Save",
          ),
        ),
      );
      c.append(edit);
      acts.append(
        el("button", { class: "btn pri", onclick: (e) => act(a, { op: "approve" }, e.currentTarget) }, "Approve"),
        el(
          "button",
          {
            class: "btn",
            onclick: () => {
              edit.hidden = !edit.hidden;
              view.hidden = !edit.hidden;
            },
          },
          "Edit",
        ),
        el("button", { class: "btn danger", onclick: (e) => act(a, { op: "decline" }, e.currentTarget) }, "Decline"),
      );
    }
    if (a.status === "done") {
      const copy = el(
        "button",
        {
          class: "btn",
          onclick: () =>
            navigator.clipboard
              .writeText([a.subject && `Subject: ${a.subject}`, a.draft_body].filter(Boolean).join("\n\n"))
              .then(() => {
                copy.textContent = "Copied";
                setTimeout(() => (copy.textContent = "Copy"), 1200);
              }),
        },
        "Copy",
      );
      acts.append(copy, el("span", { class: "note" }, "Approved. Nothing is sent: copy it and send it yourself."));
    }
  } else if (live) {
    // A started run, live: its stage and work list, then its questions when it waits on you.
    c.append(
      el(
        "div",
        { class: "note" },
        `${a.run_id ? `${a.run_id} · ` : ""}${STAGE[s.stage] || s.stage}${s.stalled ? " · stalled: no change in 30 minutes" : ""}`,
      ),
    );
    if (!a.run_id)
      c.append(
        el(
          "div",
          { class: "note" },
          s.unseen
            ? "Not seen on the board yet. Open it in the board to check the launch."
            : "Waiting for the run to appear on the board…",
        ),
      );
    if (s.items?.length)
      c.append(
        el(
          "div",
          { class: "box" },
          s.items.map((it) =>
            el(
              "div",
              { class: `tick ${it.state}` },
              el("i", { "aria-hidden": "true" }, it.state === "done" ? "✓" : it.state === "doing" ? "•" : "○"),
              it.text,
            ),
          ),
        ),
      );
    if (s.verdict && (a.status === "done" || s.awaiting === "approvals.review"))
      c.append(el("div", { class: "note" }, s.verdict));
    if (a.status === "needed" && s.awaiting) {
      const decides = s.awaiting === "approvals.plan" || s.awaiting === "approvals.review";
      const fixes = s.awaiting === "approvals.review" || s.awaiting === "findings";
      if (s.work?.length)
        c.append(
          el(
            "div",
            { class: "box" },
            el("div", { class: "k" }, "Work list"),
            s.work.map((w) => el("div", {}, `• ${w}`)),
          ),
        );
      if (s.doc)
        c.append(
          el(
            "details",
            { class: "box" },
            el("summary", {}, s.awaiting === "approvals.plan" ? "Read the plan" : "Read the review"),
            el("div", { class: "md" }, mdTree(s.doc).map(mdNodes)),
          ),
        );
      const checks = fixes
        ? (s.open || []).map((f) => ({
            n: f.n,
            box: el("input", { type: "checkbox", "aria-label": `Finding ${f.n}` }),
            text: f.text,
          }))
        : [];
      if (checks.length)
        c.append(
          el(
            "div",
            { class: "box" },
            el("div", { class: "k" }, "Open findings — tick the ones to fix"),
            checks.map((f) => el("label", { class: "tick" }, f.box, ` ${f.n}. ${f.text}`)),
          ),
        );
      if (checks.length)
        acts.append(
          el(
            "button",
            {
              class: decides ? "btn" : "btn pri",
              onclick: (e) => {
                const nums = checks.filter((f) => f.box.checked).map((f) => f.n);
                if (!nums.length) {
                  toast("Tick the findings to fix first");
                  return;
                }
                act(a, { op: "fix", nums }, e.currentTarget);
              },
            },
            "Fix selected",
          ),
        );
      if (decides) {
        const picks = (s.questions || []).map((q) => ({
          q,
          sel: el(
            "select",
            { class: "f", "aria-label": q.q },
            q.options.map((o) => el("option", { value: o.replace(/ \(recommended\)$/, "") }, o)),
          ),
        }));
        for (const { q, sel } of picks) c.append(el("div", { class: "q" }, el("span", { class: "note" }, q.q), sel));
        const why = el("textarea", {
          class: "f",
          placeholder: "What should change? (needed to revise)",
          "aria-label": "Revise comment",
          rows: "2",
        });
        c.append(why);
        acts.prepend(
          el(
            "button",
            {
              class: "btn pri",
              onclick: (e) =>
                act(a, { op: "decide", approve: true, answers: picks.map((p) => p.sel.value) }, e.currentTarget),
            },
            s.awaiting === "approvals.plan" ? "Approve plan" : "Approve work",
          ),
          el(
            "button",
            {
              class: "btn",
              onclick: (e) => {
                if (!why.value.trim()) {
                  why.focus();
                  toast("Say what to change first");
                  return;
                }
                act(a, { op: "decide", approve: false, why: why.value }, e.currentTarget);
              },
            },
            "Revise",
          ),
        );
      } else if (!fixes) c.append(el("div", { class: "note" }, "Answer this one where the run is running."));
    }
  } else if (a.kind === "computer" && a.status !== "needed") {
    // A computer task: its sandbox state live, then the files it brought back.
    const secs = s.ms?.total ? ` · ${(s.ms.total / 1000).toFixed(1)} s` : "";
    c.append(
      el("div", { class: "note" }, `${SANDBOX[s.state] || (a.status === "declined" ? "Not run" : "Waiting")}${secs}`),
    );
    const files = s.artifacts || [];
    if (files.length)
      c.append(
        el(
          "div",
          { class: "box" },
          files.map((f) => {
            const href = `/actions/${a.id}/artifacts/${encodeURIComponent(f.name)}`;
            return el(
              "div",
              {},
              f.type === "image/png"
                ? el("img", {
                    src: `${href}?inline`,
                    alt: `Screenshot ${f.name}`,
                    style: { maxWidth: "100%", display: "block", borderRadius: "6px" },
                  })
                : null,
              el("a", { href, download: f.name }, `${f.name} (${Math.max(1, Math.round(f.bytes / 1024))} KB)`),
            );
          }),
        ),
      );
    if (s.proxy?.denied)
      c.append(
        el(
          "div",
          { class: "note" },
          `${s.proxy.denied} request${s.proxy.denied > 1 ? "s" : ""} outside the allowlist ${s.proxy.denied > 1 ? "were" : "was"} blocked.`,
        ),
      );
    // The sandbox's screen, live while it runs: the server says when a new frame is in, and
    // the last one is kept here so a redraw of the card does not blank it.
    // The <img> plays the server's MJPEG stream; it is kept across card redraws so the
    // video does not restart on every state change.
    if (a.status === "working") {
      const f = liveFrames.get(a.id);
      let img = liveImgs.get(a.id);
      if (!img) {
        img = el("img", {
          id: `live-${a.id}`,
          alt: "The sandbox's screen, live",
          hidden: true,
          style: {
            width: "100%",
            aspectRatio: "1280 / 800",
            display: "block",
            borderRadius: "6px",
            background: "var(--line)",
          },
        });
        liveImgs.set(a.id, img);
      }
      if (f && !img.src) {
        img.src = `/actions/${a.id}/live.mjpeg`;
        img.hidden = false;
      }
      c.append(
        el(
          "div",
          { class: "box" },
          el("div", { class: "k" }, "Live screen · view only"),
          el(
            "div",
            { id: `step-${a.id}`, class: "note", "aria-live": "polite" },
            s.state === "stopping"
              ? "Browsing done. Saving the files, then removing the sandbox."
              : f?.step || (s.state === "starting" ? "Starting the sandbox…" : "Waiting for the screen…"),
          ),
          el(
            "a",
            {
              href: `/actions/${a.id}/live.mjpeg`,
              target: "_blank",
              rel: "noopener",
              title: "Open the live screen full size",
            },
            img,
          ),
        ),
      );
    } else if (liveImgs.has(a.id)) {
      liveImgs.get(a.id).src = "";
      liveImgs.delete(a.id);
    }
    if (a.status === "working")
      acts.append(
        el("button", { class: "btn danger", onclick: (e) => act(a, { op: "cancel" }, e.currentTarget) }, "Cancel"),
      );
  } else if (a.gated && a.status === "needed") {
    acts.append(
      el("button", { class: "btn pri", onclick: (e) => act(a, { op: "approve" }, e.currentTarget) }, "Approve"),
      el("button", { class: "btn", onclick: (e) => act(a, { op: "decline" }, e.currentTarget) }, "Decline"),
    );
  }
  if ((a.status === "failed" || a.status === "declined") && a.result) c.append(el("div", { class: "note" }, a.result));
  if (a.link) acts.append(el("a", { class: "btn", href: a.link, target: "_blank", rel: "noopener" }, "Open in board"));
  if (acts.childNodes.length) c.append(acts);
  return c;
}
