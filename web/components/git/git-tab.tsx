import { cardKey } from "@lib/core";
import { emptyNote, mainStep, steps, gitUi, patchUi, useGit } from "@lib/git";
import { GitAsk } from "./git-ask.tsx";
import { GitCommits } from "./git-commits.tsx";
import { GitConfirm } from "./git-confirm.tsx";
import { GitFiles } from "./git-files.tsx";
import { GitHead } from "./git-head.tsx";
import { GitMessage } from "./git-message.tsx";
import { GitSplit } from "./git-split.tsx";

// The run panel's Source control tab, laid out like Orca's: the branch and its pull request, the commit message, one split
// button with every other step in its menu, the staged and unstaged files with their line counts, the branch's commits at
// the foot. A run built in the project's own checkout (no worktree) only commits and pushes.
function GitTab() {
  const snap = useGit((s) => s.snap),
    k = snap ? cardKey(snap.card) : "",
    ui = useGit((s) => s.ui[k] ?? gitUi(k));
  if (!snap) return null;
  const { git: g, branch: b } = snap,
    all = steps(g, b),
    rows = g.rows ?? [],
    staged = rows.filter((r) => r.staged),
    unstaged = rows.filter((r) => !r.staged),
    note = !rows.length && emptyNote(g, b);
  return (
    <div className="flex min-h-full flex-col gap-4.5 px-2 pt-1.5 text-base">
      <GitHead g={g} b={b} rows={rows} all={all} />
      {rows.length > 0 && <GitMessage value={ui.msg ?? snap.msg} onChange={(msg) => patchUi(k, { msg })} />}
      {note && (
        <div className="flex flex-col gap-1.5">
          <b className="text-lg font-semibold">{note.head}</b>
          <span className="text-sm text-muted-foreground">{note.body}</span>
        </div>
      )}
      {ui.ask && b ? (
        <GitAsk />
      ) : (
        <GitSplit main={mainStep(all, staged.length, unstaged.length)} all={all} prUrl={b?.pr?.url} />
      )}
      <GitFiles id="staged" title="Staged changes" rows={staged} shut={ui.shut.staged} />
      <GitFiles id="changes" title="Changes" rows={unstaged} shut={ui.shut.changes} />
      <GitCommits log={g.log ?? []} head={b ? b.branch : g.branch} shut={ui.shut.log} />
      <GitConfirm />
    </div>
  );
}
// Stands in the panel's body (pages/board/panel.tsx) while the Source control tab is open; empty until the panel hands it a run.
export function GitHost() {
  const open = useGit((s) => !!s.snap);
  return open ? (
    <div className="kz-ui">
      <GitTab />
    </div>
  ) : null;
}
