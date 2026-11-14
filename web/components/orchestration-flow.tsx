import { useSettings } from "../lib/settings-store.ts";

// The plan reaches the conductor, which hands out tasks; workers bring work back; it goes on to review. Joined by beams of
// light. currentColor and var(--accent), so it follows light and dark. CSS only; with reduced motion the lines stay lit.
const CSS = `.orch-flow svg{display:block;overflow:visible;width:100%!important;height:auto!important;max-width:none!important;fill:none}.orch-l{fill:none;stroke:currentColor;stroke-width:2;opacity:.16}.orch-b{fill:none;stroke:var(--accent);stroke-width:3;stroke-linecap:round;filter:drop-shadow(0 0 5px var(--accent))}.orch-flow rect{fill:var(--bg);stroke:currentColor;stroke-width:1.5}.orch-i path,.orch-i circle{fill:none;stroke:var(--accent);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.orch-flow text{fill:currentColor;stroke:none;font:600 15px var(--mono,ui-monospace,monospace)}@keyframes orch-beam{from{stroke-dashoffset:125}to{stroke-dashoffset:-25}}@media (prefers-reduced-motion:no-preference){.orch-b{stroke-dasharray:25 100;stroke-dashoffset:125;animation:orch-beam 4s linear infinite}}`;
const LINES: [string, number][] = [
  ["M150 125H200", 0],
  ["M265 96V50Q265 32 283 32H500", 0.5],
  ["M265 154V200Q265 218 283 218H500", 0.5],
  ["M500 60H335Q317 60 317 78V96", 1.7],
  ["M500 190H335Q317 190 317 172V154", 1.7],
  ["M382 125H740", 2.8],
];
const BOXES: { x: number; y: number; w: number; name: string; icon: "doc" | "hub" | "term" | "ok" }[] = [
  { x: 20, y: 96, w: 130, name: "plan", icon: "doc" },
  { x: 200, y: 96, w: 182, name: "conductor", icon: "hub" },
  { x: 500, y: 18, w: 160, name: "worker 1", icon: "term" },
  { x: 500, y: 174, w: 160, name: "worker 2", icon: "term" },
  { x: 740, y: 96, w: 150, name: "review", icon: "ok" },
];
const ICONS = {
  doc: <path d="M1 1h7l4 4v9H1zM8 1v4h4" />,
  hub: (
    <>
      <circle cx="6.5" cy="6.5" r="2.5" />
      <path d="M6.5 0v3M6.5 10v3M0 6.5h3M10 6.5h3" />
    </>
  ),
  term: <path d="M1 2l4 3-4 3M7 10h5" />,
  ok: (
    <>
      <circle cx="6.5" cy="6.5" r="6" />
      <path d="M4 6.5l2 2 3.5-4" />
    </>
  ),
};

// Settings → Orchestration: a picture of the flow, and warnings where they apply, above the rows. The rows themselves are
// the generic ones.
export function OrchestrationFlow() {
  const windows = useSettings((s) => !!s.data?.cfg?.windows),
    bypass = useSettings(
      (s) => !!s.data?.cfg?.rows.some((r) => r.key === "orchestration.permissions" && r.value === "bypass"),
    );
  const note = (t: string) => <p className="px-3.5 py-2.5 text-xs leading-normal text-muted-foreground">{t}</p>;
  return (
    <>
      <div className="orch-flow mb-6 block w-full py-2">
        <svg
          viewBox="0 0 910 250"
          width="100%"
          role="img"
          aria-label="A conductor takes the approved plan and hands tasks to workers. Each worker brings its work back to the conductor, which merges it and sends it to review."
        >
          <style>{CSS}</style>
          {LINES.map(([d]) => (
            <path key={d} className="orch-l" d={d} />
          ))}
          {LINES.map(([d, delay]) => (
            <path key={d} className="orch-b" pathLength={100} style={{ animationDelay: `${delay}s` }} d={d} />
          ))}
          {BOXES.map((b) => (
            <g key={b.name} transform={`translate(${b.x} ${b.y})`}>
              <rect width={b.w} height={58} rx={12} />
              <g transform="translate(18 21) scale(1.15)" className="orch-i">
                {ICONS[b.icon]}
              </g>
              <text x={44} y={35}>
                {b.name}
              </text>
            </g>
          ))}
        </svg>
      </div>
      {(windows || bypass) && (
        <div className="mb-6 divide-y divide-border rounded-lg border border-border bg-card">
          {windows &&
            note(
              "Not available on Windows: workers run in real terminals on Linux and macOS. Orchestration reads as off here.",
            )}
          {bypass &&
            note("Warning: bypass skips every prompt in every worker. Each worker tab and the run's card say so.")}
        </div>
      )}
    </>
  );
}
