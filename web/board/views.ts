import { store } from "./store.ts";
import { $ } from "./dom.ts";
import { openSources } from "./icebox.ts";
import { close } from "./panel.ts";
import { openSettings } from "./settings.ts";

// ---- views: the board, or Settings and the Icebox as pages in the docked panel, each with its own address
export let view = "board";
export const markView = (v) =>
  document
    .querySelectorAll(".rail a.it")
    .forEach((a) =>
      a.dataset.view === v ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"),
    );
export function go(v, push) {
  store.pageGen++;
  if (v === "icebox") v = "sources";
  if (!["settings", "sources"].includes(v)) v = "board";
  const was = view;
  view = v;
  markView(v);
  document.body.classList.toggle("paged", v !== "board");
  document.body.classList.toggle("ice", v === "sources");
  if (push && v !== was)
    history.pushState(null, "", v === "board" ? location.pathname : "?view=" + (v === "sources" ? "icebox" : v));
  const p = $("panel");
  if (v === "board") {
    if (was === "board") return;
    // Undocked without the slide: it was a page, not a drawer leaving.
    p.style.transition = "none";
    p.classList.remove("open", "docked");
    p.offsetWidth;
    p.style.transition = "";
    close();
    return;
  }
  p.classList.add("docked");
  if (v === "settings") openSettings();
  else openSources();
}

export function initViews() {
  document.querySelectorAll(".rail a[data-view]").forEach((a) => {
    if (a.dataset.view === "notes") return;
    a.onclick = (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
      e.preventDefault();
      if (a.dataset.view === "settings") store.setQ = "";
      go(a.dataset.view, true);
    };
  });
  document.querySelector(".rail .home").onclick = (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    e.preventDefault();
    go("board", true);
  };
  addEventListener("popstate", () => go(new URLSearchParams(location.search).get("view")));
  // The menu's theme switch while Settings shows: its Theme row follows.
  addEventListener("kz-theme", () => {
    if (view === "settings") openSettings();
  });
}
