import { store } from "./store.ts";
import { commitMsg } from "./markdown.ts";
import { react } from "./views.ts";

// The run's Source control tab is React (web/components/git/git-tab.tsx, rules in web/lib/git/git.ts, requests in
// web/lib/git/git-actions.ts). This module decides when the tab shows and hands it the run's git state on every redraw of
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

// The tab's element in the panel's body is made by react-mount.ts drawGit; a tab that is not this one drops it.
export function gitTab(c) {
  const impl = store.runDoc.impl;
  react.drawGit({
    card: c,
    git: store.runDoc.git,
    branch: store.runDoc.branch,
    msg: commitMsg(impl) || c.title || c.text || "",
    title: (commitMsg(impl) || c.title || "").split("\n")[0],
  });
}
export const gitLeave = () => react.drawGit(null);
