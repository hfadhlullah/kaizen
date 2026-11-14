import type { ReactNode } from "react";
import { cn } from "../lib/core/index.ts";
import { Icon } from "../ui/icon.tsx";

// A small pill in the Sources header: a setting to open (the check interval) or a service that is connected, with an
// x to disconnect it, or is not, and connects when pressed.
export function ServiceChip({
  icon,
  label,
  title,
  connected,
  onPress,
  onDisconnect,
  disconnectLabel,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  connected?: boolean;
  onPress?: () => void;
  onDisconnect?: () => void;
  disconnectLabel?: string;
}) {
  const pill = "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-sm [&_svg]:size-3.5";
  if (connected)
    return (
      <span
        title={title}
        className={cn(
          pill,
          "border-[color-mix(in_srgb,var(--ok)_35%,var(--line))] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-foreground [&>svg:first-child]:text-success",
        )}
      >
        {icon}
        {label}
        <button
          type="button"
          aria-label={disconnectLabel}
          title="Disconnect"
          onClick={onDisconnect}
          className="-mr-1 grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-danger"
        >
          <Icon name="x" className="size-[11px]" />
        </button>
      </span>
    );
  return (
    <button
      type="button"
      title={title}
      onClick={onPress}
      className={cn(pill, "border-border bg-card text-muted-foreground hover:text-foreground")}
    >
      {icon}
      {label}
    </button>
  );
}
