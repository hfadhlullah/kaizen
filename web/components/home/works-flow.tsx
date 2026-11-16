import type { ReactNode } from "react";
import { FLOW } from "@lib/home";

// The first welcome step's picture, drawn like Settings → Orchestration's: rounded boxes joined by beams of light. ask → plan →
// approve → build → review; the boxes where you decide are solid, where an agent works outlined. One 10 s timeline: the beam
// travels start to end and each box lights up for 1.4 s when it arrives, with a little work in it (plan draws its lines, ask and
// build blink a cursor, approve draws its check). Two rows on a narrow screen. currentColor and var(--accent), so it follows light
// and dark. CSS only; with reduced motion the lines stay lit and nothing moves.
const CSS = `.wk svg{overflow:visible;width:100%;height:auto;fill:none}
.wk .l{fill:none;stroke:currentColor;stroke-width:2;opacity:.16}
.wk .b{fill:none;stroke:var(--accent);stroke-width:3;stroke-linecap:round;filter:drop-shadow(0 0 4px var(--accent));opacity:0;stroke-dasharray:25 100;stroke-dashoffset:125}
.wk rect.bx{fill:var(--bg);stroke:currentColor;stroke-width:1.6}
.wk rect.you{fill:currentColor}
.wk .i path,.wk .i circle{fill:none;stroke:var(--accent);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.wk .y .i path,.wk .y .i circle{stroke:var(--bg)}
.wk text{fill:currentColor;stroke:none;font:600 21px var(--mono,ui-monospace,monospace)}
.wk .y text{fill:var(--bg)}
.wk .cur{fill:currentColor;stroke:none;opacity:0}
.wk .y .cur{fill:var(--bg)}
.wk .wb{fill:var(--accent);stroke:none;transform-box:fill-box;transform-origin:left;transform:scaleX(0)}
.wk .ck{stroke-dasharray:1;stroke-dashoffset:0}
@media (prefers-reduced-motion:no-preference){
.wk rect.ag{animation:wk-ag 10s linear infinite}
.wk rect.you{animation:wk-you 10s linear infinite}
.wk .b{animation:wk-beam 10s linear infinite}
.wk .cur{animation:wk-blink 10s linear infinite}
.wk .wb{animation:wk-grow 10s linear infinite}
.wk .ck{animation:wk-draw 10s linear infinite}}
@keyframes wk-ag{0%,14%{stroke-width:3.2;fill:color-mix(in srgb,currentColor 12%,var(--bg));filter:drop-shadow(0 0 6px var(--accent))}16%,100%{stroke-width:1.6;fill:var(--bg);filter:none}}
@keyframes wk-you{0%,14%{stroke-width:3.2;filter:drop-shadow(0 0 6px var(--accent))}16%,100%{stroke-width:1.6;filter:none}}
@keyframes wk-beam{0%{stroke-dashoffset:125;opacity:1}7%{stroke-dashoffset:-25;opacity:1}7.5%,100%{stroke-dashoffset:-25;opacity:0}}
@keyframes wk-blink{0%{opacity:1}3.5%{opacity:0}7%{opacity:1}10.5%{opacity:0}14%{opacity:1}15%,100%{opacity:0}}
@keyframes wk-grow{0%{transform:scaleX(0)}5%{transform:scaleX(1)}9%{transform:scaleX(.55)}13%{transform:scaleX(1)}15%,100%{transform:scaleX(0)}}
@keyframes wk-draw{0%{stroke-dashoffset:1}8%,100%{stroke-dashoffset:0}}`;

const ICONS: Record<string, ReactNode> = {
  ask: (
    <>
      <circle cx="6.5" cy="4" r="2.6" />
      <path d="M1.5 12.5c.8-3 3-4 5-4s4.2 1 5 4" />
    </>
  ),
  plan: <path d="M1 1h7l4 4v9H1zM8 1v4h4" />,
  approve: (
    <>
      <circle cx="6.5" cy="6.5" r="6" />
      <path className="ck" pathLength={1} d="M4 6.5l2 2 3.5-4" />
    </>
  ),
  build: <path d="M1 2l4 3-4 3M7 10h5" />,
  review: (
    <>
      <circle cx="5.5" cy="5.5" r="4" />
      <path d="M8.5 8.5L12.5 12.5" />
    </>
  ),
};
// Where each box sits and how the beams join them: one row of five, or two rows (3 and 2) with the line wrapping down.
const WIDE = {
  view: "0 0 960 120",
  boxes: [[0, 30], [202, 30], [404, 30], [606, 30], [808, 30]],
  lines: ["M152 60H202", "M354 60H404", "M556 60H606", "M758 60H808"],
};
const NARROW = {
  view: "0 0 560 230",
  boxes: [[0, 10], [204, 10], [408, 10], [0, 150], [204, 150]],
  lines: ["M152 40H204", "M356 40H408", "M484 70V100Q484 120 464 120H96Q76 120 76 140V150", "M152 180H204"],
};
const LABEL = "You ask, kaizen plans, you approve, an agent builds it, a second agent reviews it.";

function Flow({ g, className }: { g: typeof WIDE; className: string }) {
  return (
    <svg viewBox={g.view} role="img" aria-label={LABEL} className={className}>
      {g.lines.map((d) => (
        <path key={"l" + d} className="l" d={d} />
      ))}
      {g.lines.map((d, k) => (
        <path key={"b" + d} className="b" pathLength={100} style={{ animationDelay: `${k * 2 + 1.2}s` }} d={d} />
      ))}
      {FLOW.map((f, i) => (
        <g key={f.name} className={f.you ? "y" : ""} transform={`translate(${g.boxes[i]![0]} ${g.boxes[i]![1]})`}>
          <rect className={`bx ${f.you ? "you" : "ag"}`} style={{ animationDelay: `${i * 2}s` }} width={152} height={60} rx={12} />
          <g className="i" transform="translate(16 20) scale(1.15)">
            {ICONS[f.name]}
          </g>
          <text x={46} y={37}>
            {f.name}
          </text>
          {f.name === "ask" && <rect className="cur" style={{ animationDelay: "0s" }} x={86} y={19} width={2.5} height={22} rx={1} />}
          {f.name === "build" && <rect className="cur" style={{ animationDelay: "6s" }} x={114} y={19} width={2.5} height={22} rx={1} />}
          {f.name === "plan" &&
            [34, 26, 30].map((w, j) => (
              <rect key={j} className="wb" style={{ animationDelay: `${2 + j * 0.25}s` }} x={102} y={17 + j * 10} width={w} height={4} rx={2} />
            ))}
        </g>
      ))}
    </svg>
  );
}

export function WorksFlow() {
  return (
    <div className="wk my-1 block w-full py-1" data-testid="works-flow">
      <style>{CSS}</style>
      <Flow g={WIDE} className="block max-[560px]:hidden" />
      <Flow g={NARROW} className="hidden max-[560px]:block" />
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block size-3 rounded-[3px] border-[1.5px] border-foreground bg-foreground" />
          you
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block size-3 rounded-[3px] border-[1.5px] border-foreground" />
          agent
        </span>
      </div>
    </div>
  );
}
