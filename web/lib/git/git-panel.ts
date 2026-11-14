import { commitMsg } from "@lib/markdown";
import { setPanel, work } from "@lib/run";
import { setGit } from "./git-store.ts";

// The run's Source control tab is React (web/components/git/git-tab.tsx, rules in web/lib/git/git.ts, requests in
// web/lib/git/git-actions.ts). This module decides when the tab shows and hands it the run's git state on every redraw of
// the panel; what the user typed and which confirm is open live in the tab's own store.

// Commits only after the final approval, and only on a finished run.
export const gitShown = (c) => {
  const g = work.runDoc && work.runDoc.git;
  return (
    !!(g && g.repo) && !c.archived && c.accept !== "needs" && (c.status === "done" || c.awaiting === "approvals.review")
  );
};
// Something is left to do: the footer points at the tab.
export const gitPending = (c) => {
  if (!gitShown(c)) return false;
  const g = work.runDoc.git,
    b = work.runDoc.branch;
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

// The panel body (pages/board/panel.tsx) shows this tab while its `body` is git; another tab replaces it.
export function gitTab(c) {
  const impl = work.runDoc.impl;
  // The panel body shows the tab; the tab's own store holds what is typed in it.
  setPanel({ body: "git" });
  setGit({ snap: {
    card: c,
    git: work.runDoc.git,
    branch: work.runDoc.branch,
    msg: commitMsg(impl) || c.title || c.text || "",
    title: (commitMsg(impl) || c.title || "").split("\n")[0],
  } });
}
export const gitLeave = () => setGit({ snap: null });
