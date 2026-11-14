// The rail's rows and + open a card or the new-task form here, on the board, when it has them. A row of another project than
// the one picked switches the board to that project first; a workspace row opens in place.
import { navigate, touchRoute } from "@lib/router";
import { cardHref, wsHref } from "@lib/rail";
import { pick } from "@lib/project";
import { getServer } from "@lib/server";
import { openWorkspace } from "@lib/run";

export function initOpenEvents() {
  addEventListener("kz-open-card", (e: any) => {
    const { dir, id, text } = e.detail;
    const find = () =>
      getServer().state.cards.find(
        (x: any) => x.state === dir && (id ? x.kind === "run" && x.id === id : x.kind === "idea" && x.text === text),
      );
    const c = find();
    if (c) {
      e.preventDefault();
      return openWorkspace(c);
    }
    if (!dir || dir === getServer().dir) return;
    e.preventDefault();
    const href = cardHref({ state: dir, kind: id ? "run" : "idea", id, text });
    pick(dir)
      .then(() => {
        const c = find();
        if (c) openWorkspace(c);
        else location.href = href;
      })
      .catch(() => (location.href = href));
  });
  // A workspace row opens in place: the run view resolves it (showRunView).
  addEventListener("kz-open-ws", (e: any) => {
    e.preventDefault();
    history.pushState(null, "", wsHref(e.detail.dir, e.detail.ws));
    touchRoute();
    navigate("ws");
  });
}
