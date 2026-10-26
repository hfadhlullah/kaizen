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
let remoteBusy = false;
let poll = null;
let seen = 0; // messages already on screen: only newer ones animate in
let shown = null; // the chat those were from
let following = true; // scrolling up pauses auto-follow until the reader reaches the bottom again
let attachments = [];

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
const remember = (id) => { try { id ? sessionStorage.setItem("kz-chat", id) : sessionStorage.removeItem("kz-chat"); } catch (e) {} };
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
  if (m.role === "user") return html`<div class="hm u${anim}">${m.text ? html`<div class="hb">${m.text}</div>` : ""}${m.files?.length ? html`<div class="hfiles">${m.files.map((f) => html`<span>${ico("clip")}${f.name}</span>`)}</div>` : ""}</div>`;
  const active = i === cur.messages.length - 1 && (sending || remoteBusy);
  const steps = (m.steps || []).map(
    (s) => html`<li class="${s.ok === false ? "bad" : ""}">${ico(s.kind === "edit" ? "note" : s.kind === "project" ? "board" : "term")}<code>${s.text}</code></li>`,
  );
  // A move is news, not a detail: shown under the reply as well as in the steps.
  const moved = (m.steps || []).filter((s) => s.kind === "project");
  const runs = runsIn(m.text + " " + (m.steps || []).map((s) => s.text).join(" "));
  // Nothing yet: the typing dots stand in for the reply.
  if (!steps.length && !m.text && !m.error && !active) return "";
  return html`<div class="hm a${anim}">${steps.length ? html`<details class="hsteps"${m.text ? "" : " open"}><summary>${steps.length} step${steps.length > 1 ? "s" : ""}</summary><ul>${steps}</ul></details>` : ""}${m.text ? html`<div class="hb md">${raw(md(m.text))}</div>` : ""}${m.error ? html`<div class="herr">${m.error}</div>` : ""}${moved.map((s) => html`<div class="hmove${s.ok === false ? " bad" : ""}">${ico("board")}${s.text}</div>`)}${runs.map((id) => html`<button class="btn ghost sm hrun" data-run="${id}">${ico("board")}Open ${id}</button>`)}${active ? html`<div class="hactivity" role="status"><span class="hmascot"><img src="/logo.png" alt="" aria-hidden="true"><i class="hlaptop"></i></span><span class="hactivity-copy"><span>${m.activity || "Thinking…"}</span><span class="hdots" aria-hidden="true"><i></i><i></i><i></i></span></span></div>` : ""}</div>`;
}

function hero() {
  const d = here();
  return html`<div class="hhero"><h2>${d ? html`What should we do in ${name(d)}?` : "What should we work on?"}</h2><p class="hint">${d ? "Ask about this project or another one, or start a new one." : "Name a project, or describe a new one and the agent will set it up."} Bigger work becomes a kaizen run on the Board.</p></div>`;
}

function chips() {
  return html`<div class="hchips">${SUGGEST.map((s) => html`<button class="chip" data-s="${s}">${s}</button>`)}</div>`;
}

function list() {
  return html`<div class="hsin"><div class="hshd"><span>Chats</span><button class="ib sm" id="hclose" aria-label="Hide chats" title="Hide chats">${ico("side")}</button></div><nav class="hlist" aria-label="Chats">${chats.map((c) => html`<div class="hli${cur && cur.id === c.id ? " on" : ""}"><button data-c="${c.id}" title="${c.title}">${c.busy ? html`<span class="dot"></span>` : ""}<span class="ht">${c.title}</span><span class="hp">${c.project ? name(c.project) : "No project"}</span></button><button class="ib sm" data-del="${c.id}" aria-label="Delete chat: ${c.title}" title="Delete chat">${ico("trash")}</button></div>`)}</nav></div>`;
}

function bindReply(root) {
  root.querySelectorAll(".md a").forEach((a) => {
    if (/^https?:/i.test(a.getAttribute("href") || "")) (a.target = "_blank"), (a.rel = "noopener noreferrer");
    else a.replaceWith(Object.assign(document.createElement("span"), { textContent: a.textContent, title: a.getAttribute("href") || "" }));
  });
  root.querySelectorAll("[data-run]").forEach(
    (b) =>
      (b.onclick = () => {
        const c = store.S.cards.find((x) => x.kind === "run" && x.id === b.dataset.run);
        if (c) open(c); // open() moves to the board
      }),
  );
}

function updateReply(reply) {
  const log = $("hlog");
  const last = log?.lastElementChild;
  if (!last?.classList.contains("hm") || !last.classList.contains("a")) return draw();
  const top = log.scrollTop;
  const stepsOpen = last.querySelector(".hsteps")?.open;
  const markup = String(msg(reply, cur.messages.length - 1));
  if (!markup) { last.remove(); log.scrollTop = following ? log.scrollHeight : top; return; }
  const next = document.createElement("div");
  next.innerHTML = markup;
  last.replaceChildren(...next.firstElementChild.childNodes);
  if (stepsOpen !== undefined && last.querySelector(".hsteps")) last.querySelector(".hsteps").open = stepsOpen;
  bindReply(last);
  log.scrollTop = following ? log.scrollHeight : top;
}

function bindChatItems(root) {
  root.querySelectorAll("[data-c]").forEach(
    (b) =>
      (b.onclick = () => {
        if (phone()) side = false;
        show(b.dataset.c);
      }),
  );
  root.querySelectorAll("[data-del]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm("Delete this chat?")) return;
        const r = await post("/chat/delete", { id: b.dataset.del });
        if (!r.ok) return toast((await r.json()).error);
        if (cur && cur.id === b.dataset.del) { cur = null; remoteBusy = false; remember(null); }
        refresh();
      }),
  );
}

function drawList() {
  const old = $("home").querySelector(".hlist");
  if (!old) return;
  const temp = document.createElement("div");
  temp.innerHTML = String(list());
  const nav = temp.querySelector(".hlist");
  const top = old.scrollTop;
  old.replaceWith(nav);
  nav.scrollTop = top;
  bindChatItems(nav);
}

const sendButton = () => sending || remoteBusy
  ? html`<button type="button" class="ib hgo stop" id="hstop" aria-label="Stop" title="Stop">${ico("x")}</button>`
  : html`<button class="ib hgo" aria-label="Send" title="Send (Enter)">${ico("send")}</button>`;

function syncSendButton() {
  const b = $("hbox")?.querySelector(".hgo");
  if (b && b.classList.contains("stop") !== (sending || remoteBusy)) b.outerHTML = String(sendButton());
  if ($("hstop")) $("hstop").onclick = () => post("/chat/stop", { id: cur && cur.id });
}

function newChat() {
  if (sending) return;
  clearTimeout(poll);
  cur = null;
  attachments = [];
  remoteBusy = false;
  remember(null);
  if (phone()) side = false;
  vt(draw).then(() => $("hq").focus());
}

function draw() {
  const h = $("home");
  // Full redraws keep the draft and caret; streamed replies update only the last message.
  const typing = document.activeElement && document.activeElement.id === "hq" ? $("hq").selectionStart : -1;
  const empty = !cur || !cur.messages.length;
  // A redraw replaces the log: keep the reader where they were unless they were at the bottom.
  const old = $("hlog");
  if (shown !== (cur && cur.id)) following = true;
  const top = old ? old.scrollTop : 0;
  if (shown !== (cur && cur.id)) seen = 0;
  if (side === null) side = sideAtStart();
  h.classList.toggle("hopen", side);
  h.innerHTML = String(html`<div class="hside">${list()}</div><div class="hscrim" id="hscrim"></div><div class="hmain${empty ? " hfresh" : ""}"><div class="htop"><button class="ib" id="htog" aria-label="Chats" aria-expanded="${String(side)}" title="${side ? "Hide chats" : "Show chats"}">${ico("side")}</button>${empty ? "" : html`<span class="hwhere">${ico("board")}${cur.project ? name(cur.project) : "No project"}</span>`}</div><div class="hlog" id="hlog" aria-live="polite">${empty ? hero() : cur.messages.map(msg)}</div><form class="hbox" id="hbox"><input id="hfile" type="file" multiple hidden><button type="button" class="ib hattach" id="hattach" aria-label="Attach files" title="Attach files">${ico("clip")}</button><div class="hinput"><div class="hatt" id="hatt"></div><textarea id="hq" rows="1" placeholder="Message the agent" aria-label="Message the agent"></textarea></div>${sendButton()}</form>${empty ? chips() : ""}</div>`);
  seen = empty ? 0 : cur.messages.length;
  shown = cur && cur.id;
  $("htog").onclick = () => setSide(!side);
  $("hclose").onclick = () => setSide(false);
  $("hscrim").onclick = () => setSide(false);
  const q = $("hq");
  renderAttachments();
  $("hattach").disabled = sending;
  $("hattach").onclick = () => $("hfile").click();
  $("hfile").onchange = (e) => { addFiles([...e.target.files]); e.target.value = ""; };
  q.onpaste = (e) => {
    const files = [...e.clipboardData.items].filter((it) => it.kind === "file").map((it) => it.getAsFile()).filter(Boolean);
    if (files.length) { e.preventDefault(); addFiles(files.map((f) => f.name === "image.png" ? new File([f], `paste-${Date.now()}.png`, { type: f.type }) : f)); }
  };
  $("hbox").ondragover = (e) => { if (Array.from(e.dataTransfer?.types || []).includes("Files")) e.preventDefault(); };
  $("hbox").ondrop = (e) => { if (e.dataTransfer.files.length) { e.preventDefault(); addFiles([...e.dataTransfer.files]); } };
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
  syncSendButton();
  $("hnewtop").onclick = newChat;
  $("hnewtop").disabled = sending;
  bindChatItems(h);
  h.querySelectorAll("[data-s]").forEach(
    (b) =>
      (b.onclick = () => {
        q.value = b.dataset.s;
        q.focus();
        grow(q);
        if (!b.dataset.s.endsWith(" ")) $("hbox").requestSubmit();
      }),
  );
  if (typing >= 0) {
    q.focus();
    q.setSelectionRange(typing, typing);
  }
  // The agent links files by their path on disk, which the board cannot serve: the text stays, the path is its tooltip.
  bindReply(h);
  const log = $("hlog");
  log.onwheel = (e) => { if (e.deltaY < 0 && log.scrollHeight > log.clientHeight) following = false; };
  log.onscroll = () => { following = log.scrollHeight - log.scrollTop - log.clientHeight <= 0.5; };
  if (following) log.scrollTop = log.scrollHeight;
  else log.scrollTop = top;
}

function grow(t) {
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 220) + "px";
}

function renderAttachments() {
  const box = $("hatt");
  if (!box) return;
  box.innerHTML = String(html`${attachments.map((f, i) => html`<span>${ico("clip")}${f.name}<button type="button" data-file="${i}" aria-label="Remove ${f.name}">×</button></span>`)}`);
  box.querySelectorAll("[data-file]").forEach((b) => b.onclick = () => { attachments.splice(Number(b.dataset.file), 1); renderAttachments(); });
}

function addFiles(files) {
  if (sending) { toast("Wait for the current reply"); return; }
  for (const file of files) {
    if (attachments.length >= 5 || file.size > 10 * 1024 * 1024 || attachments.reduce((n, f) => n + f.size, 0) + file.size > 20 * 1024 * 1024) { toast("Up to 5 files, 10 MB each and 20 MB total"); break; }
    attachments.push(file);
  }
  renderAttachments();
}

async function refreshChats() {
  try {
    chats = (await get("/chats")).chats || [];
  } catch (e) {
    chats = [];
  }
}

async function refresh() {
  await refreshChats();
  draw();
}

async function show(id) {
  const c = await get("/chat?id=" + encodeURIComponent(id));
  if (c.error) return toast(c.error);
  if (cur?.id !== c.id) attachments = [];
  const same = cur?.id === c.id && cur.messages.length === c.messages.length && !!$("hlog");
  cur = c;
  remoteBusy = !!c.busy;
  remember(c.id);
  if (same) { updateReply(c.messages.at(-1)); syncSendButton(); }
  else draw();
  follow(c.project);
  // A turn started from another tab, or before a reload, is still running: follow it until it saves.
  clearTimeout(poll);
  if (c.busy && !sending) poll = setTimeout(() => cur && cur.id === id && show(id), 2000);
}

async function send(text) {
  text = text.trim();
  if ((!text && !attachments.length) || sending || remoteBusy) return;
  const files = attachments;
  attachments = [];
  clearTimeout(poll);
  const at = new Date().toISOString();
  const was = cur ? cur.id : "new";
  const fresh = !cur || !cur.messages.length;
  cur = cur || { id: null, title: text || files[0].name, project: here(), messages: [] };
  const reply = { role: "agent", text: "", steps: [], activity: "Thinking…", at };
  cur.messages.push({ role: "user", text, files: files.map((f) => ({ name: f.name })), at }, reply);
  sending = true;
  try {
    sessionStorage.removeItem(DK + "home:" + was);
    if (fresh) sessionStorage.setItem("kz-chat-pending", at);
  } catch (e) {}
  // The first message: the box glides from the middle to the bottom.
  following = true;
  await (fresh ? vt(draw) : (draw(), undefined));
  $("hlog").scrollTop = $("hlog").scrollHeight;
  let accepted = false;
  try {
    const form = new FormData();
    form.set("id", cur.id || ""); form.set("text", text); form.set("project", cur.project || "");
    files.forEach((f) => form.append("files", f));
    const r = files.length ? await fetch("/chat", { method: "POST", body: form }) : await post("/chat", { id: cur.id, text, project: cur.project });
    if (!r.ok) {
      reply.error = (await r.json()).error || "Could not send";
      attachments = [...files, ...attachments]; renderAttachments();
      return;
    }
    accepted = true;
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
          remember(e.id);
          try { sessionStorage.removeItem("kz-chat-pending"); } catch (err) {}
          // In the list from its first message, marked busy, not only once the turn ends.
          get("/chats").then((r) => {
            chats = r.chats || chats;
            drawList();
          });
        }
        if (e.t === "text") reply.text += (reply.text ? "\n\n" : "") + e.text;
        if (e.t === "status") reply.activity = e.text;
        if (e.t === "step") { reply.steps.push(e.step); reply.activity = "Thinking…"; }
        if (e.t === "error") reply.error = e.error;
        if (e.t === "project") {
          cur.project = e.dir;
          follow(e.dir);
        }
        updateReply(reply);
      }
    }
  } catch (e) {
    reply.error = "Lost the connection; the agent keeps going and the chat saves when it finishes.";
    if (!accepted) { attachments = [...files, ...attachments]; renderAttachments(); }
  } finally {
    try { sessionStorage.removeItem("kz-chat-pending"); } catch (e) {}
    sending = false;
    delete reply.activity;
    if (accepted && cur?.id) {
      try { await show(cur.id); }
      catch { remoteBusy = false; updateReply(reply); }
    } else { remoteBusy = false; updateReply(reply); }
    syncSendButton();
    $("hattach").disabled = false;
    $("hnewtop").disabled = false;
    await refreshChats();
    drawList();
  }
}

// The Home view opens: every chat, and the open one kept.
export async function openHome() {
  await refreshChats();
  let id;
  try { id = sessionStorage.getItem("kz-chat"); } catch (e) {}
  if (!id) {
    try {
      const pending = sessionStorage.getItem("kz-chat-pending");
      if (pending) id = chats.find((c) => c.updated >= pending)?.id;
    } catch (e) {}
  }
  if (id && chats.some((c) => c.id === id)) await show(id);
  else { remember(null); draw(); }
}

// A project picked above: a new chat's greeting names it. Only then: a redraw replays the greeting's entrance.
let greeted;
addEventListener("kz-state", () => {
  const d = here();
  if (d === greeted) return;
  greeted = d;
  if (document.body.classList.contains("homev") && !sending && (!cur || !cur.messages.length)) draw();
});
