import { open } from "./panel.ts";
import { pick, short } from "./projects.ts";
import { $, html, ico, raw, vt } from "./dom.ts";
import { draft, DK } from "./drafts.ts";
import { md } from "./markdown.ts";
import { store } from "./store.ts";
import { toast } from "./toast.ts";

// ---- Home: a chat with kaizen's main agent (cli/chat.ts). Chats are not tied to the
// board's project: each is in a project or in none, and the agent can move it. A new chat
// starts in the project picked above (none in All projects); the board follows the open chat.
let chats = [];
let cur = null; // the open chat, as /chat returns it; null is a new one
let sending = false;
let poll = null;
let seen = 0; // messages already on screen: only newer ones animate in
let shown = null; // the chat those were from

// The chat list beside the conversation: open or closed, kept per browser. A phone opens it as a drawer, closed at first.
const phone = () => matchMedia("(max-width:640px)").matches;
// Read when Home first draws, not at import: tests load this module with no window.
let side = null;
const sideAtStart = () => {
  try {
    return !phone() && localStorage.getItem("kz-hist") !== "0";
  } catch (e) {
    return !phone();
  }
};
function setSide(on) {
  side = on;
  $("home").classList.toggle("hopen", on);
  const t = $("htog");
  if (t) t.setAttribute("aria-expanded", String(on)), (t.title = on ? "Hide chats" : "Show chats");
  if (!phone())
    try {
      localStorage.setItem("kz-hist", on ? "1" : "0");
    } catch (e) {}
}

const get = (u) => fetch(u).then((r) => r.json());
const post = (u, b) => fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
// The project a new chat starts in: the board's, unless it shows every project or none.
const here = () => (store.S.all || !store.S.dir || !(store.S.projects || []).some((p) => p.dir === store.S.dir) ? null : store.S.dir);
const name = (d) => short((store.S.projects || []).find((p) => p.dir === d)?.label || String(d).replace(/[\\/]\.kaizen$/, ""));
// The board follows the chat into its project.
const follow = (d) => d && d !== store.S.dir && pick(d);

const SUGGEST = ["What's waiting on me?", "Summarize what changed this week", "Plan a new feature: ", "Review my last change"];

// Run ids the agent named that are cards on this board: each becomes a button to its card.
const runsIn = (t) =>
  [...new Set(String(t).match(/\b\d{4}-\d{2}-\d{2}-[a-z0-9-]+\b/g) || [])].filter((id) =>
    store.S.cards.some((c) => c.kind === "run" && c.id === id),
  );

function msg(m, i) {
  const anim = i >= seen ? " in" : "";
  if (m.role === "user") return html`<div class="hm u${anim}"><div class="hb">${m.text}</div></div>`;
  const steps = (m.steps || []).map(
    (s) => html`<li class="${s.ok === false ? "bad" : ""}">${ico(s.kind === "edit" ? "note" : s.kind === "project" ? "board" : "term")}<code>${s.text}</code></li>`,
  );
  // A move is news, not a detail: shown under the reply as well as in the steps.
  const moved = (m.steps || []).filter((s) => s.kind === "project");
  const runs = runsIn(m.text + " " + (m.steps || []).map((s) => s.text).join(" "));
  // Nothing yet: the typing dots stand in for the reply.
  if (!steps.length && !m.text && !m.error) return sending ? html`<div class="hm a${anim}"><div class="hdots" aria-label="Working"><i></i><i></i><i></i></div></div>` : "";
  return html`<div class="hm a${anim}">${steps.length ? html`<details class="hsteps"${m.text ? "" : " open"}><summary>${steps.length} step${steps.length > 1 ? "s" : ""}</summary><ul>${steps}</ul></details>` : ""}${m.text ? html`<div class="hb md">${raw(md(m.text))}</div>` : ""}${m.error ? html`<div class="herr">${m.error}</div>` : ""}${moved.map((s) => html`<div class="hmove${s.ok === false ? " bad" : ""}">${ico("board")}${s.text}</div>`)}${runs.map((id) => html`<button class="btn ghost sm hrun" data-run="${id}">${ico("board")}Open ${id}</button>`)}</div>`;
}

function hero() {
  const d = here();
  return html`<div class="hhero"><h2>${d ? html`What should we do in ${name(d)}?` : "What should we work on?"}</h2><p class="hint">${d ? "Ask about this project or another one, or start a new one." : "Name a project, or describe a new one and the agent will set it up."} Bigger work becomes a kaizen run on the Board.</p></div>`;
}

function chips() {
  return html`<div class="hchips">${SUGGEST.map((s) => html`<button class="chip" data-s="${s}">${s}</button>`)}</div>`;
}

function list() {
  return html`<div class="hsin"><div class="hshd"><span>Chats</span><button class="ib sm" id="hclose" aria-label="Hide chats" title="Hide chats">${ico("side")}</button></div><button class="btn ghost hnew" data-new>${ico("plus")}New chat</button><nav class="hlist" aria-label="Chats">${chats.map((c) => html`<div class="hli${cur && cur.id === c.id ? " on" : ""}"><button data-c="${c.id}" title="${c.title}">${c.busy ? html`<span class="dot"></span>` : ""}<span class="ht">${c.title}</span><span class="hp">${c.project ? name(c.project) : "No project"}</span></button><button class="ib sm" data-del="${c.id}" aria-label="Delete chat: ${c.title}" title="Delete chat">${ico("trash")}</button></div>`)}</nav></div>`;
}

function draw() {
  const h = $("home");
  // Each streamed event redraws: whoever was typing keeps the box and the caret.
  const typing = document.activeElement && document.activeElement.id === "hq" ? $("hq").selectionStart : -1;
  const empty = !cur || !cur.messages.length;
  // A redraw replaces the log: keep the reader where they were unless they were at the bottom.
  const old = $("hlog");
  const atEnd = !old || old.scrollHeight - old.scrollTop - old.clientHeight < 80;
  const top = old ? old.scrollTop : 0;
  if (shown !== (cur && cur.id)) seen = 0;
  if (side === null) side = sideAtStart();
  h.classList.toggle("hopen", side);
  h.innerHTML = String(html`<div class="hside">${list()}</div><div class="hscrim" id="hscrim"></div><div class="hmain${empty ? " hfresh" : ""}"><div class="htop"><button class="ib" id="htog" aria-label="Chats" aria-expanded="${String(side)}" title="${side ? "Hide chats" : "Show chats"}">${ico("side")}</button><button class="btn ghost sm hnewi" data-new title="New chat">${ico("plus")}New chat</button>${empty ? "" : html`<span class="hwhere">${ico("board")}${cur.project ? name(cur.project) : "No project"}</span>`}</div><div class="hlog" id="hlog" aria-live="polite">${empty ? hero() : cur.messages.map(msg)}</div><form class="hbox" id="hbox"><textarea id="hq" rows="1" placeholder="Message the agent" aria-label="Message the agent"></textarea>${sending ? html`<button type="button" class="ib hgo stop" id="hstop" aria-label="Stop" title="Stop">${ico("x")}</button>` : html`<button class="ib hgo" aria-label="Send" title="Send (Enter)">${ico("send")}</button>`}</form>${empty ? chips() : ""}</div>`);
  seen = empty ? 0 : cur.messages.length;
  shown = cur && cur.id;
  $("htog").onclick = () => setSide(!side);
  $("hclose").onclick = () => setSide(false);
  $("hscrim").onclick = () => setSide(false);
  const q = $("hq");
  draft(q, "home:" + (cur ? cur.id : "new"));
  grow(q);
  q.oninput = () => grow(q);
  q.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $("hbox").requestSubmit();
    }
  };
  $("hbox").onsubmit = (e) => {
    e.preventDefault();
    send(q.value);
  };
  if ($("hstop")) $("hstop").onclick = () => post("/chat/stop", { id: cur && cur.id });
  h.querySelectorAll("[data-new]").forEach(
    (b) =>
      (b.onclick = () => {
        cur = null;
        if (phone()) side = false;
        vt(draw).then(() => $("hq").focus());
      }),
  );
  h.querySelectorAll("[data-c]").forEach(
    (b) =>
      (b.onclick = () => {
        if (phone()) side = false;
        show(b.dataset.c);
      }),
  );
  h.querySelectorAll("[data-del]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm("Delete this chat?")) return;
        const r = await post("/chat/delete", { id: b.dataset.del });
        if (!r.ok) return toast((await r.json()).error);
        if (cur && cur.id === b.dataset.del) cur = null;
        refresh();
      }),
  );
  h.querySelectorAll("[data-s]").forEach(
    (b) =>
      (b.onclick = () => {
        q.value = b.dataset.s;
        q.focus();
        grow(q);
        if (!b.dataset.s.endsWith(" ")) $("hbox").requestSubmit();
      }),
  );
  h.querySelectorAll("[data-run]").forEach(
    (b) =>
      (b.onclick = () => {
        const c = store.S.cards.find((x) => x.kind === "run" && x.id === b.dataset.run);
        if (c) open(c); // open() moves to the board
      }),
  );
  if (typing >= 0) {
    q.focus();
    q.setSelectionRange(typing, typing);
  }
  // The agent links files by their path on disk, which the board cannot serve: the text stays, the path is its tooltip.
  h.querySelectorAll(".hm .md a").forEach((a) => {
    if (/^https?:/i.test(a.getAttribute("href") || "")) (a.target = "_blank"), (a.rel = "noopener noreferrer");
    else a.replaceWith(Object.assign(document.createElement("span"), { textContent: a.textContent, title: a.getAttribute("href") || "" }));
  });
  const log = $("hlog");
  if (atEnd) log.scrollTo({ top: log.scrollHeight, behavior: old && !empty ? "smooth" : "auto" });
  else log.scrollTop = top;
}

function grow(t) {
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 220) + "px";
}

async function refresh() {
  try {
    chats = (await get("/chats")).chats || [];
  } catch (e) {
    chats = [];
  }
  draw();
}

async function show(id) {
  const c = await get("/chat?id=" + encodeURIComponent(id));
  if (c.error) return toast(c.error);
  cur = c;
  draw();
  follow(c.project);
  // A turn started from another tab, or before a reload, is still running: follow it until it saves.
  clearTimeout(poll);
  if (c.busy && !sending) poll = setTimeout(() => cur && cur.id === id && show(id), 2000);
}

async function send(text) {
  text = text.trim();
  if (!text || sending) return;
  const at = new Date().toISOString();
  const was = cur ? cur.id : "new";
  const fresh = !cur || !cur.messages.length;
  cur = cur || { id: null, title: text, project: here(), messages: [] };
  const reply = { role: "agent", text: "", steps: [], at };
  cur.messages.push({ role: "user", text, at }, reply);
  sending = true;
  try {
    sessionStorage.removeItem(DK + "home:" + was);
  } catch (e) {}
  // The first message: the box glides from the middle to the bottom.
  await (fresh ? vt(draw) : (draw(), undefined));
  try {
    const r = await post("/chat", { id: cur.id, text, project: cur.project });
    if (!r.ok) {
      reply.error = (await r.json()).error || "Could not send";
      return;
    }
    const rd = r.body.getReader(),
      dec = new TextDecoder();
    let buf = "";
    for (let x; !(x = await rd.read()).done; ) {
      buf += dec.decode(x.value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let e;
        try {
          e = JSON.parse(line);
        } catch (err) {
          continue;
        }
        if (e.t === "chat") {
          cur.id = shown = e.id;
          // In the list from its first message, marked busy, not only once the turn ends.
          get("/chats").then((r) => {
            chats = r.chats || chats;
            draw();
          });
        }
        if (e.t === "text") reply.text += (reply.text ? "\n\n" : "") + e.text;
        if (e.t === "step") reply.steps.push(e.step);
        if (e.t === "error") reply.error = e.error;
        if (e.t === "project") {
          cur.project = e.dir;
          follow(e.dir);
        }
        draw();
      }
    }
  } catch (e) {
    reply.error = "Lost the connection; the agent keeps going and the chat saves when it finishes.";
  } finally {
    sending = false;
    await refresh();
  }
}

// The Home view opens: every chat, and the open one kept.
export async function openHome() {
  await refresh();
}

// A project picked above: a new chat's greeting names it. Only then: a redraw replays the greeting's entrance.
let greeted;
addEventListener("kz-state", () => {
  const d = here();
  if (d === greeted) return;
  greeted = d;
  if (document.body.classList.contains("homev") && !sending && (!cur || !cur.messages.length)) draw();
});
