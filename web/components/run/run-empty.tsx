import { useRunView } from "../../lib/run/index.ts";
import { EmptyState } from "../shared/index.ts";

// No tab is open: say how to open one.
export function RunEmpty() {
  const empty = useRunView((s) => s.empty);
  return empty ? (
    <EmptyState title="No tabs open" help="Open an agent, a shell, the project's localhost or the Preview with +." />
  ) : null;
}
