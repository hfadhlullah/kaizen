import type { ReactNode } from "react";
import { PlanText } from "@components/decision";
import type { RunDoc } from "@lib/task";

// A kaizen plan starts with a short Work list; show that, with the whole plan one press away.
const workList = (plan: string) => plan.match(/^## Work list\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1]?.trim();

// The Plan tab. While something waits on the person the page puts the decision first (`children`); after it the tab
// shows the plan that was approved, read-only, from the run.
export function PlanView({
  run,
  loaded,
  waiting,
  planning,
  children,
}: {
  run: RunDoc | null;
  loaded: boolean;
  waiting?: boolean; // something waits on the person (the decision is in `children`)
  planning?: boolean; // the agent is writing the plan
  children?: ReactNode;
}) {
  const list = run?.plan ? workList(run.plan) : undefined;
  return (
    <div className="flex flex-col gap-4">
      {children}
      {run?.plan ? (
        <section aria-label="Approved plan" className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 text-base font-semibold">{waiting ? "Plan so far" : "Approved plan"}</h3>
          <PlanText text={list ?? run.plan} />
          {list && (
            <details className="mt-3 text-muted-foreground">
              <summary className="cursor-pointer text-sm">Full plan</summary>
              <PlanText text={run.plan} className="mt-3 text-foreground" />
            </details>
          )}
        </section>
      ) : (
        !waiting &&
        loaded && (
          <p className="p-2 text-muted-foreground">
            {planning
              ? "The agent is planning. The plan appears here when it is ready."
              : "The plan appears here once the agent writes it."}
          </p>
        )
      )}
    </div>
  );
}
