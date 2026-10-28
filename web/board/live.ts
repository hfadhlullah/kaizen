import { store } from "./store.ts";
import { load } from "./api.ts";
import { $ } from "./dom.ts";
import { iceBusy, openSources, srcOpen } from "./icebox.ts";
import { deep } from "./panel.ts";
import { keep, urlAll } from "./projects.ts";
import { go, markView } from "./views.ts";

// ---- live
let boot = null;
let pendingReload = false;
function reloadWhenAway() {
  if (document.body.classList.contains("homev")) pendingReload = true;
  else location.reload();
}
function listen() {
  const es = new EventSource("/events");
  es.onmessage = (ev) => {
    if (ev.data === "changed") {
      load(true);
      if (srcOpen() && !iceBusy && !$("src-go")?.disabled && !$("src-add")?.disabled) openSources();
    } else if (ev.data.startsWith("hello ")) {
      const b = ev.data.slice(6);
      if (boot && b !== boot) reloadWhenAway();
      boot = b;
    }
  };
  es.onerror = () => {
    es.close();
    setTimeout(listen, 3000);
  };
}
// Back to the project picked last time, unless the URL says which view it wants. A
// plain fetch: a project that is gone should fall back to all, not raise a toast.
// A page named in the address shows from the first paint; it is filled once the board has loaded.
const v0 = ((v) => (v === "icebox" ? "sources" : v))(new URLSearchParams(location.search).get("view"));

export function initLive() {
  addEventListener("kz-view", () => { if (pendingReload && !document.body.classList.contains("homev")) location.reload(); });
  // Back from a terminal: what was committed or pushed there touched nothing the server watches.
  addEventListener("focus", () => load(true));
  // No view in the address is Home.
  const first = ["settings", "sources", "terminal", "board", "ideas", "run"].includes(v0) ? v0 : "home";
  markView(first);
  document.body.classList.toggle("paged", first !== "board");
  document.body.classList.toggle("ice", v0 === "sources");
  document.body.classList.toggle("termv", v0 === "terminal");
  document.body.classList.toggle("homev", first === "home");
  document.body.classList.toggle("ideav", first === "ideas");
  document.body.classList.toggle("runv", first === "run");
  (async () => {
    let d;
    try {
      d = localStorage.getItem("kz-proj");
    } catch (e) {}
    if (d && !urlAll)
      try {
        if (
          (
            await fetch("/cd", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ dir: d }),
            })
          ).ok
        ) {
          store.all = false;
          store.dir = d;
        }
        else keep();
      } catch (e) {}
    try {
      const f = JSON.parse(sessionStorage.getItem("kz-form"));
      if (f) [store.mode, store.modeKey] = f;
    } catch (e) {}
    load().then(() => {
      go(v0);
      deep();
    });
    listen();
  })();
}
