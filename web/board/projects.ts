import { store } from "./store.ts";
import { load, post } from "./api.ts";
import { render } from "./cards.ts";
import { $, esc } from "./dom.ts";
import { openSources, srcOpen } from "./icebox.ts";
import { toast } from "./toast.ts";
import { view } from "./views.ts";

// The picked project outlives a reload. Saved only where the user changes it, so a
// second tab refreshing cannot undo it; a view the URL asked for is a one-off.
export const urlAll = new URLSearchParams(location.search).has("all");
export function keep(d) {
  if (urlAll) return;
  try {
    d ? localStorage.setItem("kz-proj", d) : localStorage.removeItem("kz-proj");
  } catch (e) {}
}
// A project shows by its folder name alone; the full path stays in the tooltip.
export const short = (l) => l.split(/[\\/]/).pop() || l;
// The project picker: a button shaped like a select that opens a search field over the list.
export function list() {
  const q = $("projq").value.trim().toLowerCase();
  let g = 0;
  $("projs").innerHTML =
    store.PL.map((p, i) =>
      p[0].toLowerCase().includes(q)
        ? (p[2] && !g++ ? `<div class="grp">In your projects folder</div>` : "") +
          `<button role="option" data-i="${i}" title="${esc(p[0])}">${esc(short(p[0]))}</button>`
        : "",
    ).join("") || `<div class="grp">No match</div>`;
  const f = $("projs").querySelector("button");
  if (f) f.classList.add("on");
}
function pop(on) {
  $("projpop").hidden = !on;
  $("proj").setAttribute("aria-expanded", on);
  if (on) {
    $("projq").value = "";
    list();
    $("projq").focus();
  }
}
async function pick(v) {
  if (v === "__find") {
    toast("Searching…");
    const j = await post("/find", {});
    if (j.ok) toast(j.added ? `Found ${j.added} new project${j.added === 1 ? "" : "s"}` : "No new projects found");
  } else if (v === "all") {
    store.all = true;
    keep();
  } else {
    const j = await post("/cd", { dir: v });
    if (j.ok) {
      store.all = false;
      keep(v);
    }
  }
  await load();
  if (view === "sources") openSources();
}
// Known projects, plus any folder a card comes from that is not one (the global inbox).
// New idea in All projects: the projects being shown, else every one.
export let newDir = null;
// Same combo as the header's project picker: a button, then a searchable list.
export function ideaCombo(f) {
  const ps = ideaDirs(),
    btn = f.querySelector("#newdir"),
    pp = f.querySelector("#ndc .menu-pop"),
    q = pp.querySelector("input"),
    box = f.querySelector("#nds");
  if (!ps.some((p) => p.dir === newDir)) newDir = ps[0]?.dir ?? null;
  const name = () => {
    btn.textContent = (ps.find((p) => p.dir === newDir) || { label: "Choose project" }).label;
  };
  const draw = () => {
    const t = q.value.trim().toLowerCase();
    box.innerHTML =
      ps
        .filter((p) => p.label.toLowerCase().includes(t))
        .map(
          (p) =>
            `<button type="button" role="option" data-d="${esc(p.dir)}" title="${esc(p.label)}" class="${p.dir === newDir ? "on" : ""}">${esc(p.label)}</button>`,
        )
        .join("") || `<div class="grp">No match</div>`;
    box.querySelectorAll("button").forEach(
      (b) =>
        (b.onclick = () => {
          newDir = b.dataset.d;
          name();
          open(false);
          f.querySelector("#newidea").focus();
        }),
    );
  };
  const open = (on) => {
    pp.hidden = !on;
    btn.setAttribute("aria-expanded", on);
    if (on) {
      q.value = "";
      draw();
      q.focus();
    }
  };
  btn.onclick = (e) => {
    e.preventDefault();
    open(pp.hidden);
  };
  q.oninput = draw;
  q.onkeydown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      open(false);
    }
    if (e.key === "Enter") {
      e.preventDefault();
      box.querySelector("button")?.click();
    }
  };
  name();
}
function ideaDirs() {
  const sp = showable(),
    pick = sp.filter((p) => store.shown.has(p.dir));
  return pick.length ? pick : sp;
}
export function showable() {
  const l = [...store.S.projects];
  for (const c of store.S.cards) if (!l.some((p) => p.dir === c.state)) l.push({ dir: c.state, label: c.where });
  return l;
}
let SP = [];
export function showList() {
  const q = $("showq").value.trim().toLowerCase();
  SP = showable();
  $("shows").innerHTML =
    SP.map((p, i) =>
      p.label.toLowerCase().includes(q)
        ? `<label title="${esc(p.label)}"><input type="checkbox" data-i="${i}" ${store.shown.has(p.dir) ? "checked" : ""}>${esc(p.label)}</label>`
        : "",
    ).join("") || `<div class="grp">No match</div>`;
}
export function setShown() {
  try {
    localStorage.setItem("kz-show", JSON.stringify([...store.shown]));
  } catch (e) {}
  render();
  // The Icebox narrows by the same picker, so it redraws too.
  if (srcOpen()) openSources();
}

export function initProjects() {
  $("proj").onclick = () => pop($("projpop").hidden);
  $("projq").oninput = list;
  $("projq").onkeydown = (e) => {
    const bs = [...$("projs").querySelectorAll("button")],
      i = bs.findIndex((b) => b.classList.contains("on"));
    if (e.key === "Escape") {
      pop(false);
      $("proj").focus();
    } else if (e.key === "Enter") {
      if (bs[i]) bs[i].click();
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && bs[i]) {
      e.preventDefault();
      const n = bs[(i + (e.key === "ArrowDown" ? 1 : bs.length - 1)) % bs.length];
      bs[i].classList.remove("on");
      n.classList.add("on");
      n.scrollIntoView({ block: "nearest" });
    }
  };
  $("projs").onclick = (e) => {
    const b = e.target.closest("button");
    if (b) {
      pop(false);
      pick(store.PL[b.dataset.i][1]);
    }
  };
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#combo")) pop(false);
  });
  $("show").onclick = () => {
    const on = $("showpop").hidden;
    $("showpop").hidden = !on;
    $("show").setAttribute("aria-expanded", on);
    if (on) {
      $("showq").value = "";
      showList();
      $("showq").focus();
    }
  };
  $("showq").oninput = showList;
  $("showq").onkeydown = (e) => {
    if (e.key === "Escape") {
      $("showpop").hidden = true;
      $("show").setAttribute("aria-expanded", false);
      $("show").focus();
    }
  };
  // render() redraws the list; the ticked box keeps keyboard focus.
  $("shows").onchange = (e) => {
    const i = e.target.dataset.i,
      d = SP[i]?.dir;
    if (!d) return;
    e.target.checked ? store.shown.add(d) : store.shown.delete(d);
    setShown();
    $("shows").querySelector(`[data-i="${i}"]`)?.focus();
  };
  $("showall").onclick = () => {
    store.shown.clear();
    setShown();
  };
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#showc")) {
      $("showpop").hidden = true;
      $("show").setAttribute("aria-expanded", false);
    }
  });
  $("newtop").onclick = () => {
    store.mode = "new";
    render();
    $("board").scrollTo(0, 0);
  };
}
