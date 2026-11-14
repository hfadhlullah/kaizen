import { useState } from "react";
import { ago, hostOf, hue, iceKey, isLive, pictures, short, type IceItem, type RowCtx } from "../lib/icebox.ts";
import { armPromote, iceAct, rowDecide, snoozeAll } from "../lib/icebox-actions.ts";
import { setIce } from "../lib/icebox-store.ts";
import { toggleOpen } from "../lib/icebox-view.ts";
import { useRowSwipe } from "../lib/hooks/use-row-swipe.ts";
import { cn } from "../lib/utils.ts";
import { Button } from "../ui/button.tsx";
import { Icon } from "../ui/icon.tsx";
import { KindLabel } from "./kind-label.tsx";
import { KindMenu } from "./kind-menu.tsx";
import { ProjectMark } from "./project-mark.tsx";
import { RequestBadges } from "./request-badges.tsx";
import { RequestDetail } from "./request-detail.tsx";
import { SnoozeMenu } from "./snooze-menu.tsx";

// A request on a phone (under 640 px): kind, two lines, collection and age, a thumbnail for a link (its site's hue and
// letter) or pictures (an icon and the count: nothing is fetched from their site), and an arrow that makes a task. A
// swipe decides it: right a task, left dismissed; a long press snoozes.
export function RequestPhoneRow({ item, ctx, chat }: { item: IceItem; ctx: RowCtx; chat: boolean }) {
  const k = iceKey(item),
    open = ctx.open === k,
    cur = ctx.cur === k,
    live = isLive(item),
    done = item.status === "promoted" || item.status === "done",
    [snooze, setSnooze] = useState(false),
    sw = useRowSwipe({
      enabled: live,
      onDecide: (op) => rowDecide(item, op),
      onHold: () => {
        setIce({ cur: k });
        setSnooze(true);
      },
    }),
    lk = item.link && /^https?:\/\//i.test(item.link.url) ? item.link : null,
    site = lk ? hostOf(lk.url).replace(/^www\./, "") : "",
    n = pictures(item).length;
  return (
    <div>
      <div
        ref={sw.row}
        data-cur={cur || undefined}
        data-key={k}
        className="group/pr relative overflow-hidden border-b border-[color:color-mix(in_srgb,var(--line)_30%,transparent)]"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-between bg-muted px-[18px] text-base font-semibold text-white group-data-[dir=dis]/pr:bg-[color-mix(in_srgb,var(--dim)_85%,var(--ink))] group-data-[dir=pro]/pr:bg-promote"
        >
          <span className="inline-flex items-center gap-1.5 opacity-[calc(.35+var(--p,0)*.65)] invisible group-data-[dir=pro]/pr:visible">
            <Icon name="check" className="size-4" />
            Task
          </span>
          <span className="inline-flex items-center gap-1.5 opacity-[calc(.35+var(--p,0)*.65)] invisible group-data-[dir=dis]/pr:visible">
            Dismiss
            <Icon name="x" className="size-4" />
          </span>
        </div>
        <SnoozeMenu
          open={snooze}
          onOpenChange={setSnooze}
          onPick={(u) => void snoozeAll([item], u)}
          anchor={
            <div
              ref={sw.fg}
              onPointerDown={sw.onPointerDown}
              className={cn(
                "relative flex touch-pan-y items-center gap-2.5 bg-background py-3 pr-1.5 pl-1 transition-[transform,opacity] duration-200 ease-[cubic-bezier(.3,1.3,.5,1)] group-data-[drag]/pr:transition-none motion-reduce:transition-none",
                (cur || open) && "bg-muted",
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex min-h-5 items-center gap-1.5">
                  {live ? (
                    <KindMenu item={item}>
                      <button
                        type="button"
                        aria-label={`Kind: ${item.text}`}
                        title="Kind"
                        className="min-h-7 rounded-xs px-1 text-[10px]"
                      >
                        <KindLabel kind={item.kind} />
                      </button>
                    </KindMenu>
                  ) : (
                    <KindLabel kind={item.kind} />
                  )}
                  {item.sorted === "rules" && live && (
                    <span className="text-xs italic text-muted-foreground">unsorted</span>
                  )}
                  <span className="flex gap-1.5 text-xs text-muted-foreground">
                    <RequestBadges item={item} />
                  </span>
                </div>
                <button
                  type="button"
                  data-title
                  aria-expanded={open}
                  onClick={() => toggleOpen(item)}
                  className="line-clamp-2 bg-transparent py-0.5 text-left text-[15px] leading-[1.35] text-foreground"
                >
                  {item.text}
                </button>
                <span className="flex min-w-0 gap-2 text-sm text-muted-foreground">
                  {ctx.many && (
                    <span className="inline-flex items-center gap-1.5 truncate" title={item.project || ""}>
                      <ProjectMark dir={item.dir} label={item.project || ""} size={14} />
                      {short(item.project || "")}
                    </span>
                  )}
                  {item.board && <span className="truncate">{item.board}</span>}
                  <span className="whitespace-nowrap">{ago(item.at)}</span>
                </span>
              </div>
              {lk ? (
                <span
                  aria-hidden="true"
                  title={lk.title || site}
                  style={{ "--h": hue(site) } as React.CSSProperties}
                  className="grid size-10 shrink-0 place-items-center rounded-[9px] bg-[hsl(var(--h)_42%_40%)] text-base font-bold text-white"
                >
                  {(site[0] || "").toUpperCase()}
                </span>
              ) : (
                n > 0 && (
                  <span
                    aria-hidden="true"
                    title={`${n} pictures`}
                    className="relative grid size-10 shrink-0 place-items-center rounded-[9px] bg-muted text-muted-foreground"
                  >
                    <Icon name="img" className="size-5" />
                    <i className="absolute right-1 bottom-0.5 text-[10px] font-semibold not-italic">{n}</i>
                  </span>
                )
              )}
              {!done &&
                (item.status === "dismissed" ? (
                  <RestoreButton item={item} />
                ) : (
                  <Button
                    variant="default"
                    aria-label={`Make a task: ${item.text}`}
                    title="Make a task"
                    className="size-11 min-h-11 shrink-0 rounded-full p-0 text-muted-foreground shadow-none"
                    onClick={() => armPromote(item)}
                  >
                    <Icon name="arrow" className="size-4" />
                  </Button>
                ))}
            </div>
          }
        />
      </div>
      {open && <RequestDetail item={item} ctx={ctx} chat={chat} phone />}
    </div>
  );
}
function RestoreButton({ item }: { item: IceItem }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`Restore: ${item.text}`}
      onClick={() => void iceAct("restore", item, "Restored")}
    >
      Restore
    </Button>
  );
}
