import type { ComponentProps } from "react";
import { age, cn } from "@lib/core";
import { dirName, taskStatus, taskTitle, type TaskView } from "@lib/task";
import { StatusBadge } from "./status-badge.tsx";

// One row of the Tasks list: marker, title and project, state and next step, age. `kb` is the keyboard's row.
export function TaskRow({ task, kb, ...props }: { task: TaskView; kb?: boolean } & ComponentProps<"button">) {
  const t = task;
  return (
    <button
      type="button"
      className={cn(
        "grid min-h-12 w-full grid-cols-[12px_minmax(0,1fr)_minmax(0,34%)_auto] items-center gap-3 border-b border-b-[color:color-mix(in_srgb,var(--line)_30%,transparent)] px-3 py-2 text-left text-foreground last:border-b-0 hover:bg-muted focus-visible:shadow-[inset_0_0_0_1px_var(--line)] max-sm:grid-cols-[12px_minmax(0,1fr)_auto] max-sm:gap-2.5 max-sm:p-3",
        kb && "bg-muted shadow-[inset_0_0_0_1px_var(--line)]",
      )}
      {...props}
    >
      <StatusBadge dot category={t.attention.category} />
      <span className="min-w-0">
        <strong className="block break-words font-normal">{taskTitle(t)}</strong>
        <small className="mt-0.5 block break-words text-xs text-muted-foreground">
          {t.projectName || (t.dir ? dirName(t.dir) : "Project needed")}
          {t.currentResultId ? " · Result available" : ""}
        </small>
      </span>
      <span className="min-w-0 text-sm max-sm:hidden">
        <StatusBadge category={t.attention.category}>{taskStatus(t)}</StatusBadge>
      </span>
      <span className="min-w-16 whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
        {t.updatedAt ? age(Number(new Date(t.updatedAt)), Date.now()) + " ago" : ""}
      </span>
    </button>
  );
}
