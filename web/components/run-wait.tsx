import { run } from "../lib/run/index.ts";
import { Button } from "../ui/button.tsx";
import { Icon } from "../ui/icon.tsx";
import { EmptyState } from "./empty-state.tsx";

// The tab of a run whose own agent session is open in another terminal: one conversation cannot run in two places.
export function RunWait({ id }: { id: string }) {
  return (
    <EmptyState
      title="This run's agent is running in another terminal"
      help="One conversation cannot run in two places. Close it there, then open it here."
    >
      <Button onClick={() => run.act.openHere(id.slice(5))}>
        <Icon name="refresh" className="size-(--ico)" />
        Open here
      </Button>
    </EmptyState>
  );
}
