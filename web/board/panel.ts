import { store } from "./store.ts";
import { showTerm, termStop } from "./agent-term.ts";
import { load, post } from "./api.ts";
import { APPROVAL, answer, confirmAnswers, confirmRevise, decide, decided, resumable, resume } from "./approvals.ts";
import { cardEl, key, render } from "./cards.ts";
import { chat } from "./chat.ts";
import { stopDictation } from "./dictation.ts";
import { $, esc } from "./dom.ts";
import { fixForm, fixOff } from "./fixes.ts";
import { commitPush, confirmCommit, gitBtn } from "./git.ts";
import { WORD, need } from "./labels.ts";
import { attach, brief, md, planQuestions, preview, progress } from "./markdown.ts";
import { toast } from "./toast.ts";
import { go, view } from "./views.ts";

// ---- detail panel
// A run's tabs, its phases in board order. A card opens on its column's tab.
const TABS = [
  ["Request", "request"],
  ["Notes", "notes"],
  ["Plan", "plan"],
  ["Backlog", "backlog"],
  ["Work", "impl"],
  ["Review", "review"],
  ["Preview", "preview"],
];
// keepTab: a link already chose the tab.
export function open(c, keepTab) {
  if (view !== "board") go("board", true);
  stopDictation(true); // the panel body is about to be replaced
  fixOff.clear();
  store.openKey = key(c);
  $("panel").classList.add("open");
  $("scrim").classList.add("on");
  $("ptitle").textContent = c.kind === "idea" ? brief(c.text).head : c.text;
  render();
  $("pterm").hidden = true;
  if (c.kind === "idea") {
    store.runDoc = null;
    $("psub").textContent = "Idea · " + c.where;
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
          const k = key(c);
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
  // A run its agent is working on in this board, while planning, building or reviewing, opens on that agent.
  if (!keepTab && c.pty && c.pty.alive && c.column >= 1 && c.column <= 3) store.tab = "term";
  openRun(c, false);
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
  $("pbody").innerHTML = h + (store.runDoc.backlog ? "<h3>Backlog</h3>" + md(store.runDoc.backlog, true) : "");
  const bar = $("pbody").querySelector(".pbar i");
  if (prev && prev.w !== lastProg.w) {
    bar.style.width = prev.w + "%";
    bar.offsetWidth;
    bar.style.width = lastProg.w + "%";
  }
}
// An idea's panel: its terminal while the run it started is being born there, else its notes.
export function ideaBody(c) {
  if (c.pty) showTerm(c);
  else {
    termStop();
    chat(c, c.notes, c.archived || c.status !== "idea");
  }
}
export async function openRun(c, refresh, again) {
  if (!refresh || !store.runDoc || store.runDoc.id !== c.id || again) {
    const d = await fetch(`/run/${encodeURIComponent(c.id)}?dir=${encodeURIComponent(c.state)}`).then((r) => r.json());
    // A file list being confirmed, or a push under way, keeps the doc it was drawn from.
    if (refresh && $("pfoot").querySelector(".inl,[data-busy],.more[open]")) return;
    store.runDoc = d;
  }
  if (store.openKey !== key(c)) return;
  // The fetch above may have finished after a newer /state: draw the card as it is now
  // (a resumed agent's terminal, not the one that ended).
  c = store.S.cards.find((x) => key(x) === store.openKey) || c;
  // A refresh while notes are being typed would wipe the textarea.
  const ta = $("pbody").querySelector(".notes textarea");
  if (refresh && ta && document.activeElement === ta) return;
  $("psub").textContent = c.id + " · " + (WORD[c.status] || c.status) + (c.awaiting ? " · " + need(c.awaiting) : "");
  // Only tabs with something in them show. A card whose agent runs in the board gets its
  // terminal behind the header's terminal button, chosen once right after a launch from here.
  const tabs = TABS.filter(
    (t) =>
      t[1] === "request" ||
      t[1] === "notes" ||
      (t[1] === "preview"
        ? preview(store.runDoc.impl)
        : store.runDoc[t[1]] || (t[1] === "backlog" && c.column === 2 && store.runDoc.progress)),
  );
  if (c.pty && store.wantTerm === key(c)) {
    store.wantTerm = null;
    store.tab = "term";
  }
  if (store.tab === "term" && !c.pty) store.tab = store.lastTab;
  // A tab not written yet falls back to the latest one that is.
  if (store.tab !== "term" && !tabs.some((t) => t[1] === store.tab))
    store.tab = [...tabs].reverse().find((t) => t[1] !== "notes")[1];
  if (store.tab !== "term") store.lastTab = store.tab;
  $("panel").classList.toggle("wide", store.tab === "term");
  const pt = $("pterm");
  pt.hidden = !c.pty;
  pt.classList.toggle("on", store.tab === "term");
  pt.setAttribute("aria-pressed", store.tab === "term");
  pt.onclick = () => {
    store.tab = store.tab === "term" ? store.lastTab : "term";
    openRun(c, true);
  };
  $("ptabs").innerHTML = tabs
    .map((t) => `<button class="${t[1] === store.tab ? "on" : ""}" data-k="${t[1]}">${t[0]}</button>`)
    .join("");
  [...$("ptabs").children].forEach(
    (b) =>
      (b.onclick = () => {
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
  } else
    $("pbody").innerHTML = doc
      ? md(doc, k === "backlog")
      : `<p style="color:var(--dim)">No ${{ request: "request", plan: "plan", impl: "work report", preview: "preview", review: "review", backlog: "backlog" }[k]} yet.</p>`;
  if (k === "backlog") showProgress(c);
  if (k === "review") fixForm(c);
  // The notebook's notes that link here, each opening that note: above the run's own notes.
  if (k === "notes" && store.runDoc.linkedFrom && store.runDoc.linkedFrom.length)
    $("pbody").insertAdjacentHTML(
      "afterbegin",
      `<h3>Linked from notes</h3><ul class="lnk">${store.runDoc.linkedFrom.map((n) => `<li><a href="/notebook?dir=${encodeURIComponent(c.state)}&amp;note=${encodeURIComponent(n)}">${esc(n)}</a></li>`).join("")}</ul>`,
    );
  // Only the panel the link asked for: another card opened meanwhile drops the mark.
  if (hit && !refresh) {
    if (hit.k === key(c)) mark(hit);
    else hit = null;
  }
  const foot = $("pfoot");
  // A refresh while the commit is being confirmed would wipe the message.
  if (refresh && foot.querySelector(".inl,[data-busy],.more[open]")) return;
  const arch =
    gitBtn(c) +
    (c.archived
      ? `<button class="btn pri" data-a="restore">Restore</button>`
      : `<button class="btn ghost" data-a="archive">Archive</button>`);
  // A plan that asks questions takes their answers with the approval.
  // One the board cannot read is said, so it is answered in the terminal instead of skipped.
  const pq = c.status === "waiting" && c.awaiting === "approvals.plan" ? planQuestions(store.runDoc.plan) : [],
    qs = pq || [];
  // Its in-card agent ended on a waiting or done run: reopen that conversation, nothing sent.
  const rs = c.pty && !c.pty.alive ? `<button class="btn" data-a="resume">Resume session</button>` : "";
  if (c.archived) foot.innerHTML = arch;
  else if ((c.status === "waiting" || c.awaiting === "findings") && APPROVAL[c.awaiting]) {
    const sent = decided.has(answer(c)),
      asks = !pq
        ? " It has open questions the board cannot show: answer them in the terminal running this run, or approve and your agent asks them."
        : qs.length
          ? ` It asks ${qs.length === 1 ? "one question" : qs.length + " questions"}: Approve opens ${qs.length === 1 ? "it" : "them"}.`
          : "";
    // gitBtn's buttons restyled as menu rows.
    const more =
      gitBtn(c).replace(/class="btn( pri)?"/g, "") +
      `<button data-a="archive">Archive</button><hr><button data-a="ab" class="danger">Abandon</button>`;
    foot.innerHTML = `<span class="note">${sent ? "Sent to your agent." : APPROVAL[c.awaiting] + asks + " Answering here opens a new agent session."}</span><details class="more"><summary class="btn ghost">More</summary><div class="menu-pop">${more}</div></details>${rs}<span class="dec"><button class="btn" data-a="revise"${sent ? " disabled" : ""}>Revise</button><button class="btn pri" data-a="approve"${sent ? " disabled" : ""}>${c.awaiting === "findings" ? "Approve as-is" : "Approve"}</button></span>`;
  } else if (c.status === "waiting")
    foot.innerHTML = `<span class="note">Waiting on you: ${esc(need(c.awaiting))}. Answer in the ${c.pty && c.pty.alive ? "terminal (button at the top)" : "terminal running this run"}.</span>${arch}<button class="btn ghost" data-a="ab">Abandon</button>${rs}`;
  else if (c.status === "done") foot.innerHTML = arch + rs;
  else if (c.status === "abandoned") foot.innerHTML = arch;
  else
    foot.innerHTML = `<span class="note">${c.pty && !c.pty.alive ? "Its agent ended before the stage finished. Resume continues it here." : c.status === "stalled" ? "No progress for a while. Resume it, or abandon it." : c.pty ? "" : "Running in your agent."}</span>${arch}<button class="btn ghost" data-a="ab">Abandon run</button>${resumable(c) ? `<button class="btn pri" data-a="resume">Resume</button>` : ""}`;
  foot.querySelectorAll("[data-a]").forEach(
    (b) =>
      (b.onclick = () => {
        const a = b.dataset.a;
        if (a === "archive" || a === "restore") {
          toggleArchive(c, a === "archive");
          return;
        }
        if (a === "push") {
          commitPush(c, "", b);
          return;
        }
        if (a === "commit") {
          confirmCommit(c);
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
  if (!id && idea === null) return;
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
  if (view !== "board") return;
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
