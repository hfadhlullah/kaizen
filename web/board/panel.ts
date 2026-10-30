import { store } from "./store.ts";
import { showTerm, termStop } from "./agent-term.ts";
import { load, post } from "./api.ts";
import { APPROVAL, answer, confirmAnswers, confirmRevise, decide, decided, resumable, resume } from "./approvals.ts";
import { cardEl, key, render, runPopup } from "./cards.ts";
import { chat } from "./chat.ts";
import { stopDictation } from "./dictation.ts";
import { $, html, raw } from "./dom.ts";
import { fixForm, fixOff } from "./fixes.ts";
import { gitPending, gitShown, gitTab } from "./git.ts";
import { ICON, WORD, need } from "./labels.ts";
import { attach, brief, md, planQuestions, preview, progress } from "./markdown.ts";
import { toast } from "./toast.ts";
import { go, view } from "./views.ts";
import { isPhone } from "./phone.ts";
import { openWorkspace } from "./run-view.ts";

// ---- detail panel
// A run's tabs, its phases in board order. A card opens on its column's tab.
const TABS = [
  ["Request", "request"],
  ["Notes", "notes"],
  ["Plan", "plan"],
  ["Backlog", "backlog"],
  ["Work", "impl"],
  ["Review", "review"],
  ["Source control", "git"],
  ["Preview", "preview"],
];
// keepTab: a link already chose the tab.
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
// "2026-10-18-board-ui-revision" or "board-ui-revision" reads "Board UI revision".
const readable = (t) =>
  /\s/.test(t)
    ? t
    : cap(
        t
          .replace(/^\d{4}-\d{2}-\d{2}-/, "")
          .split(/[-_]/)
          .map((w) => (/^(ui|ux|api|cli|ai|ci|id|url|pr|tui|ios|pwa)$/i.test(w) ? w.toUpperCase() : w))
          .join(" "),
      );
export function open(c, keepTab) {
  // A phone has no board: a card opens as its run workspace, which docks this panel.
  if (isPhone() && view !== "run") return void openWorkspace(c);
  // The run workspace docks this panel at its right: it stays there.
  if (view !== "board" && view !== "run" && view !== "ideas") go("board", true);
  stopDictation(true); // the panel body is about to be replaced
  fixOff.clear();
  store.openKey = key(c);
  $("panel").classList.add("open");
  $("scrim").classList.add("on");
  // A run is titled as its card is, its slug made readable; the id stays in the tooltip.
  $("ptitle").textContent = c.kind === "idea" ? brief(c.text).head : readable(c.title || c.text);
  $("ptitle").title = c.kind === "idea" ? "" : c.id || "";
  render();
  $("pterm").hidden = true;
  if (c.kind === "idea") {
    store.runDoc = null;
    $("psub").innerHTML = c.status === "starting" && !c.archived ? steps(c) : html`<span class="pst"><span class="st d-idea"><svg><use href="#s-idea"/></svg></span>Idea</span><span class="pst dim">${c.where.split(/[\\/]/).pop() || c.where}</span>`;
    $("ptabs").innerHTML = "";
    ideaBody(c);
    const foot = $("pfoot");
    foot.innerHTML = c.archived
      ? `<button class="btn pri" data-a="restore">Restore</button>`
      : c.status === "idea"
        ? `<button class="btn ghost danger" data-a="delete">Delete</button><button class="btn ghost" data-a="archive">Archive</button><span class="dec"><button class="btn" data-a="reject">Reject</button><button class="btn" data-a="edit">Edit</button><button class="btn pri" data-a="run">Run</button></span>`
        : `<span class="note">${c.pty ? "Starting: the agent runs below." : "Starting: a run was launched for this idea. No terminal with your agent? Run it again."}</span><span class="dec"><button class="btn" data-a="run">Run again</button></span>`;
    foot.querySelectorAll("[data-a]").forEach(
      (b) =>
        (b.onclick = () => {
          const a = b.dataset.a;
          if (a === "archive" || a === "restore") {
            toggleArchive(c, a === "archive");
            return;
          }
          // Over the page it is on, as Start does: no trip to the board.
          if (a === "run") return runPopup(c);
          const k = key(c);
          // The form lives on the board: the run workspace hands over to it.
          if (view === "run") go("board", true);
          close();
          store.mode = a;
          store.modeKey = k;
          render();
        }),
    );
    return;
  }
  if (!keepTab)
    store.lastTab = store.tab =
      c.status === "abandoned" ? "plan" : { 1: "plan", 2: "backlog", 3: "review", 4: "preview" }[c.column] || "request";
  return openRun(c, false);
}
// A building run's Backlog tab opens with its progress, above the deferred items. The
// first draw of a run animates nothing; later ones animate what moved, the bar included.
let lastProg = null;
function showProgress(c) {
  const src = c.column === 2 && store.runDoc.progress,
    prev = lastProg && lastProg.id === c.id ? lastProg : null,
    h = src ? progress(src, prev && prev.st) : "";
  if (!h) return;
  lastProg = {
    id: c.id,
    st: [...src.matchAll(/^\s*-\s*(todo|doing|done):/gm)].map((m) => m[1]),
    w: +/width:(\d+)%/.exec(h)[1],
  };
  $("pbody").innerHTML = html`${raw(h)}${store.runDoc.backlog ? html`<h3>Backlog</h3>${raw(md(store.runDoc.backlog, true))}` : ""}`;
  const bar = $("pbody").querySelector(".pbar i");
  if (prev && prev.w !== lastProg.w) {
    bar.style.width = prev.w + "%";
    bar.offsetWidth;
    bar.style.width = lastProg.w + "%";
  }
}
// The header's Plan → Build → Review → Done bar: steps before the card's column are done,
// its own is ringed in the run's status colour (waiting amber, stalled red), the rest wait.
const STEPS = ["Plan", "Build", "Review", "Done"];
function steps(c) {
  const at = c.status === "done" ? 4 : Math.max(0, (c.column || 0) - 1),
    tip = cap(WORD[c.status] || c.status) + (c.awaiting ? `: ${need(c.awaiting)}` : "");
  return html`<span class="steps s-${c.status}" title="${tip}" aria-label="${tip}">${raw(
    STEPS.map((n, i) => `<span class="${i < at ? "ok" : i === at ? "now" : ""}"><i></i>${n}</span>`).join(""),
  )}</span>`;
}
// The run workspace's header: the project beside the picker (runner, agent, mode in its
// tooltip), then the stage the run is in as one word and a bar that slides to it.
let lastAt = { id: "", w: 0 };
function meta(c) {
  let st: any = {};
  try {
    st = JSON.parse(store.runDoc?.state || "{}");
  } catch {}
  const proj = String(c.where || "").split(/[\\/]/).filter(Boolean).pop() || "";
  const at = c.status === "done" ? 3 : Math.min(3, Math.max(0, (c.column || 1) - 1)),
    word = STEPS[at] + (c.status === "waiting" ? ", needs you" : c.status === "stalled" ? ", stalled" : ""),
    w = c.status === "done" ? 100 : ((at + 0.5) / 4) * 100;
  const from = lastAt.id === c.id ? lastAt.w : 0;
  lastAt = { id: c.id, w };
  if (from !== w)
    requestAnimationFrame(() => {
      const i = $("psub").querySelector(".rprog i") as HTMLElement;
      if (!i) return;
      i.style.width = from + "%";
      i.offsetWidth;
      i.style.width = w + "%";
    });
  return html`<div class="rmeta" title="${[st.runner, st.agent, st.mode].filter(Boolean).join(", ")}">${proj}</div><div class="rprog s-${c.status}" title="${cap(WORD[c.status] || c.status) + (c.awaiting ? `: ${need(c.awaiting)}` : "")}"><span>${word}</span><b><i style="width:${w}%"></i></b></div>`;
}
// An idea's panel: its terminal while the run it started is being born there, else its notes.
export function ideaBody(c) {
  // In the run workspace the agent is a centre tab; on the Ideas page an idea shows its notes only.
  if (c.pty && view !== "run" && view !== "ideas") showTerm(c);
  else {
    termStop();
    chat(c, c.notes, c.archived || c.status !== "idea");
  }
}
export async function openRun(c, refresh, again) {
  if (!refresh || !store.runDoc || store.runDoc.id !== c.id || again) {
    const d = await fetch(`/run/${encodeURIComponent(c.id)}?dir=${encodeURIComponent(c.state)}`).then((r) => r.json());
    // Another card opened while this was fetched: its doc would redraw that card as this run.
    if (store.openKey !== key(c)) return;
    // A file list being confirmed, or a push under way, keeps the doc it was drawn from.
    if (refresh && $("pfoot").querySelector(".inl,[data-busy],.more[open]")) return;
    store.runDoc = d;
  }
  if (store.openKey !== key(c)) return;
  // The fetch above may have finished after a newer /state: draw the card as it is now
  // (a resumed agent's terminal, not the one that ended).
  c = store.S.cards.find((x) => key(x) === store.openKey) || c;
  // A refresh while notes are being typed would wipe the textarea.
  // The textarea is hidden under the rich editor: focus anywhere in the notes counts.
  if (refresh && $("pbody").querySelector(".notes")?.contains(document.activeElement)) return;
  // The board's own status mark, then what it waits on: chips, not a dotted line.
  $("psub").innerHTML = c.status === "abandoned" ? html`<span class="pst"><span class="st d-${ICON[c.status] || "idea"}"><svg><use href="#s-${ICON[c.status] || "idea"}"/></svg></span>${cap(WORD[c.status] || c.status)}</span>` +
    (c.awaiting ? html`<span class="pst dim">${cap(need(c.awaiting))}</span>` : "") +
    (c.parent ? html`<span class="pst link" title="Filed by this run">${c.parent}</span>` : "") : view === "run" || innerWidth > 640 ? meta(c) : steps(c);
  // Only tabs with something in them show. A card whose agent runs in the board gets its
  // terminal behind the header's terminal button, chosen once right after a launch from here.
  const tabs = TABS.filter(
    (t) =>
      t[1] === "request" ||
      t[1] === "notes" ||
      (t[1] === "git"
        ? gitShown(c)
        : t[1] === "preview"
          ? preview(store.runDoc.impl)
          : store.runDoc[t[1]] || (t[1] === "backlog" && c.column === 2 && store.runDoc.progress)),
  );
  if (store.wantTerm === key(c)) store.wantTerm = null;
  // The agent is a centre tab of the run workspace only: the panel never shows a terminal.
  if (store.tab === "term") store.tab = store.lastTab;
  // In the run workspace Preview is a centre tab, so the panel never shows it.
  if (view === "run" && store.tab === "preview") store.tab = "review";
  // A tab not written yet falls back to the latest one that is.
  if (store.tab !== "term" && !tabs.some((t) => t[1] === store.tab))
    store.tab = [...tabs].reverse().find((t) => t[1] !== "notes" && t[1] !== "git" && !(view === "run" && t[1] === "preview"))[1];
  if (store.tab !== "term") store.lastTab = store.tab;
  $("panel").classList.toggle("wide", store.tab === "term");
  const pt = $("pterm");
  pt.hidden = true;
  pt.classList.toggle("on", store.tab === "term");
  pt.setAttribute("aria-pressed", store.tab === "term");
  pt.title = pt.ariaLabel = store.tab === "term" ? "Close terminal" : "Terminal";
  pt.onclick = () => {
    store.tab = store.tab === "term" ? store.lastTab : "term";
    openRun(c, true);
  };
  $("ptabs").innerHTML = tabs
    .map((t) => html`<button class="${t[1] === store.tab ? "on" : ""}" data-k="${t[1]}" title="${t[0]}"><svg aria-hidden="true"><use href="#t-${t[1]}"/></svg><span>${t[0]}</span></button>`)
    .join("");
  [...$("ptabs").children].forEach(
    (b) =>
      (b.onclick = () => {
        // In the run workspace Preview is a centre tab, not a panel tab.
        if (view === "run" && b.dataset.k === "preview") return void dispatchEvent(new Event("kz-run-preview"));
        $("panel").classList.remove("pn");
        store.tab = b.dataset.k;
        openRun(c, true);
      }),
  );
  const k = store.tab,
    doc = k === "preview" ? preview(store.runDoc.impl) && attach(preview(store.runDoc.impl), c) : store.runDoc[k];
  if (k !== "term") termStop();
  if (k === "term") showTerm(c);
  else if (k === "notes") {
    const ro = c.archived || c.status === "done" || c.status === "abandoned";
    chat(c, doc, ro);
  } else if (k === "git") gitTab(c, refresh);
  else
    $("pbody").innerHTML = doc
      ? raw(md(doc, k === "backlog"))
      : html`<p style="color:var(--dim)">No ${{ request: "request", plan: "plan", impl: "work report", preview: "preview", review: "review", backlog: "backlog" }[k]} yet.</p>`;
  if (k === "backlog") showProgress(c);
  if (k === "review" && !c.healed) fixForm(c);
  // The notebook's notes that link here, each opening that note: above the run's own notes.
  if (k === "notes" && store.runDoc.linkedFrom && store.runDoc.linkedFrom.length)
    $("pbody").insertAdjacentHTML(
      "afterbegin",
      html`<h3>Linked from notes</h3><ul class="lnk">${store.runDoc.linkedFrom.map((n) => html`<li><a href="/notebook?dir=${encodeURIComponent(c.state)}&amp;note=${encodeURIComponent(n)}">${n}</a></li>`)}</ul>`,
    );
  // Only the panel the link asked for: another card opened meanwhile drops the mark.
  if (hit && !refresh) {
    if (hit.k === key(c)) mark(hit);
    else hit = null;
  }
  const foot = $("pfoot");
  // A refresh while the commit is being confirmed would wipe the message.
  if (refresh && foot.querySelector(".inl,[data-busy],.more[open]")) return;
  // Git work left on a finished run: the footer points at the Source control tab, which holds it.
  const arch =
    (k !== "git" && gitPending(c) ? `<button class="btn" data-a="gittab">Source control</button>` : "") +
    (c.archived
      ? `<button class="btn pri" data-a="restore">Restore</button>`
      : `<button class="btn ghost" data-a="archive">Archive</button>`);
  // A plan that asks questions takes their answers with the approval.
  // One the board cannot read is said, so it is answered in the terminal instead of skipped.
  const pq = c.status === "waiting" && c.awaiting === "approvals.plan" ? planQuestions(store.runDoc.plan) : [],
    qs = pq || [];
  // Its in-card agent ended on a waiting or done run: reopen that conversation, nothing sent.
  const rs = c.pty && !c.pty.alive ? `<button class="btn" data-a="resume">Resume session</button>` : "";
  if (c.archived) foot.innerHTML = raw(arch);
  else if (c.healed && c.awaiting === "approvals.review")
    foot.innerHTML = html`<span class="note">Finished by its agent without your approval. Nothing is committed until you approve.</span>${raw(arch + rs)}<button class="btn pri" data-a="accept">Approve</button>`;
  else if ((c.status === "waiting" || c.awaiting === "findings") && APPROVAL[c.awaiting]) {
    const sent = decided.has(answer(c)),
      asks = !pq
        ? " Has questions: answer in its terminal."
        : qs.length
          ? ` ${qs.length === 1 ? "1 question" : qs.length + " questions"}.`
          : "";
    const more =
      `<button data-a="archive">Archive</button><hr><button data-a="ab" class="danger">Abandon</button>`;
    foot.innerHTML = html`<span class="note">${sent ? "Sent to your agent." : APPROVAL[c.awaiting] + asks}</span><details class="more"><summary class="btn ghost">More</summary><div class="menu-pop">${raw(more)}</div></details>${raw(rs)}<span class="dec"><button class="btn" data-a="revise"${sent ? " disabled" : ""}>Revise</button><button class="btn pri" data-a="approve"${sent ? " disabled" : ""}>${c.awaiting === "findings" ? "Approve as-is" : "Approve"}</button></span>`;
  } else if (c.status === "waiting")
    foot.innerHTML = html`<span class="note">Waiting: ${need(c.awaiting)}.</span>${raw(arch)}<button class="btn ghost" data-a="ab">Abandon</button>${raw(rs)}`;
  else if (c.status === "done" && c.accept === "needs")
    foot.innerHTML = html`<span class="note">Done, not approved: its agent finished without your approval. Nothing is committed until you approve.</span>${raw(arch + rs)}<button class="btn pri" data-a="accept">Approve</button>`;
  else if (c.status === "done") foot.innerHTML = raw(arch + rs);
  else if (c.status === "abandoned") foot.innerHTML = raw(arch);
  else
    foot.innerHTML = html`<span class="note">${c.pty && !c.pty.alive ? "Agent ended early." : c.status === "stalled" ? "Stalled." : ""}</span>${raw(arch)}<button class="btn ghost" data-a="ab">Abandon</button>${resumable(c) ? html`<button class="btn pri" data-a="resume">Resume</button>` : ""}`;
  foot.querySelectorAll("[data-a]").forEach(
    (b) =>
      (b.onclick = () => {
        const a = b.dataset.a;
        if (a === "archive" || a === "restore") {
          toggleArchive(c, a === "archive");
          return;
        }
        if (a === "gittab") {
          store.tab = "git";
          openRun(c, true);
          return;
        }
        if (a === "accept") {
          b.disabled = true;
          post("/accept", { dir: c.state, id: c.id }).then((r) => {
            if (r.ok) toast("Approved");
            else b.disabled = false;
          });
          return;
        }
        if (a === "approve") {
          if (qs.length) confirmAnswers(c, qs);
          else decide(c, b);
          return;
        }
        if (a === "revise") {
          confirmRevise(c);
          return;
        }
        if (a === "resume") {
          resume(c, b);
          return;
        }
        if (view === "run") go("board", true);
        close();
        store.mode = "reject";
        store.modeKey = key(c);
        render();
      }),
  );
}
// A link from a note (?run= or ?idea=, with dir, tab, item) opens that card's panel;
// a finding or backlog item named is scrolled to and marked. Found by its text, since
// the rendered list does not carry the numbers.
let hit = null;
export function deep() {
  const p = new URLSearchParams(location.search),
    d = p.get("dir"),
    id = p.get("run"),
    idea = p.get("idea");
  // A workspace address (?view=run&idea=) is the run view's own, not a note's deep link.
  if ((!id && idea === null) || p.get("view") === "run") return;
  history.replaceState(null, "", location.pathname + "?all=1");
  const c = store.S.cards.find(
    (x) => x.state === d && (id ? x.kind === "run" && x.id === id : x.kind === "idea" && x.text === idea),
  );
  if (!c) {
    toast(id ? "That run is not on this board" : "That idea is not on this board");
    return;
  }
  const m = /^(finding|backlog)-(\d+)$/.exec(p.get("item") || "");
  // An item's tab is its own when the link does not name one.
  const n = p.get("tab") || (m ? (m[1] === "finding" ? "review" : "backlog") : ""),
    t = TABS.find((x) => x[1] === (n === "work" ? "impl" : n));
  if (t) store.tab = t[1];
  hit = m ? { type: m[1], n: +m[2], k: key(c) } : null;
  open(c, !!t);
}
// A run's panel on the tab of one of its items, that item scrolled to and marked.
export function openAt(c, type, n) {
  store.tab = type === "finding" ? "review" : "backlog";
  hit = { type, n, k: key(c) };
  open(c, true);
}
// What md() leaves of a line as text: no backticks or stars, a link reduced to its words.
function mark(h) {
  hit = null;
  const flat = (t) =>
    String(t)
      .replace(/!?\[([^\]]*)\]\([^)\s]+\)/g, "$1")
      .replace(/[`*]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const b = [...(store.runDoc.backlog || "").matchAll(/^\s*-\s*(?:open|done|rejected):\s*(.*)$/gm)];
  const text = h.type === "finding" ? (store.runDoc.findings || []).find((f) => f.n === h.n)?.text : b[h.n - 1]?.[1];
  if (!text) {
    toast("That item is not in this run");
    return;
  }
  const want = flat(text).slice(0, 60),
    el = [...$("pbody").querySelectorAll("li,p")].find(
      (e) => !e.closest(".prog") && flat(e.textContent).includes(want),
    );
  if (!el) return;
  el.scrollIntoView({ block: "center" });
  el.classList.add("hit");
  setTimeout(() => el.classList.remove("hit"), 2400);
}
export async function toggleArchive(c, archived) {
  const r = await post(
    "/archive",
    c.kind === "idea" ? { dir: c.state, text: c.text, archived } : { dir: c.state, id: c.id, archived },
  );
  if (r.ok) toast(archived ? "Archived" : "Restored");
  close();
  load();
}
export function close() {
  if (view !== "board" && view !== "run" && view !== "ideas") return;
  const k = store.openKey;
  stopDictation(true);
  termStop();
  store.openKey = null;
  store.runDoc = null;
  $("panel").classList.remove("open");
  $("scrim").classList.remove("on");
  render();
  if (k) cardEl(k)?.focus({ preventScroll: true });
}

export function initPanel() {
  // Answering an approval from the panel opens your agent on the run, told the decision and,
  // for a revise, the comment. Answered approvals are remembered outside the footer, which
  // every refresh rebuilds, so a second press cannot open a second agent. Keyed by when the
  // run last moved: the same approval reached again after a revise is a new question.
  // The footer's More menu is a <details>: close it on a click anywhere else.
  document.addEventListener("click", (e) => {
    for (const d of document.querySelectorAll(".more[open]")) if (!d.contains(e.target)) d.open = false;
  });
  $("pclose").onclick = close;
  $("scrim").onclick = close;
}
