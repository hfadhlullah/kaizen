import { isLive, type Board, type IceItem } from "../lib/icebox.ts";
import { armPromote, iceAct, snoozeAll } from "../lib/icebox-actions.ts";
import { cn } from "../lib/utils.ts";
import { Button } from "../ui/button.tsx";
import { Icon } from "../ui/icon.tsx";
import { BoardMenu } from "./board-menu.tsx";
import { IconButton } from "./icon-button.tsx";
import { KindMenu } from "./kind-menu.tsx";
import { SnoozeMenu } from "./snooze-menu.tsx";

// What can be done to one request: make it a task, snooze it, change its kind or collection, dismiss it or bring a
// dismissed one back. The row shows icons, the card names them, the phone row's opened form names Snooze,
// Collection and Dismiss. A promoted or done request has none.
export function RequestActions({
  item,
  boards,
  variant,
  className,
}: {
  item: IceItem;
  boards: Board[];
  variant: "row" | "card" | "phone";
  className?: string;
}) {
  const closed = item.status === "promoted" || item.status === "done",
    live = isLive(item),
    text = item.text,
    named = variant !== "row",
    btn = (extra?: string) => cn("gap-1.5", extra);
  const dismiss = closed ? null : item.status === "dismissed" ? (
    <Button
      variant="ghost"
      size="sm"
      title="Restore to waiting"
      aria-label={`Restore: ${text}`}
      onClick={() => void iceAct("restore", item, "Restored")}
    >
      Restore
    </Button>
  ) : named && variant === "phone" ? (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`Dismiss: ${text}`}
      className="min-h-11"
      onClick={() => void iceAct("dismiss", item, "Dismissed")}
    >
      <Icon name="x" className="size-3.5" />
      Dismiss
    </Button>
  ) : (
    <IconButton
      icon="x"
      label="Dismiss (d)"
      aria-label={`Dismiss: ${text}`}
      className="size-7"
      onClick={() => void iceAct("dismiss", item, "Dismissed")}
    />
  );
  if (variant === "phone")
    return (
      <div className={cn("flex flex-wrap items-center gap-1", className)}>
        {live && (
          <SnoozeMenu onPick={(u) => void snoozeAll([item], u)}>
            <Button variant="ghost" size="sm" aria-label={`Snooze: ${text}`} className="min-h-11 gap-1.5">
              <Icon name="clock" className="size-3.5" />
              Snooze
            </Button>
          </SnoozeMenu>
        )}
        {live && (
          <BoardMenu item={item} boards={boards}>
            <Button variant="ghost" size="sm" aria-label={`Collection: ${text}`} className="min-h-11">
              {item.board || "Inbox"}
            </Button>
          </BoardMenu>
        )}
        <span className="flex-1" />
        {dismiss}
      </div>
    );
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {!closed &&
        (named ? (
          <Button
            variant="ghost"
            size="sm"
            title="Promote to Tasks (p)"
            aria-label={`Promote to Tasks: ${text}`}
            className={btn()}
            onClick={() => armPromote(item)}
          >
            <Icon name="arrow" className="size-[13px]" />
            Task
          </Button>
        ) : (
          <IconButton
            icon="plus"
            label="Promote to Tasks (p)"
            aria-label={`Promote to Tasks: ${text}`}
            className="size-7"
            onClick={() => armPromote(item)}
          />
        ))}
      {live && (
        <SnoozeMenu onPick={(u) => void snoozeAll([item], u)}>
          {named ? (
            <Button variant="ghost" size="sm" aria-label={`Snooze: ${text}`} className={btn()}>
              <Icon name="clock" className="size-[13px]" />
              Snooze
            </Button>
          ) : (
            <IconButton icon="clock" label="Snooze (h: a week)" aria-label={`Snooze: ${text}`} className="size-7" />
          )}
        </SnoozeMenu>
      )}
      {live && named && (
        <KindMenu item={item}>
          <Button variant="ghost" size="sm" aria-label={`Kind: ${text}`}>
            Kind
          </Button>
        </KindMenu>
      )}
      {live && named && (
        <BoardMenu item={item} boards={boards}>
          <Button variant="ghost" size="sm" aria-label={`Collection: ${text}`}>
            Collection
          </Button>
        </BoardMenu>
      )}
      {named && <span className="flex-1" />}
      {dismiss}
    </div>
  );
}
