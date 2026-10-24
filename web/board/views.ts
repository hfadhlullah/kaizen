import { store } from "./store.ts";
import { $, vt } from "./dom.ts";
import { openSources } from "./icebox.ts";
import { close } from "./panel.ts";
import { openSettings } from "./settings.ts";
import { openTerms, termsStop } from "./terms.ts";

// ---- views: the board, Settings and the Icebox as pages in the docked panel, or the Terminal page; each with its own address
export let view = "board";
export const markView = (v) => {
  document
    .querySelectorAll(".rail a.it")
    .forEach((a) =>
      a.dataset.view === v ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"),
    );
  // The Icebox is titled in the header, top left, like the board.
  document.querySelector(".hdr h1").textContent = v === "sources" ? "Icebox" : v === "terminal" ? "Terminal" : "Board";
};
export function go(v, push) {
  store.pageGen++;
  if (v === "icebox") v = "sources";
  if (!["settings", "sources", "terminal"].includes(v)) v = "board";
  const was = view;
  view = v;
  markView(v);
  document.body.classList.toggle("paged", v !== "board");
  document.body.classList.toggle("ice", v === "sources");
  document.body.classList.toggle("termv", v === "terminal");
  if (push && v !== was)
    history.pushState(null, "", v === "board" ? location.pathname : "?view=" + (v === "sources" ? "icebox" : v));
  const p = $("panel");
  if (v === "terminal") openTerms();
  else termsStop();
  // The Terminal page is the board's own area, not the docked panel: the panel closes as on the board.
  if (v === "board" || v === "terminal") {
    if (was === "board" || was === "terminal") {
      if (v === "terminal" && was === "board") {
        view = "board";
        close();
        view = v;
      }
      return;
    }
    // Undocked without the slide: it was a page, not a drawer leaving.
    p.style.transition = "none";
    p.classList.remove("open", "docked");
    p.offsetWidth;
    p.style.transition = "";
    view = "board";
    close();
    view = v;
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
      vt(() => go(a.dataset.view, true));
    };
  });
  document.querySelector(".rail .home").onclick = (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    e.preventDefault();
    vt(() => go("board", true));
  };
  addEventListener("popstate", () => vt(() => go(new URLSearchParams(location.search).get("view"))));
  // The menu's theme switch while Settings shows: its Theme row follows.
  addEventListener("kz-theme", () => {
    if (view === "settings") openSettings();
  });
}
