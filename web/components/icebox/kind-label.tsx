import { KIND } from "../../lib/icebox/index.ts";
import { cn } from "../../lib/core/index.ts";

export const KIND_TONE: Record<string, string> = {
  client: "text-kind-client",
  finding: "text-kind-finding",
  people: "text-kind-people",
};
// What a request is, in small capitals and its colour: Client, Finding, People say, or Unsorted.
export function KindLabel({ kind, className }: { kind?: string; className?: string }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap text-[11px] font-semibold uppercase tracking-[.06em]",
        (kind && KIND_TONE[kind]) || "text-muted-foreground",
        className,
      )}
    >
      {(kind && KIND[kind]) || "Unsorted"}
    </span>
  );
}
