import type { ReactNode } from "react";

// A line of kaizen's own markdown as React nodes, never as HTML: `code`, **bold**, *italic* and [text](link), the
// link reduced to its words. Anything else is plain text.
export function InlineMd({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|\[([^\]]*)\]\([^)\s]+\)/g;
  let at = 0,
    m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > at) out.push(text.slice(at, m.index));
    const k = out.length;
    out.push(
      m[1] != null ? (
        <code key={k} className="rounded-xs bg-muted px-1 font-mono text-[0.92em]">
          {m[1]}
        </code>
      ) : m[2] != null ? (
        <strong key={k}>{m[2]}</strong>
      ) : m[3] != null ? (
        <em key={k}>{m[3]}</em>
      ) : (
        m[4]
      ),
    );
    at = re.lastIndex;
  }
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}
