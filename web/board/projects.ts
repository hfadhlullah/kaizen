import { store } from "./store.ts";
import { startDir } from "./labels.ts";
import { load, post } from "./api.ts";
import { newIdea, render } from "./cards.ts";
import { $, html, ico } from "./dom.ts";
import { openSources, srcOpen } from "./icebox.ts";
import { toast } from "./toast.ts";
import { openAdd } from "./add-project.ts";
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
// A project's mark in every picker: its own logo when /state found one, else its initial.
// A logo the browser cannot draw falls back to the initial too.
export const plogo = (dir, label = "") => {
  const ini = html`<span class="plogo" aria-hidden="true">${(short(label) || "?").charAt(0).toUpperCase()}</span>`;
  return store.S?.projects?.some((p) => p.dir === dir && p.logo)
    ? html`<img class="plogo" src="/project-logo?dir=${encodeURIComponent(dir)}" alt="" loading="lazy" onerror="this.outerHTML=this.dataset.f" data-f="${String(ini)}">`
    : ini;
};
// A picker row: the mark, then the folder name; the full path in the tooltip.
const prow = (dir, label) => html`${plogo(dir, label)}<span>${short(label)}</span>`;
// The project picker: a button shaped like a select that opens a search field over the list.
export function list() {
  const q = $("projq").value.trim().toLowerCase();
  let g = 0;
  $("projs").innerHTML =
    store.PL.map((p, i) =>
      p[0].toLowerCase().includes(q)
        ? html`${p[2] && !g++ ? html`<div class="grp">In your projects folder</div>` : ""}<button role="option" data-i="${i}" title="${p[0]}">${p[1] === "all" ? html`<span class="plogo" aria-hidden="true">${ico("board")}</span><span>${p[0]}</span>` : p[1] === "__new" || p[1] === "__find" || p[1] === "__clone" ? html`<span class="plogo" aria-hidden="true">${ico("plus")}</span><span>${p[0]}</span>` : prow(p[1], p[0])}</button>`
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
export async function pick(v) {
  if (v === "__find") {
    toast("Searching…");
    const j = await post("/find", {});
    if (j.ok) toast(j.added ? `Found ${j.added} new project${j.added === 1 ? "" : "s"}` : "No new projects found");
  } else if (v === "__new" || v === "__clone") {
    // The same sheet as the side menu's +; it adds the project and reloads onto it.
    openAdd({ start: v === "__new" ? "create" : "clone" });
    return;
  } else if (v === "all") {
    store.all = true;
    keep();
  } else {
    const j = await post("/cd", { dir: v });
    if (j.ok) {
      store.all = false;
      store.dir = v;
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
export function ideaCombo(f, choose = false) {
  const ps = ideaDirs(),
    btn = f.querySelector("#newdir"),
    pp = f.querySelector("#ndc .menu-pop"),
    q = pp.querySelector("input"),
    box = f.querySelector("#nds");
  // Opened from a page with no project of its own: no default, the user picks one.
  newDir = startDir(ps.map((p) => p.dir), newDir, choose);
  const name = () => {
    const p = ps.find((p) => p.dir === newDir);
    btn.innerHTML = p ? prow(p.dir, p.label) : "Choose project";
  };
  const draw = () => {
    const t = q.value.trim().toLowerCase();
    box.innerHTML =
      ps
        .filter((p) => p.label.toLowerCase().includes(t))
        .map(
          (p) =>
            html`<button type="button" role="option" data-d="${p.dir}" title="${p.label}" class="${p.dir === newDir ? "on" : ""}">${prow(p.dir, p.label)}</button>`,
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
export const setNewDir = (d) => (newDir = d);
// The same searchable picker as the header's, for any page: All projects first, then each project.
export function projectPicker(host: HTMLElement, ps: { dir: string; label: string }[], value: string, onPick: (dir: string) => void) {
  host.classList.add("combo");
  host.innerHTML = String(
    html`<button type="button" class="sel" aria-label="Project" aria-haspopup="listbox" aria-expanded="false"></button><div class="menu-pop" hidden><input class="sel" aria-label="Search projects" placeholder="Search projects…" spellcheck="false" autocomplete="off"><div role="listbox"></div></div>`,
  );
  const btn = host.querySelector("button")!,
    pp = host.querySelector<HTMLElement>(".menu-pop")!,
    q = pp.querySelector("input")!,
    box = pp.querySelector<HTMLElement>("[role=listbox]")!;
  const all = { dir: "", label: "All projects" };
  const row = (p) => (p.dir ? prow(p.dir, p.label) : html`<span class="plogo" aria-hidden="true">${ico("board")}</span><span>All projects</span>`);
  btn.innerHTML = String(row([all, ...ps].find((p) => p.dir === value) || all));
  const draw = () => {
    const t = q.value.trim().toLowerCase();
    box.innerHTML =
      [all, ...ps]
        .filter((p) => !t || p.label.toLowerCase().includes(t))
        .map((p) => html`<button type="button" role="option" data-d="${p.dir}" title="${p.label}" class="${p.dir === value ? "on" : ""}">${row(p)}</button>`)
        .join("") || `<div class="grp">No match</div>`;
    box.querySelectorAll<HTMLElement>("button").forEach((b) => (b.onclick = () => onPick(b.dataset.d!)));
  };
  btn.onclick = () => {
    pp.hidden = !pp.hidden;
    btn.setAttribute("aria-expanded", String(!pp.hidden));
    if (!pp.hidden) {
      q.value = "";
      draw();
      q.focus();
    }
  };
  q.oninput = draw;
  q.onkeydown = (e) => {
    if (e.key === "Escape") (pp.hidden = true), btn.focus();
    if (e.key === "Enter") box.querySelector<HTMLElement>("button")?.click();
  };
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
        ? html`<button type="button" role="menuitemcheckbox" data-i="${i}" aria-checked="${String(store.shown.has(p.dir))}" title="${p.label}">${prow(p.dir, p.label)}<svg class="ck"><use href="#i-check"/></svg></button>`
        : "",
    ).join("") || `<div class="grp">No match</div>`;
  const n = SP.filter((p) => store.shown.has(p.dir)).length;
  $("showcount").textContent = n ? `${n} of ${SP.length} shown` : `All ${SP.length} shown`;
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
  // render() redraws the list; the toggled row keeps keyboard focus.
  $("shows").onclick = (e) => {
    const b = e.target.closest("button[data-i]"),
      i = b?.dataset.i,
      d = SP[i]?.dir;
    if (!d) return;
    store.shown.has(d) ? store.shown.delete(d) : store.shown.add(d);
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
  $("newtop").onclick = newIdea;
}
