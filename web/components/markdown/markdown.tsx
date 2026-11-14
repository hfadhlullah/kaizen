import type { ReactNode } from "react";
import { inline, parse, type Block, type Inline } from "../../lib/markdown/index.ts";
import { cn } from "../../lib/core/index.ts";

function Inl({ c }: { c: Inline[] }): ReactNode {
  return c.map((x, n) => {
    if (typeof x === "string") return x;
    if (x.k === "code")
      return (
        <code key={n} className="rounded-xs bg-background px-[5px] py-px font-mono text-xs">
          {x.t}
        </code>
      );
    if (x.k === "b")
      return (
        <b key={n}>
          <Inl c={x.c} />
        </b>
      );
    if (x.k === "i")
      return (
        <i key={n}>
          <Inl c={x.c} />
        </i>
      );
    if (x.k === "img")
      return (
        <a key={n} href={x.src} target="_blank" rel="noopener noreferrer">
          <img src={x.src} alt={x.alt} className="inline max-w-full" />
        </a>
      );
    return (
      <a
        key={n}
        href={x.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline-offset-[3px]"
      >
        <Inl c={x.c} />
      </a>
    );
  });
}
const HEAD = [
  "my-5 text-lg font-semibold first:mt-0 mb-2",
  "my-5 text-lg font-semibold first:mt-0 mb-2",
  "mb-2 mt-5 text-xs uppercase tracking-[0.08em] text-muted-foreground first:mt-0",
];
function Blk({ b }: { b: Block }) {
  switch (b.k) {
    case "pre":
      return (
        <pre className="mb-2.5 overflow-x-auto rounded-sm border border-border bg-background px-3 py-2.5 font-mono text-xs leading-normal">
          {b.t}
        </pre>
      );
    case "h": {
      const H = `h${b.level}` as "h1";
      return (
        <H className={HEAD[b.level - 1]}>
          <Inl c={b.c} />
        </H>
      );
    }
    case "hr":
      return <hr className="my-3.5 border-0 border-t border-border" />;
    case "table":
      return (
        <table className="mb-2.5 border-collapse text-sm">
          <tbody>
            <tr>
              {b.head.map((c, n) => (
                <th key={n} className="border border-border px-2 py-1 text-left font-semibold">
                  <Inl c={c} />
                </th>
              ))}
            </tr>
            {b.rows.map((r, n) => (
              <tr key={n}>
                {r.map((c, k) => (
                  <td key={k} className="border border-border px-2 py-1 text-left">
                    <Inl c={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "list": {
      const L = b.ordered ? "ol" : "ul";
      return (
        <L className={cn("mb-2.5 pl-[1.4em]", b.ordered ? "list-decimal" : "list-disc")}>
          {b.items.map((c, n) => (
            <li key={n} className="my-[3px]">
              <Inl c={c} />
            </li>
          ))}
        </L>
      );
    }
    case "p":
      return (
        <p className="mb-2.5">
          {b.lines.map((c, n) => (
            <span key={n}>
              {n > 0 && <br />}
              <Inl c={c} />
            </span>
          ))}
        </p>
      );
  }
}
// kaizen's markdown as React nodes: an agent's reply, a note. Never HTML; links open in a tab of their own.
export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {parse(text).map((b, n) => (
        <Blk key={n} b={b} />
      ))}
    </div>
  );
}
