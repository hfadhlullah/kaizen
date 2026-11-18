// The task's latest run, read from the board's own run route: the approved plan, its review findings and the files it
// changed. The Plan (once approved), Changes and Review tabs draw from it; nothing here writes.
import { useEffect, useState } from "react";
import { runIdsOf, type TaskView } from "./tasks.ts";

export type RunFinding = { n: number; text: string; done?: boolean };
export type RunFile = { path: string; add: number; del: number; code: string };
export type RunDoc = {
  id: string;
  plan: string | null;
  review: string | null;
  findings: RunFinding[];
  files: RunFile[];
};

export function useTaskRun(t: TaskView): { run: RunDoc | null; loaded: boolean } {
  const id = runIdsOf(t).at(-1) ?? "",
    key = [id, t.revision, t.status, t.runStage].join("|");
  const [state, setState] = useState<{ id: string; run: RunDoc | null; loaded: boolean }>({
    id: "",
    run: null,
    loaded: false,
  });
  useEffect(() => {
    if (!id || !t.dir) return void setState({ id: "", run: null, loaded: true });
    const ac = new AbortController();
    fetch(`/run/${encodeURIComponent(id)}?dir=${encodeURIComponent(t.dir)}`, { signal: ac.signal })
      .then((r) => r.json())
      .then(
        (d) =>
          setState({
            id,
            loaded: true,
            run:
              d && d.id === id
                ? {
                    id,
                    plan: d.plan ?? null,
                    review: d.review ?? null,
                    findings: d.findings ?? [],
                    files: d.git?.rows ?? [],
                  }
                : null,
          }),
        () => ac.signal.aborted || setState((s) => ({ ...s, loaded: true })),
      );
    return () => ac.abort();
  }, [key]);
  return { run: state.id === id ? state.run : null, loaded: state.loaded };
}
