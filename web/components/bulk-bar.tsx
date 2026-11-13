import { Button } from "../ui/button.tsx";
import { Icon } from "../ui/icon.tsx";

// What can be done to the checked requests at once: promote (one task each), snooze a week, dismiss, or clear.
export function BulkBar({
  count,
  busy,
  onPromote,
  onSnooze,
  onDismiss,
  onClear,
}: {
  count: number;
  busy: boolean;
  onPromote: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
  onClear: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Selected requests"
      className="sticky top-0 z-[1] flex items-center gap-2 rounded-t-md border border-b-0 border-[color:color-mix(in_srgb,var(--line)_50%,transparent)] bg-[color-mix(in_srgb,var(--dim)_12%,var(--bg-2))] py-1.5 pr-2 pl-3.5 text-base text-foreground"
    >
      <span>{count} selected</span>
      <span className="flex-1" />
      <Button size="sm" title="Promote (p)" disabled={busy} onClick={onPromote}>
        <Icon name="plus" className="size-3.5" /> Promote
      </Button>
      <Button variant="ghost" size="sm" title="Snooze a week (h)" disabled={busy} onClick={onSnooze}>
        <Icon name="clock" className="size-3.5" /> Snooze
      </Button>
      <Button variant="ghost" size="sm" title="Dismiss (d)" disabled={busy} onClick={onDismiss}>
        <Icon name="x" className="size-3.5" /> Dismiss
      </Button>
      <Button variant="ghost" size="sm" title="Clear selection (Esc)" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
