import { useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "@components/markdown";
import { cn } from "@lib/core";
import { flat, moved, NONE, parseProgress, usePanel, type Drawn, type Step } from "@lib/run";
import { FixForm } from "./fix-form.tsx";

// The statuses and bar width last drawn for a run: the next draw marks what moved and slides the bar from there.
let drawn: Drawn | null = null;
const HIT = [
  "outline-2",
  "outline-offset-[3px]",
  "outline-(--accent)",
  "rounded-sm",
  "transition-[outline-color]",
  "duration-[600ms]",
];

const code = (t: string) =>
  t.split(/`([^`]+)`/).map((x, i) =>
    i % 2 ? (
      <code key={i} className="rounded-xs bg-background px-[5px] py-px font-mono text-xs">
        {x}
      </code>
    ) : (
      x
    ),
  );
const MARK: Record<Step["st"], string> = { done: "text-success", doing: "text-running", todo: "text-muted-foreground" };

// A building run's Work list: how many are done, a bar, and one row per item (✓ done, a pulse for the one being worked
// on). A redraw marks the rows whose status moved and slides the bar from where it was.
function Progress({ id, src }: { id: string; src: string }) {
  const p = useMemo(() => parseProgress(src), [src]),
    prev = drawn?.id === id ? drawn : null,
    [shown, setShown] = useState(prev ? prev.w : (p?.pct ?? 0));
  useEffect(() => {
    if (!p) return;
    setShown(p.pct);
    drawn = { id, st: p.steps.map((s) => s.st), w: p.pct };
  }, [p, id]);
  if (!p) return null;
  return (
    <div data-prog className="mb-[18px]">
      <div className="mb-1.5 flex justify-between text-base text-muted-foreground">
        <b className="font-medium text-foreground">
          {p.done} of {p.steps.length} done
        </b>
        <span>{p.pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-[3px] bg-border">
        <i
          className="block h-full rounded-[3px] bg-primary transition-[width] duration-[260ms] ease-[cubic-bezier(.22,.61,.36,1)] motion-reduce:transition-none"
          style={{ width: shown + "%" }}
        />
      </div>
      <ol className="mt-3 flex flex-col gap-0.5">
        {p.steps.map((s, i) => (
          <li
            key={i}
            className={cn(
              "flex items-baseline gap-2.5 rounded-sm px-2 py-1.5",
              s.st === "todo" && "text-muted-foreground",
              moved(prev, p.steps, i) && "motion-safe:animate-[kz-fade_.26s]",
            )}
          >
            <span
              className={cn(
                "relative top-[3px] inline-grid size-4 flex-none place-items-center text-[11px]",
                MARK[s.st],
              )}
            >
              {s.st === "done" ? (
                "✓"
              ) : s.st === "doing" ? (
                <span className="size-[7px] rounded-full bg-current motion-safe:animate-pulse" />
              ) : (
                ""
              )}
            </span>
            <span>{code(s.text)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// The panel's document tabs: the run's request, plan, report, review ... as markdown, a backlog with its checkboxes and
// the Work list above it, and under a review the Fix findings form. A link to a finding or backlog item scrolls to its
// line and outlines it for a moment.
export function DocBody() {
  const doc = usePanel((s) => s.doc),
    fix = usePanel((s) => s.fix),
    root = useRef<HTMLDivElement>(null),
    mark = doc?.mark;
  useEffect(() => {
    if (!mark || !doc?.needle || !root.current) return;
    const needle = doc.needle;
    const el = [...root.current.querySelectorAll("li,p")].find(
      (e) => !e.closest("[data-prog]") && flat(e.textContent).includes(needle),
    );
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.classList.add(...HIT);
    // Not cleared with the effect: a refresh redraws the tab and must not leave the line outlined.
    setTimeout(() => el.classList.remove(...HIT), 2400);
  }, [mark]);
  if (!doc) return null;
  const backlog = doc.k === "backlog";
  return (
    <div ref={root}>
      {backlog && doc.progress && <Progress id={doc.id} src={doc.progress} />}
      {doc.text ? (
        <Markdown text={backlog && doc.progress ? "### Backlog\n\n" + doc.text : doc.text} ticks={backlog} />
      ) : (
        !(backlog && doc.progress) && <p className="text-muted-foreground">No {NONE[doc.k]} yet.</p>
      )}
      {doc.k === "review" && fix && <FixForm />}
    </div>
  );
}
