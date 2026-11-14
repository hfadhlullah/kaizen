// The run panel's document tabs (Request, Explore, Plan, Backlog, Work, Review, Preview), with no DOM: what an empty tab
// says, a building run's progress list read from its progress.md, and the line a link to a finding or backlog item points at.
export const NONE: Record<string, string> = {
  request: "request",
  explore: "exploration brief",
  plan: "plan",
  impl: "work report",
  preview: "preview",
  review: "review",
  backlog: "backlog",
};
export type Step = { st: "todo" | "doing" | "done"; text: string };
// progress.md: one `- todo|doing|done: text` line per Work-list item.
export function parseProgress(src: string): { steps: Step[]; done: number; pct: number } | null {
  const steps = [...src.matchAll(/^\s*-\s*(todo|doing|done):\s*(.*)$/gm)].map((m) => ({
    st: m[1] as Step["st"],
    text: m[2]!,
  }));
  if (!steps.length) return null;
  const done = steps.filter((s) => s.st === "done").length;
  return { steps, done, pct: Math.round((done / steps.length) * 100) };
}
// The statuses and bar width last drawn for a run: the next draw marks what moved and slides the bar from there.
export type Drawn = { id: string; st: string[]; w: number };
export const moved = (prev: Drawn | null, steps: Step[], i: number) =>
  !!prev && !!prev.st[i] && prev.st[i] !== steps[i]!.st;
// What markdown leaves of a line as text: no backticks or stars, a link reduced to its words.
export const flat = (t: unknown) =>
  String(t)
    .replace(/!?\[([^\]]*)\]\([^)\s]+\)/g, "$1")
    .replace(/[`*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
// The text of the finding or backlog item a link names (its first 60 characters, as flat text), or null when the run has no such item.
export function hitNeedle(
  doc: { backlog?: string; findings?: { n: number; text: string }[] },
  hit: { type: string; n: number },
): string | null {
  const items = [...(doc.backlog || "").matchAll(/^\s*-\s*(?:open|done|rejected):\s*(.*)$/gm)];
  const text = hit.type === "finding" ? (doc.findings || []).find((f) => f.n === hit.n)?.text : items[hit.n - 1]?.[1];
  return text ? flat(text).slice(0, 60) : null;
}
