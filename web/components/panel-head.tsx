import { usePanel } from "../lib/panel-store.ts";
import { cn } from "../lib/utils.ts";
import { PhaseSteps } from "./phase-steps.tsx";
import { RunProgress } from "./run-progress.tsx";
import { StatusMark } from "./status-mark.tsx";

const pill =
  "inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-1.5 pr-[9px] text-sm font-medium text-foreground";
// What sits under the panel's title: a task's chips, a finished run's chips (state, what it waited on, the run that filed
// it), the stage strip, or in the run workspace the project name with the stage word and progress bar.
export function PanelHead() {
  const head = usePanel((s) => s.head);
  if (!head) return null;
  if (head.kind === "steps") return <PhaseSteps phases={head.phases} />;
  if (head.kind === "task")
    return (
      <>
        <span className={pill}>
          <StatusMark name="idea" />
          Task
        </span>{" "}
        <span className={cn(pill, "pl-[9px] font-normal text-muted-foreground")}>{head.where}</span>
      </>
    );
  if (head.kind === "chips")
    return (
      <>
        <span className={pill}>
          <StatusMark name={head.mark} />
          {head.label}
        </span>
        {head.awaiting && (
          <span className={cn(pill, "ml-1.5 pl-[9px] font-normal text-muted-foreground")}>{head.awaiting}</span>
        )}
        {head.parent && (
          <span
            title="Filed by this run"
            className={cn(
              pill,
              "ml-1.5 bg-primary/10 pl-[9px] text-primary shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_40%,transparent)]",
            )}
          >
            {head.parent}
          </span>
        )}
      </>
    );
  return (
    <>
      <div title={head.runner} className="max-w-[120px] truncate whitespace-nowrap text-xs text-muted-foreground">
        {head.proj}
      </div>
      <RunProgress key={head.id} word={head.word} w={head.w} status={head.status} tip={head.tip} />
    </>
  );
}
