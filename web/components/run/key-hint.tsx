import { useRunView } from "@lib/run";

const KEYS = [
  ["←↓↑→", "pane"],
  ["1-9", "tab"],
  ["n p", "next, prev"],
  ["c", "new tab"],
  ["r", "split right, same as this pane"],
  ["d", "split down, same as this pane"],
  ["x", "close pane"],
  ["?", "all keys"],
];
// While Ctrl+Space waits for its key, a chip lists the keys.
export function KeyHint() {
  if (!useRunView((s) => s.hint)) return null;
  return (
    <div
      role="status"
      className="fixed bottom-11 left-1/2 z-[60] flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 flex-wrap justify-center gap-x-4 gap-y-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-sm text-foreground shadow-[0_8px_24px_rgba(0,0,0,.35)] animate-fade-in"
    >
      {KEYS.map(([k, t]) => (
        <span key={k} className="flex items-center gap-1.5 whitespace-nowrap">
          <kbd className="rounded-xs border border-border px-1.5 py-0.5 font-mono text-xs text-strong">{k}</kbd>
          {t}
        </span>
      ))}
    </div>
  );
}
