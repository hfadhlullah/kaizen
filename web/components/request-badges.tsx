import { ago, type IceItem } from "../lib/icebox.ts";

// Small words about what became of a request: written back, promoted, replied.
export function RequestBadges({ item }: { item: IceItem }) {
  return (
    <>
      {item.status === "done" && item.written && <span title={`Written back ${ago(item.written)}`}>written back</span>}
      {item.status === "done" && item.writeError && <span title={item.writeError}>write-back failed</span>}
      {item.status === "promoted" && <span title={`Promoted to Tasks: ${item.idea || ""}`}>promoted</span>}
      {item.replied && <span title={`Replied ${ago(item.replied)}`}>replied</span>}
    </>
  );
}
