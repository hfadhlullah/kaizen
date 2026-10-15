import { store } from "./store.ts";
import { api } from "./api.ts";
import { $, avatar, el, icon, toast } from "./dom.ts";
import { closeSide, openSide, renderAgent } from "./panel.ts";
import { bots, loadBots, renderList, shown } from "./sidebar.ts";
import { select } from "./thread.ts";

// ---- "To:" picker: open an agent or create one from a division template ----
let toHi = 0;
export function openTo() {
  store.current = null;
  store.needsOpen = false;
  renderList();
  closeSide();
  document.body.classList.add("open");
  $("top").hidden = true;
  $("to").hidden = false;
  $("composer").hidden = true;
  $("doing").hidden = true;
  $("thread").replaceChildren();
  $("toq").value = "";
  renderTo();
  $("toq").focus();
}
// "Create new agent" first, then the ready-made agents you have not added, then your agents.
function renderTo() {
  const q = $("toq").value.trim().toLowerCase();
  const hit = (n) => !q || n.toLowerCase().includes(q);
  const presets = store.info.roles.filter((r) => r.preset && hit(r.name) && !bots.some((b) => b.role === r.id));
  const mine = bots.filter((b) => hit(b.name));
  $("tomenu").replaceChildren(
    el(
      "button",
      { type: "button", onclick: () => createBot() },
      icon(el("span", { class: "plus-c" }), "plus"),
      el("span", {}, "Create new agent"),
    ),
    ...(presets.length ? [el("div", { class: "grp" }, "Add an agent")] : []),
    ...presets.map((r) =>
      el(
        "button",
        { type: "button", onclick: () => createBot(r.id) },
        avatar(r, "sm"),
        el("span", {}, r.name, el("small", {}, r.blurb)),
      ),
    ),
    ...(presets.length && mine.length ? [el("div", { class: "grp" }, "Your agents")] : []),
    ...mine.map((b) =>
      el("button", { type: "button", onclick: () => select(b.id) }, avatar(b, "sm"), el("span", {}, b.name)),
    ),
  );
  toHi = 0;
  hiTo();
}
const toButtons = () => [...$("tomenu").querySelectorAll("button")];
function hiTo() {
  toButtons().forEach((b, i) => b.classList.toggle("hi", i === toHi));
}
// A ready-made agent opens straight into its chat; a blank one opens its settings so you
// give it a name and describe its job.
async function createBot(role = "custom") {
  try {
    const b = await api("/bots", { method: "POST", body: { role } });
    await loadBots();
    await select(b.id);
    if (role !== "custom") return;
    await renderAgent();
    openSide("agent");
    document.querySelector('#sideBody input[aria-label="Name"]')?.select();
  } catch (e) {
    toast(e.message);
  }
}

export function initTo() {
  $("toq").addEventListener("input", renderTo);
  $("toq").addEventListener("keydown", (e) => {
    const bs = toButtons();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      toHi = Math.min(bs.length - 1, toHi + 1);
      hiTo();
      bs[toHi]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      toHi = Math.max(0, toHi - 1);
      hiTo();
      bs[toHi]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      bs[toHi]?.click();
    } else if (e.key === "Escape" && shown()[0]) select(shown()[0].id);
  });
}
