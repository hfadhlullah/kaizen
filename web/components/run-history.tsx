import { run, useRunView } from "../lib/run-view-store.ts";
import { StateDot } from "./state-dot.tsx";

// The History tab: the workspace's finished runs, newest first; one opens read-only in the run panel.
export function RunHistory() {
  const list = useRunView((s) => s.history);
  if (!list.length) return <p className="p-3 text-muted-foreground">No finished runs in this workspace yet.</p>;
  return (
    <div className="flex-1 overflow-auto px-4.5 py-3">
      {list.map((c) => (
        <button
          key={c.k}
          type="button"
          onClick={() => run.act.pick(c.k)}
          className="grid w-full grid-cols-[18px_1fr_auto] items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left hover:bg-muted"
        >
          <StateDot state={c.state} />
          <b className="truncate font-medium">{c.title}</b>
          <small className="text-[11.5px] text-muted-foreground">{c.line}</small>
        </button>
      ))}
    </div>
  );
}
