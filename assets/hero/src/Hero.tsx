// The README hero: the real board recorded by capture.ts, cut into chapters, sped
// up where it only waits, with a pointer, a caption per step, and a title and end
// card. Edit SCENES to re-cut; capture times are ms from frames.json's marks.
import { AbsoluteFill, Img, interpolate, Easing, staticFile, useCurrentFrame, Sequence } from "remotion";
import data from "../public/frames.json";

export const FPS = 30;
const { frames, marks, pointer } = data as {
  frames: { f: string; t: number }[];
  marks: Record<string, number>;
  pointer: { t: number; x: number; y: number }[];
};
const m = (k: string) => marks[k]!;

type Scene = { from: number; to: number; speed: number; step: string; caption: string; zoom?: [number, number, number] };
// zoom: [scale, x, y] in capture pixels, reached a second into the scene. The point
// (x, y) stays put while the rest grows around it: anchor on the panel's right edge.
const SCENES: Scene[] = [
  { from: m("icebox") - 300, to: m("promote") + 900, speed: 1.2, step: "1", caption: "Requests land in the Icebox, gathered from your sheets, docs and posts" },
  { from: m("board") - 200, to: m("run") + 300, speed: 1.3, step: "2", caption: "Promoted, it is an idea on the board. Run it with your agent" },
  { from: m("run") + 300, to: m("plan") - 400, speed: 1.4, step: "3", caption: "Your agent works in the card's own terminal, and writes a plan", zoom: [1.2, 1440, 160] },
  { from: m("plan") - 200, to: m("approve") + 700, speed: 1, step: "4", caption: "Read what done and wrong mean. Approve, or revise", zoom: [1.2, 1440, 250] },
  { from: m("approve") + 700, to: m("findings") - 400, speed: 2.2, step: "5", caption: "It builds. Then a reviewer that never saw the work checks it", zoom: [1.2, 1440, 160] },
  { from: m("findings") - 200, to: m("fix") + 600, speed: 1, step: "6", caption: "Pick which findings to fix", zoom: [1.25, 1440, 520] },
  { from: m("fix") + 600, to: m("done") - 300, speed: 1.8, step: "7", caption: "The fix is re-checked by the reviewer" },
  { from: m("done") - 300, to: m("done") + 2800, speed: 1, step: "8", caption: "Done. Whatever was left goes to the backlog" },
];
const INTRO = 2.4 * FPS, OUTRO = 3.2 * FPS, FADE = 8;
const lens = SCENES.map((s) => Math.round(((s.to - s.from) / s.speed / 1000) * FPS));
const starts = lens.map((_, i) => INTRO + lens.slice(0, i).reduce((a, b) => a + b, 0));
export const total = INTRO + lens.reduce((a, b) => a + b, 0) + OUTRO;

const INK = "#eef2fa", DIM = "#96aacd", ACC = "#5b7cf0", BG = "#0b1530";
const font = "Inter, 'Helvetica Neue', Arial, sans-serif";

function frameAt(t: number) {
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid]!.t <= t) lo = mid; else hi = mid - 1; }
  return frames[lo]!.f;
}

// Where the pointer is at capture time t: it glides to each target in the 600 ms
// before capture.ts clicked it (700 ms after the target was recorded).
function pointerAt(t: number) {
  let prev = { x: 720, y: 600 }, press = -1;
  for (const p of pointer) {
    const click = p.t + 700;
    if (t < p.t + 100) break;
    const k = interpolate(t, [p.t + 100, click], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
    prev = { x: prev.x + (p.x - prev.x) * k, y: prev.y + (p.y - prev.y) * k };
    if (k === 1) prev = { x: p.x, y: p.y };
    if (t >= click && t < click + 450) press = (t - click) / 450;
  }
  return { ...prev, press };
}

function Clip({ s, len }: { s: Scene; len: number }) {
  const f = useCurrentFrame();
  const t = s.from + (f / FPS) * 1000 * s.speed;
  const [z, zx, zy] = s.zoom ?? [1, 720, 405];
  // Zoom in quickly, then hold still: a slow push changes every pixel of every frame,
  // which a GIF cannot compress.
  const k = interpolate(f, [10, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const scale = 1 + (z - 1) * k;
  const ox = (zx - 720) * (scale - 1), oy = (zy - 405) * (scale - 1);
  const p = pointerAt(t);
  const fade = interpolate(f, [0, FADE, len - FADE, len], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cap = interpolate(f, [4, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <AbsoluteFill style={{ transform: `translate(${-ox}px, ${-oy}px) scale(${scale})`, transformOrigin: "50% 50%" }}>
        <Img src={staticFile("frames/" + frameAt(t))} style={{ width: 1440, height: 810 }} />
        {p.press >= 0 && (
          <div style={{ position: "absolute", left: p.x - 22, top: p.y - 22, width: 44, height: 44, borderRadius: 22,
            border: `3px solid ${ACC}`, opacity: 1 - p.press, transform: `scale(${0.4 + p.press})` }} />
        )}
        <svg width="26" height="26" viewBox="0 0 24 24" style={{ position: "absolute", left: p.x - 4, top: p.y - 3, filter: "drop-shadow(0 2px 3px rgba(0,0,0,.5))" }}>
          <path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.4-6.8L4 19z" fill="#fff" stroke="#111" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 34, display: "flex", justifyContent: "center", opacity: cap, transform: `translateY(${(1 - cap) * 12}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 28px", borderRadius: 16, background: "rgba(8,14,34,.88)",
          border: "1px solid rgba(120,150,230,.35)", boxShadow: "0 12px 40px rgba(0,0,0,.45)", fontFamily: font }}>
          <span style={{ width: 38, height: 38, borderRadius: 19, background: ACC, color: "#fff", fontWeight: 700, fontSize: 21,
            display: "flex", alignItems: "center", justifyContent: "center" }}>{s.step}</span>
          <span style={{ color: INK, fontSize: 28, fontWeight: 500 }}>{s.caption}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Card({ title, sub, foot, len }: { title: string; sub: string; foot?: string; len: number }) {
  const f = useCurrentFrame();
  const a = interpolate(f, [0, 12, len - 10, len], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const y = interpolate(f, [0, 18], [18, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 40%, #16245a, ${BG} 70%)`, alignItems: "center", justifyContent: "center", fontFamily: font }}>
      <div style={{ opacity: a, transform: `translateY(${y}px)`, textAlign: "center" }}>
        <Img src={staticFile("banner.png")} style={{ width: 620 }} />
        <div style={{ color: INK, fontSize: 46, fontWeight: 600, marginTop: 18 }}>{title}</div>
        <div style={{ color: DIM, fontSize: 30, marginTop: 14 }}>{sub}</div>
        {foot && <div style={{ display: "inline-block", marginTop: 34, padding: "12px 24px", borderRadius: 12, background: "#050a1c",
          color: "#8fe3a8", fontFamily: "'JetBrains Mono', 'Noto Sans Mono', monospace", fontSize: 28, border: "1px solid #24305a" }}>{foot}</div>}
      </div>
    </AbsoluteFill>
  );
}

export const Hero = () => (
  <AbsoluteFill style={{ background: BG }}>
    <Sequence durationInFrames={INTRO}>
      <Card len={INTRO} title="From a request to reviewed code, on one board" sub="Plan first. Approve it. A cold reviewer checks the work." />
    </Sequence>
    {SCENES.map((s, i) => (
      <Sequence key={i} from={starts[i]} durationInFrames={lens[i]}>
        <Clip s={s} len={lens[i]!} />
      </Sequence>
    ))}
    <Sequence from={total - OUTRO} durationInFrames={OUTRO}>
      <Card len={OUTRO} title="Every step on file. Nothing ships without you." sub="Works with Claude Code, Codex, Antigravity and OpenCode" foot="bunx kaizen-agent" />
    </Sequence>
  </AbsoluteFill>
);
