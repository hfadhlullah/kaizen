import { keep, urlAll } from "@lib/project";
import { navigate } from "@lib/router";
import { deep } from "@lib/run";
import { load, setServer, startEvents } from "@lib/server";

// ---- live: the first read and the event stream (lib/server/poller.ts). The page the address names already shows (the route
// store starts from the URL); it is filled once the board has loaded.
const v0 = new URLSearchParams(location.search).get("view");

export function initLive() {
  // Back to the project picked last time, unless the URL says which view it wants. A
  // plain fetch: a project that is gone should fall back to all, not raise a toast.
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
          setServer({ all: false });
          setServer({ dir: d });
        } else keep();
      } catch (e) {}
    load().then(() => {
      navigate(v0);
      deep();
    });
    startEvents();
  })();
}
