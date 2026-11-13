import { store } from "./store.ts";
import { $ } from "./dom.ts";
import { commitMsg } from "./markdown.ts";
import { react } from "./views.ts";

// The run's Source control tab is React (web/components/git-tab.tsx, rules in web/lib/git.ts, requests in
// web/lib/git-actions.ts). This module decides when the tab shows and hands it the run's git state on every redraw of
// the panel; what the user typed and which confirm is open live in the tab's own store.

// Commits only after the final approval, and only on a finished run.
export const gitShown = (c) => {
  const g = store.runDoc && store.runDoc.git;
  return (
    !!(g && g.repo) && !c.archived && c.accept !== "needs" && (c.status === "done" || c.awaiting === "approvals.review")
  );
};
// Something is left to do: the footer points at the tab.
export const gitPending = (c) => {
  if (!gitShown(c)) return false;
  const g = store.runDoc.git,
    b = store.runDoc.branch;
  return (
    g.files.length > 0 ||
    (b
      ? (b.upstream && g.ahead > 0) ||
        (b.pr && b.pr.state === "OPEN") ||
        (b.landed && !b.pr) ||
        (b.pr && b.pr.state === "MERGED")
      : g.ahead > 0)
  );
};

// The tab stands in an element of the panel's body (the body is rebuilt for every other tab); a redraw of this tab keeps
// the element, so what is typed in it stays.
let slot: HTMLElement | null = null;
export function gitTab(c) {
  const body = $("pbody");
  if (!slot || slot.parentElement !== body) {
    body.replaceChildren();
    body.append((slot = document.createElement("div")));
    slot.className = "kz-ui";
  }
  const impl = store.runDoc.impl;
  react.drawGit({
    card: c,
    git: store.runDoc.git,
    branch: store.runDoc.branch,
    msg: commitMsg(impl) || c.title || c.text || "",
    title: (commitMsg(impl) || c.title || "").split("\n")[0],
    slot,
  });
}
// A tab that is not this one: the slot goes with the body.
export const gitLeave = () => ((slot = null), react.drawGit(null));
