import { store } from "./store.ts";
import { api } from "./api.ts";
import { PILL, TITLE } from "./cards.ts";
import { $, avatar, el, toast } from "./dom.ts";
import { closeSide } from "./panel.ts";
import { bots, renderList } from "./sidebar.ts";
import { select } from "./thread.ts";

// ---- "Needs you": cards with status needed, across every agent; a row opens its chat at the card ----

const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};
export async function openNeeds() {
  store.current = null;
  store.needsOpen = true;
  renderList();
  closeSide();
  history.replaceState(null, "", "#needs");
  document.body.classList.add("open");
  $("to").hidden = true;
  $("top").hidden = false;
  $("composer").hidden = true;
  $("doing").hidden = true;
  $("panelBtn").hidden = true;
  $("tav").replaceChildren();
  $("tname").textContent = "Needs you";
  $("ttitle").textContent = "";
  await renderNeeds();
}
export async function renderNeeds() {
  const list = await api("/actions?status=needed").catch((e) => (toast(e.message), null));
  if (!store.needsOpen || !list) return;
  list.sort((x, y) => x.updated - y.updated); // longest waiting first
  $("ttitle").textContent = list.length ? `${list.length} waiting on you` : "";
  $("thread").replaceChildren(
    ...(list.length
      ? list.map((a) => {
          const b = bots.find((x) => x.id === a.bot_id) || { name: "Agent", color: "var(--dim)" },
            s = a.snapshot || {};
          const why = s.stalled
            ? "Run stalled — check it"
            : s.questions?.length
              ? `Question: ${s.questions[0].q}`
              : a.summary || PILL.needed;
          return el(
            "button",
            { class: "ag", onclick: () => openCard(a) },
            avatar(b),
            el(
              "span",
              { class: "meta" },
              el("b", {}, `${b.name} · ${TITLE[a.kind] || "Action"}`),
              el("span", { class: "last" }, why),
            ),
            el("span", { class: "pill needed" }, ago(a.updated)),
          );
        })
      : [el("div", { class: "empty" }, "Nothing waits on you. Cards that need your click in any chat show up here.")]),
  );
}
async function openCard(a) {
  await select(a.bot_id);
  document.getElementById(`act-${a.id}`)?.scrollIntoView({ block: "center" });
}

export function initNeeds() {
  $("needsBtn").onclick = openNeeds;
}
