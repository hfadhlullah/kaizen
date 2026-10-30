import { store } from "./store.ts";
import { $, vt } from "./dom.ts";
import { openSources } from "./icebox.ts";
import { close } from "./panel.ts";
import { openSettings } from "./settings.ts";
import { openTerms, termsStop } from "./terms.ts";
import { openHome } from "./home.ts";
import { initIdeas, openIdeas } from "./ideas.ts";
import { initRunView, openWorkspace, runStop, showRunView } from "./run-view.ts";
import { initPhone, isPhone, openPhone } from "./phone.ts";

// ---- views: Home (the chat, at /), the board, Settings and the Icebox as pages in the docked panel, or the Terminal page; each with its own address
export let view = "board";
// The board's own area, not the docked panel.
const AREA = ["board", "terminal", "home", "ideas", "run", "chat", "device"];
export const markView = (v) => {
  // A phone's run workspace belongs to its Runs tab.
  const lit = v === "run" && isPhone() ? "device" : v;
  document
    .querySelectorAll(".rail a.it")
    .forEach((a) =>
      a.dataset.view === lit ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"),
    );
  // The Icebox is titled in the header, top left, like the board.
  document.querySelector(".hdr h1").textContent = v === "sources" ? "Icebox" : v === "ideas" ? "Ideas" : v === "run" ? "Run" : v === "terminal" ? "Terminal" : v === "home" ? (isPhone() ? "kaizen" : "Home") : v === "chat" ? "Chat" : v === "device" ? "Runs" : "Board";
};
export function go(v, push) {
  store.pageGen++;
  if (v === "icebox") v = "sources";
  // A workspace address shows in the run view, which resolves it to a card.
  if (v === "ws") v = "run";
  if (!["settings", "sources", "terminal", "board", "ideas", "run", "chat", "device"].includes(v)) v = "home";
  // A phone has Home, Chat, Runs and Settings: the board, Ideas and the Icebox are set up on a computer,
  // whose Home is the chat.
  if (isPhone() ? ["board", "ideas", "sources"].includes(v) : v === "chat" || v === "device") v = "home";
  const was = view;
  view = v;
  markView(v);
  document.body.classList.toggle("paged", v !== "board");
  document.body.classList.toggle("ice", v === "sources");
  document.body.classList.toggle("setv", v === "settings");
  document.body.classList.toggle("termv", v === "terminal");
  const ph = isPhone() && v === "home";
  document.body.classList.toggle("homev", (v === "home" && !ph) || v === "chat");
  document.body.classList.toggle("phomev", ph || v === "device");
  document.body.classList.toggle("pdevv", v === "device");
  document.body.classList.toggle("ideav", v === "ideas");
  document.body.classList.toggle("runv", v === "run");
  // Leaving a workspace: its panel closes as the board's would, its terminals unmount.
  if (was === "run" && v !== "run") {
    runStop();
    view = "board";
    close();
    view = v;
  }
  // The workspace's address names its card: openWorkspace() pushes it.
  if (push && v !== was && v !== "run")
    history.pushState(null, "", v === "home" ? location.pathname : "?view=" + (v === "sources" ? "icebox" : v));
  dispatchEvent(new Event("kz-view"));
  const p = $("panel");
  if (v === "terminal") openTerms();
  else termsStop();
  if ((v === "home" && !ph) || v === "chat") openHome();
  openPhone(ph ? "home" : v === "device" ? "device" : null);
  if (v === "ideas") openIdeas();
  // After the panel handling below, which closes the board's panel on the way in.
  if (v === "run") queueMicrotask(() => void showRunView(true));
  // The Terminal page is the board's own area, not the docked panel: the panel closes as on the board.
  if (AREA.includes(v)) {
    if (AREA.includes(was)) {
      if (v !== "board" && (was === "board" || was === "ideas")) {
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
  initIdeas(go);
  initRunView();
  initPhone(go, openWorkspace);
  document.querySelectorAll(".rail a[data-view]").forEach((a) => {
    if (a.dataset.view === "notes" || a.dataset.view === "video") return;
    a.onclick = (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
      e.preventDefault();
      if (a.dataset.view === "settings") {
        store.setQ = "";
        store.setBack = view !== "settings";
      }
      vt(() => go(a.dataset.view, true));
    };
  });
  document.querySelector(".rail .home").onclick = (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    e.preventDefault();
    vt(() => go("home", true));
  };
  addEventListener("popstate", () => vt(() => go(new URLSearchParams(location.search).get("view"))));
  // The menu's theme switch while Settings shows: its Theme row follows.
  addEventListener("kz-theme", () => {
    if (view === "settings") openSettings();
  });
}
