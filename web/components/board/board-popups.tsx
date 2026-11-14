import { closePopup, useBoard } from "../../lib/board/index.ts";
import { host, cn } from "../../lib/core/index.ts";
import { Dialog, DialogContent, DialogTitle } from "@web/ui";
import { CardForm } from "./card-form.tsx";
import { RunForm } from "./run-form.tsx";
import { TaskForm } from "./task-form.tsx";

// The Board's forms as a dialog over whatever page asked: Run on Tasks, Edit / Reject / Delete from a panel, New task
// from the header, `n` or an empty board. A phone gets a sheet from the bottom. The same forms sit inline in a column.
export function BoardPopups() {
  const popup = useBoard((s) => s.popup),
    snap = useBoard((s) => s.snap);
  if (!popup) return null;
  const close = () => {
    host.stopDictation();
    closePopup();
  };
  const name =
    popup.kind === "new" ? "New task" : popup.kind === "run" ? "Run" : popup.mode === "edit" ? "Edit task" : "Task";
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent
        aria-describedby={undefined}
        className={cn(
          "max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-h-[85dvh] max-sm:w-screen max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none",
          popup.kind === "new" && "overflow-y-auto",
        )}
      >
        <DialogTitle className="sr-only">{name}</DialogTitle>
        {popup.kind === "form" && <CardForm card={popup.card} mode={popup.mode} onDone={close} />}
        {popup.kind === "run" && <RunForm card={popup.card} onStart={popup.onStart} onDone={close} />}
        {popup.kind === "new" && (
          <TaskForm
            picking={!!snap && (snap.all || popup.choose || snap.phone)}
            preset={popup.dir ?? null}
            choose={popup.choose}
            onDone={close}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
