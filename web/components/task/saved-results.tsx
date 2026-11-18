import type { TaskResult } from "@lib/task";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@web/ui";

// Which saved version of the result is shown; nothing to pick while there is one.
export function SavedResults({
  results,
  selectedId,
  currentId,
  onPick,
}: {
  results: TaskResult[];
  selectedId: string;
  currentId?: string | null;
  onPick: (id: string) => void;
}) {
  if (results.length < 2) return null;
  return (
    <div className="mb-3.5">
      <Select value={selectedId} onValueChange={onPick}>
        <SelectTrigger
          aria-label="Saved results"
          size="sm"
          title="Files are retained without automatic expiry. Live links remain mutable."
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[...results].reverse().map((r, i) => (
            <SelectItem key={r.id} value={r.id}>
              {r.title || "Version " + (results.length - i)}
              {r.id === currentId ? " · current" : " · earlier saved output"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
