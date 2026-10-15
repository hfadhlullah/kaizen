import { store } from "./store.ts";
import { api } from "./api.ts";
import { splitFiles } from "./attachments.ts";
import { $, avatar, el, initials } from "./dom.ts";
import { select } from "./thread.ts";

export let bots = [];
export const working = new Set(),
  doingText = new Map(),
  routineBusy = new Set();
export const shown = () => bots.filter((b) => !b.hidden); // a dismissed chat is still yours, under +

// ---- sidebar: one row per agent; a dot when a card waits on you ----
export function renderList() {
  const q = $("q").value.trim().toLowerCase();
  const list = shown().filter((b) => !q || b.name.toLowerCase().includes(q));
  $("agRows").replaceChildren(
    ...list.map((b) => {
      const a = avatar(b);
      if (b.needed) a.append(el("span", { class: "dot", title: `${b.needed} waiting on you` }));
      return el(
        "button",
        { class: "ag" + (b.id === store.current?.id ? " on" : ""), title: b.name, onclick: () => select(b.id) },
        a,
        el(
          "span",
          { class: "meta" },
          el("b", {}, b.name),
          el(
            "span",
            { class: "last" },
            working.has(b.id)
              ? "Typing…"
              : (b.last && splitFiles(b.last).text) || (b.last ? "📎 Attachment" : "No messages yet"),
          ),
        ),
      );
    }),
  );
  $("me").textContent = initials(store.info.user);
  $("youName").textContent = store.info.user;
  const n = bots.reduce((s, b) => s + (b.needed || 0), 0);
  $("needsN").textContent = n ? `${n} waiting on you` : "Nothing waiting";
  $("needsBtn").querySelector(".av").className = n ? "av" : "av none";
  $("needsBtn").classList.toggle("on", store.needsOpen);
}
export async function loadBots() {
  bots = await api("/bots");
  if (store.current) store.current = bots.find((b) => b.id === store.current.id) || store.current;
  renderList();
}
// The board's state shows in Settings and, when it is down, in the chat; not on the main screen.
export function setBoard(ok) {
  store.board.ok = ok;
}

export function initSidebar() {
  $("q").addEventListener("input", renderList);
}
