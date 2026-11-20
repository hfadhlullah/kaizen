import { useEffect, useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, Checkbox } from "@web/ui";

// "Delete this task?": one question, Cancel and one confirming button. Closing by Escape or the backdrop cancels.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger,
  ack,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  ack?: string; // a tick box that must be ticked before the confirming button works
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [ticked, setTicked] = useState(false);
  // Every question starts unticked.
  useEffect(() => setTicked(false), [open, title]);
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        {description && <AlertDialogDescription className="whitespace-pre-line">{description}</AlertDialogDescription>}
        {ack && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox data-ack="1" checked={ticked} onCheckedChange={(c) => setTicked(c === true)} />
            {ack}
          </label>
        )}
        <div className="mt-1 flex justify-end gap-1.5">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction danger={danger} disabled={!!ack && !ticked} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
