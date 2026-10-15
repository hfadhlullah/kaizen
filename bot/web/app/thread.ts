import { store } from "./store.ts";
import { api } from "./api.ts";
import { splitFiles } from "./attachments.ts";
import { card } from "./cards.ts";
import { $, avatar, el } from "./dom.ts";
import { mdNodes, mdTree } from "./markdown.ts";
import { renderAgent } from "./panel.ts";
import { bots, doingText, loadBots, renderList, working } from "./sidebar.ts";

// ---- thread: messages and cards, in the order they happened ----
export async function select(id) {
  store.needsOpen = false;
  store.current = bots.find((b) => b.id === id);
  if (!store.current) return;
  history.replaceState(null, "", "#" + id); // a refresh reopens this chat
  if (store.current.hidden) {
    store.current = await api(`/bots/${id}`, { method: "PATCH", body: { hidden: false } });
    await loadBots();
  }
  $("to").hidden = true;
  $("top").hidden = false;
  document.body.classList.add("open");
  renderList();
  $("tav").replaceChildren(avatar(store.current, "sm"));
  $("tname").textContent = store.current.name;
  $("ttitle").textContent = store.current.title || "";
  $("panelBtn").hidden = false;
  $("composer").hidden = false;
  $("input").placeholder = `Message ${store.current.name}`;
  showDoing(working.has(id) ? doingText.get(id) : null);
  const r = await api(`/bots/${id}/messages`);
  if (store.current?.id !== id) return;
  store.items = [
    ...r.messages.map((m) => ({ type: "m", at: m.at, m })),
    ...r.actions.map((a) => ({ type: "a", at: a.at, a })),
  ].sort((x, y) => x.at - y.at);
  renderThread();
  if (store.panel === "agent") renderAgent();
  $("input").focus();
}
function renderThread() {
  const t = $("thread");
  t.replaceChildren();
  if (!store.items.length)
    t.append(
      el(
        "div",
        { class: "empty" },
        `Give ${store.current.name} a task, like you would a teammate. Anything that starts a run, approves a plan or goes to someone outside waits on a card for your click.`,
      ),
    );
  for (const it of store.items) it.type === "m" ? addMsg(it.m) : put(card(it.a));
  t.scrollTop = t.scrollHeight;
}
// An open card (waiting on you, or a run still working) stays below the newest message, so
// what the agent is doing is never scrolled away. Everything else goes in above the open cards.
function put(node) {
  const t = $("thread");
  if (node.classList.contains("pin")) t.append(node);
  else t.insertBefore(node, t.querySelector(":scope > .pin"));
}
export function addMsg(m) {
  const t = $("thread");
  t.querySelector(".empty")?.remove();
  if (m.kind === "receipt") {
    const pin = t.querySelector(":scope > .pin");
    let box = pin ? pin.previousElementSibling : t.lastElementChild;
    if (!box?.classList.contains("receipts")) put((box = el("div", { class: "receipts" })));
    box.append(el("div", { class: "tick" }, el("i", { "aria-hidden": "true" }, "✓"), m.text));
  } else if (m.kind === "user") {
    const { text, files } = splitFiles(m.text);
    put(
      el(
        "div",
        { class: "msg user" },
        text,
        files.length
          ? el(
              "div",
              {},
              files.map((n) => el("span", { class: "chip" }, `📎 ${n}`)),
            )
          : null,
      ),
    );
  } else if (m.kind === "bot") put(el("div", { class: "msg bot md" }, mdTree(m.text).map(mdNodes)));
  else put(el("div", { class: `msg ${m.kind}` }, m.text));
}
export function upsert(a) {
  if (!store.current || a.bot_id !== store.current.id) return;
  const i = store.items.findIndex((x) => x.type === "a" && x.a.id === a.id);
  if (i >= 0) {
    store.items[i].a = a;
    const old = document.getElementById(`act-${a.id}`),
      c = card(a);
    // A card that reopens joins the open ones at the bottom; any other update stays in place.
    if (old && c.classList.contains("pin") && !old.classList.contains("pin")) {
      old.remove();
      put(c);
    } else old?.replaceWith(c);
  } else {
    store.items.push({ type: "a", at: a.at, a });
    $("thread").querySelector(".empty")?.remove();
    put(card(a));
  }
}

// ---- the "doing X" line under the agent while it works ----
export function showDoing(text) {
  const d = $("doing");
  if (!text || !store.current) {
    d.hidden = true;
    return;
  }
  d.replaceChildren(avatar(store.current, "sm"), el("span", {}, text));
  d.hidden = false;
}
