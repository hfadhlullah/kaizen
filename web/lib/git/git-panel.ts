import { commitMsg } from "@lib/markdown";
import { getPanel, setPanel } from "@lib/run";
import { setGit } from "./git-store.ts";

// The run's Source control tab is React (web/components/git/git-tab.tsx, rules in web/lib/git/git.ts, requests in
// web/lib/git/git-actions.ts). This module decides when the tab shows and hands it the run's git state on every redraw of
// the panel; what the user typed and which confirm is open live in the tab's own store.

// Commits only after the final approval, and only on a finished run. `d` is the run's /run reply.
export const gitShownIn = (c, d) => {
  const g = d && d.git;
  return !!(g && g.repo) && !c.archived && c.accept !== "needs" && (c.status === "done" || c.awaiting === "approvals.review");
};
// Something is left to do: the footer points at the tab.
export const gitPendingIn = (c, d) => {
  if (!gitShownIn(c, d)) return false;
  const g = d.git,
    b = d.branch;
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
  const impl = getPanel().runDoc.impl;
  // The panel body shows the tab; the tab's own store holds what is typed in it.
  setPanel({ body: "git" });
  setGit({ snap: {
    card: c,
    git: getPanel().runDoc.git,
    branch: getPanel().runDoc.branch,
    msg: commitMsg(impl) || c.title || c.text || "",
    title: (commitMsg(impl) || c.title || "").split("\n")[0],
  } });
}
export const gitLeave = () => setGit({ snap: null });
