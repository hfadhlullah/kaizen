import { cn } from "../../lib/core/index.ts";

// The few small line icons the Source control tab uses that the board's sprite does not have (Orca's panel has them).
const PATHS = {
  undo: ["M9 14 4 9l5-5", "M4 9h11a5 5 0 0 1 0 10h-4"],
  minus: ["M5 12h14"],
  chev: ["m9 6 6 6-6 6"],
  file: ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z", "M14 3v5h5"],
};
export function GitIcon({ name, className }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn(
        "size-(--ico-s) shrink-0 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]",
        className,
      )}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
