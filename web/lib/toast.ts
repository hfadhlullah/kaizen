import { toast as sonner } from "sonner";

// One at a time, as before: a new toast takes the place of the one showing. Each gets an id of its own (and the old
// one is dismissed), because sonner keeps the old timer when a toast is replaced under the same id, so a new message
// sent while an old one was nearly done would vanish with it.
let last: string | number | undefined;
function show(message: string, options: Parameters<typeof sonner>[1]) {
  if (last !== undefined) sonner.dismiss(last);
  last = sonner(message, options);
}
// The board's one toast, old pages and new: web/board/toast.ts forwards here. With `report`, the toast carries
// a link to a prefilled GitHub bug form (/issue) and stays long enough to click it.
export function toast(message: string, report?: Record<string, string>) {
  show(message, {
    duration: report ? 8000 : 4000,
    action: report
      ? {
          label: "Report",
          onClick: () => void window.open("/issue?" + new URLSearchParams(report), "_blank", "noopener"),
        }
      : undefined,
  });
}
// A toast with one more thing to do ("Snoozed until Sat · Undo"): pressing it runs `onUndo` and closes the toast.
export function toastUndo(message: string, onUndo: () => void) {
  show(message, { duration: 8000, action: { label: "Undo", onClick: onUndo } });
}
