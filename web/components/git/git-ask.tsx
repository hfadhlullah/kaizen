import { busyOf, useGit, gitUi, patchUi, ask, gitAct } from "../../lib/git/index.ts";
import { cardKey } from "../../lib/core/index.ts";
import { Button } from "../../ui/button.tsx";
import { Input } from "../../ui/input.tsx";
import { Textarea } from "../../ui/textarea.tsx";
import { Field } from "../shared/index.ts";

const head = "flex items-center gap-1.5 text-sm font-semibold";
// The inline form or confirm a step that needs a second look opens, in place of the split button: the pull request's
// title and description, the merge question, or the remove question.
export function GitAsk() {
  const snap = useGit((s) => s.snap)!,
    busy = useGit(busyOf),
    k = cardKey(snap.card),
    ui = useGit((s) => s.ui[k] ?? gitUi(k)),
    b = snap.branch!,
    pr = b.pr,
    what = ui.ask;
  if (!what) return null;
  const cancel = (
    <Button variant="ghost" onClick={() => ask(undefined)}>
      Cancel
    </Button>
  );
  const push = b.upstream && snap.git.ahead === 0 ? "" : "Push & ";
  if (what === "pr" || what === "draft")
    return (
      <div className="flex flex-col gap-1.5">
        <div className={head}>
          {what === "draft" ? "Draft pull request" : "Pull request"} into {b.base}
        </div>
        <Field label="Title">
          {(p) => (
            <Input {...p} value={ui.title ?? snap.title} onChange={(e) => patchUi(k, { title: e.target.value })} />
          )}
        </Field>
        <Field label="Description">
          {(p) => (
            <Textarea
              {...p}
              value={ui.body ?? `Run ${snap.card.id}.`}
              onChange={(e) => patchUi(k, { body: e.target.value })}
              className="min-h-(--btn-s) resize-y rounded-sm border border-border bg-card px-2.5 py-1.5 hover:border-muted-foreground focus-visible:border-primary"
              rows={3}
            />
          )}
        </Field>
        <div className="flex justify-end gap-1.5">
          {cancel}
          <Button
            variant="primary"
            disabled={!!busy}
            onClick={() => void gitAct(what === "draft" ? "go-draft" : "go-pr")}
          >
            {busy === "go-pr" || busy === "go-draft"
              ? "Creating PR…"
              : `${push}${what === "draft" ? "create draft PR" : "create PR"}`}
          </Button>
        </div>
      </div>
    );
  if (what === "merge")
    return (
      <div className="flex flex-col gap-1.5">
        <div className={head}>
          Merge #{pr?.number} into {b.base} by rebase?
        </div>
        <div className="flex justify-end gap-1.5">
          {cancel}
          <Button variant="primary" disabled={!!busy} onClick={() => void gitAct("go-merge")}>
            {busy === "go-merge" ? "Merging…" : "Merge PR"}
          </Button>
        </div>
      </div>
    );
  return (
    <div className="flex flex-col gap-1.5">
      <div className={head}>Remove the worktree and delete {b.branch}?</div>
      <div className="text-sm text-muted-foreground">
        Its work is on {b.base}. The branch is deleted here{b.local ? "" : " and on GitHub"}.
      </div>
      <div className="flex justify-end gap-1.5">
        {cancel}
        <Button variant="danger" disabled={!!busy} onClick={() => void gitAct("go-remove")}>
          {busy === "go-remove" ? "Removing…" : "Remove workspace"}
        </Button>
      </div>
    </div>
  );
}
