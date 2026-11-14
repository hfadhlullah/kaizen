// The run's Preview tab as data: what to show (a frame, a screenshot, or the report with its screenshots) and the
// rules that pick it. The component (components/run/preview-pane.tsx) only draws the answer.
import { attach, preview, type Block, type Inline } from "@lib/markdown";

// The first localhost address in a run's ## Preview.
export const loopbackUrl = (pv?: string | null) =>
  pv ? /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?[^\s)`'"<>]*/.exec(pv)?.[0] : undefined;
// `kaizen preview` written from folder `pws` belongs to workspace `ws`: the same folder or one inside
// it, but never a worktree under it (`.kaizen/wt/`), which is a workspace of its own.
export const previewIn = (pws: string, ws: string) =>
  pws === ws || (pws.startsWith(ws + "/") && !pws.startsWith(ws + "/.kaizen/wt/"));
// A preview opens a tab only when written after the last one this visit recorded; the first look at
// a workspace (`last` undefined: a click, a switch, a reload) only records.
export const previewOpens = (at: number, last: number | undefined) => last !== undefined && at > last;

export type Shot = { src: string; alt: string };
// A screenshot's caption: its alt text, else the file's name (the board's /file?dir=..&p=path links hold it in `p`).
export const shotName = (s: Shot) => {
  const p = /[?&]p=([^&]*)/.exec(s.src)?.[1];
  return s.alt || decodeURIComponent((p ? decodeURIComponent(p) : s.src).split("/").pop() || "");
};

// The report's images as a grid after its text: every image leaves its block (a paragraph left with nothing in it goes).
export function splitShots(blocks: Block[]): { blocks: Block[]; shots: Shot[] } {
  const shots: Shot[] = [];
  const strip = (c: Inline[]): Inline[] =>
    c.flatMap((x): Inline[] => {
      if (typeof x === "string") return [x];
      if (x.k === "img") return (shots.push({ src: x.src, alt: x.alt }), []);
      if (x.k === "b" || x.k === "i" || x.k === "a") return [{ ...x, c: strip(x.c) }];
      return [x];
    });
  const blank = (c: Inline[]) => !c.length || c.every((x) => typeof x === "string" && !x.trim());
  const out: Block[] = [];
  for (const b of blocks) {
    if (b.k === "p") {
      const lines = b.lines.map(strip).filter((l) => !blank(l));
      if (lines.length) out.push({ ...b, lines });
    } else if (b.k === "h") out.push({ ...b, c: strip(b.c) });
    else if (b.k === "list") out.push({ ...b, items: b.items.map(strip) });
    else if (b.k === "table") out.push({ ...b, head: b.head.map(strip), rows: b.rows.map((r) => r.map(strip)) });
    else out.push(b);
  }
  return { blocks: out, shots };
}

export type PreviewData =
  | { kind: "frame"; src: string }
  | { kind: "image"; src: string; name: string }
  | { kind: "report"; url?: string; text: string | null };
// `kaizen preview <image|url>` wrote this for the workspace (GET /preview), else null.
export type Direct = { url?: string; image?: string; ws?: string; at?: number };

// Which Preview to show. The run's own `## Preview` wins; with none, what an agent last showed with `kaizen preview`.
// The address is framed only when the Preview has no images and the board runs on the same computer: the dev server
// a run used is often gone, and a dead frame hides the proof.
export function planPreview(o: {
  pv: string | null;
  direct: Direct | null;
  loopback: boolean;
  fileUrl: (image: string) => string;
}): PreviewData {
  const { pv, direct } = o;
  if (!pv && direct)
    return direct.image
      ? { kind: "image", src: o.fileUrl(direct.image), name: direct.image.split("/").pop() ?? "" }
      : { kind: "frame", src: direct.url! };
  const url = loopbackUrl(pv);
  const shots = !!pv && /!\[[^\]]*\]\(/.test(pv);
  if (url && o.loopback && !shots) return { kind: "frame", src: /^https?:\/\//i.test(url) ? url : "about:blank" };
  return { kind: "report", url, text: pv };
}

export type PreviewTarget = {
  dir: string;
  ws: string;
  card: { id: string; kind: string; state: string } | null;
  impl: string | null; // the run's 03-impl.md when the board already holds it
};
// A phone over the tailnet is not the board's computer: framing or opening localhost there shows nothing useful.
export const onLoopback = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
export const fileUrl = (dir: string, image: string) =>
  `${location.origin}/file?dir=${encodeURIComponent(dir)}&p=${encodeURIComponent(image)}`;
// The latest preview written for this workspace, or null.
export async function fetchPreview(dir: string, ws: string): Promise<Direct | null> {
  let p: Direct = {};
  try {
    p = await (await fetch("/preview?dir=" + encodeURIComponent(dir))).json();
  } catch {}
  return p.at && p.ws && previewIn(p.ws, ws) && (p.url || p.image) ? p : null;
}
export async function loadPreview(t: PreviewTarget): Promise<PreviewData> {
  let impl = t.impl;
  if (impl == null && t.card?.kind === "run")
    try {
      impl = (
        await (await fetch(`/run/${encodeURIComponent(t.card.id)}?dir=${encodeURIComponent(t.card.state)}`)).json()
      ).impl;
    } catch {}
  const pv = preview(impl);
  const direct = pv ? null : await fetchPreview(t.dir, t.ws);
  const text = pv && t.card ? attach(pv, t.card) : pv;
  const data = planPreview({ pv, direct, loopback: onLoopback(), fileUrl: (i) => fileUrl(t.dir, i) });
  return data.kind === "report" ? { ...data, text: data.text == null ? null : text } : data;
}
