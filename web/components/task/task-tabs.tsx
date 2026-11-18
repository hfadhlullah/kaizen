import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@lib/core";
import type { TabId, TabMark } from "@lib/task";

export type TabItem = { id: TabId; label: string; mark?: TabMark; count?: number };

// The mark on a tab says why it wants you: amber waits on you (and pings three times when it appears), a ring is an
// agent working, green is finished. It is keyed by its kind, so a change replays the ping.
function Mark({ mark }: { mark?: TabMark }) {
  if (!mark) return null;
  return mark === "run" ? (
    <span
      key={mark}
      aria-hidden="true"
      className="size-3 rounded-full border-[1.5px] border-muted-foreground border-t-transparent motion-safe:animate-spin"
    />
  ) : (
    <span
      key={mark}
      aria-hidden="true"
      className={cn(
        "relative size-2 rounded-full",
        mark === "wait"
          ? "bg-warning after:absolute after:inset-0 after:rounded-full after:bg-warning motion-safe:after:animate-ping3"
          : "bg-success after:absolute after:inset-0 after:rounded-full after:bg-success motion-safe:after:animate-ping3",
      )}
    />
  );
}
// The task page's tabs. The underline slides to the tab that is open.
export function TaskTabs({ tabs, active, onPick }: { tabs: TabItem[]; active: TabId; onPick: (id: TabId) => void }) {
  const refs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({}),
    [bar, setBar] = useState({ left: 0, width: 0 });
  const sig = tabs.map((t) => t.id + t.label + (t.count ?? "") + (t.mark ?? "")).join();
  useLayoutEffect(() => {
    const el = refs.current[active];
    if (el) setBar({ left: el.offsetLeft + 8, width: el.offsetWidth - 16 });
  }, [active, sig]);
  const move = (e: React.KeyboardEvent, i: number) => {
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : -1;
    if (to < 0 || to >= tabs.length) return;
    e.preventDefault();
    onPick(tabs[to].id);
    refs.current[tabs[to].id]?.focus();
  };
  return (
    <div role="tablist" aria-label="Task" className="relative flex flex-none gap-0.5 border-b border-border">
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => void (refs.current[t.id] = el)}
          type="button"
          role="tab"
          id={`task-tab-${t.id}`}
          aria-selected={t.id === active}
          aria-controls={`task-pane-${t.id}`}
          tabIndex={t.id === active ? 0 : -1}
          onClick={() => onPick(t.id)}
          onKeyDown={(e) => move(e, i)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-base text-muted-foreground transition-colors motion-reduce:transition-none",
            t.id === active && "text-strong",
          )}
        >
          {t.label}
          <Mark mark={t.mark} />
          {t.count != null && <i className="rounded-full bg-muted px-1.5 text-[10px] not-italic">{t.count}</i>}
        </button>
      ))}
      <span
        aria-hidden="true"
        className="absolute -bottom-px h-0.5 rounded-sm bg-strong transition-[left,width] duration-300 ease-out motion-reduce:transition-none"
        style={{ left: bar.left, width: bar.width }}
      />
    </div>
  );
}
