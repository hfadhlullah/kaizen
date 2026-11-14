import { useEffect } from "react";
import { runOf, setGit, useGit } from "../../lib/git/index.ts";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@web/ui";
import { GitIcon } from "./git-icon.tsx";

// The two questions the tab asks in a dialog: discard changes (the file named, Cancel or Discard), and the preflight that
// stopped a land (what it found, Cancel or Go ahead anyway). Closing any other way is Cancel.
export function GitConfirm() {
  const c = useGit((s) => s.confirm),
    here = useGit(runOf);
  const answer = (yes: boolean) => c && (setGit({ confirm: null }), c.ok(yes));
  // Another run's panel opened while this question stood: it was about that run's files, so the answer is no.
  useEffect(() => {
    if (c && c.run !== here) answer(false);
  });
  if (!c || c.run !== here) return null;
  const box =
    "max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-xs border border-border px-2 py-1.5 font-mono text-sm";
  return (
    <AlertDialog open onOpenChange={(o) => !o && answer(false)}>
      <AlertDialogContent>
        {c.kind === "discard" ? (
          <>
            <AlertDialogTitle>
              {c.many ? `Discard all ${c.many} unstaged changes?` : `Discard changes to "${c.path.split("/").pop()}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {c.many
                ? "This reverts every unstaged file below; new files are deleted."
                : c.untracked
                  ? "This will delete this new file."
                  : "This will revert the unstaged changes to this file."}{" "}
              This cannot be undone.
            </AlertDialogDescription>
            <div className={box}>{c.path}</div>
          </>
        ) : (
          <>
            <AlertDialogTitle>
              {c.pf.branch === c.pf.base
                ? `Stopped before pushing to ${c.pf.base}`
                : `Stopped before landing ${c.pf.branch || "this run"} on ${c.pf.base}`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Other work needs a look first. Rebase, wait for CI or land the other work first, or go ahead anyway.
            </AlertDialogDescription>
            <div className={box}>
              {c.pf.issues.map((i, n) => (
                <div key={n}>
                  {i.what}
                  {i.files?.length
                    ? `: ${i.files.slice(0, 6).join(", ")}${i.files.length > 6 ? ` +${i.files.length - 6} more` : ""}`
                    : ""}
                </div>
              ))}
            </div>
            {c.pf.notes.length > 0 && (
              <p className="text-sm text-muted-foreground">{c.pf.notes.map((n) => `${n}. `)}</p>
            )}
          </>
        )}
        <div className="mt-1 flex justify-end gap-1.5">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction danger onClick={() => answer(true)}>
            {c.kind === "discard" ? (
              <>
                <GitIcon name="undo" />
                Discard
              </>
            ) : (
              "Go ahead anyway"
            )}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
