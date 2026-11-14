import { useState } from "react";
import { markSent, setPanel, usePanel, fixFindings } from "../../lib/run/index.ts";
import { Button } from "../../ui/button.tsx";
import { Checkbox } from "../../ui/checkbox.tsx";
import { cn } from "../../lib/core/index.ts";
import { InlineMd } from "./inline-md.tsx";

// Fix picked findings, under the review: open ones ticked, closed and sent ones ticked but locked. Opens the agent on
// the ticked ones and rechecks them. Sent findings stay locked, so a second press cannot open a second agent on them.
export function FixForm() {
  const fix = usePanel((s) => s.fix),
    off = usePanel((s) => s.off),
    sent = usePanel((s) => s.sent),
    [busy, setBusy] = useState(false);
  if (!fix) return null;
  const { card: c, findings } = fix,
    k = (n: number) => c.id + ":" + n,
    isSent = (n: number) => sent.includes(k(n)),
    open = findings.filter((f) => !f.done && !isSent(f.n)),
    picks = open.filter((f) => !off.includes(k(f.n))).map((f) => f.n),
    all = picks.length === open.length;
  const tick = (n: number, on: boolean) => setPanel({ off: on ? off.filter((x) => x !== k(n)) : [...off, k(n)] });
  return (
    <div className="mt-4 flex flex-col gap-2 rounded-sm border border-primary bg-card p-3 shadow-md">
      <div className="text-base font-medium">Fix findings</div>
      <div className="text-sm text-muted-foreground">
        Opens your agent in this project, told to fix the ticked findings and recheck them.
      </div>
      {c.status === "waiting" && (
        <div className="text-sm text-muted-foreground">
          An agent is already open on this run; the fix is sent to it when it runs in its card, else another one opens.
        </div>
      )}
      {findings.map((f) => {
        const locked = f.done || isSent(f.n),
          suffix = f.done ? " (closed)" : isSent(f.n) ? " (sent)" : "";
        return (
          <label
            key={f.n}
            className={cn(
              "flex items-baseline gap-2 text-base",
              locked ? "cursor-default text-muted-foreground" : "cursor-pointer",
            )}
          >
            <Checkbox
              checked={locked || !off.includes(k(f.n))}
              disabled={locked}
              onCheckedChange={(v) => tick(f.n, v === true)}
              aria-label={`Finding ${f.n}`}
              data-n={f.n}
              className="translate-y-[3px]"
            />
            <span>
              {f.n}. <InlineMd text={f.text} />
              {suffix}
            </span>
          </label>
        );
      })}
      {open.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button
            variant="ghost"
            data-a="all"
            onClick={() =>
              setPanel({
                off: all ? [...off, ...open.map((f) => k(f.n))] : off.filter((x) => !open.some((f) => k(f.n) === x)),
              })
            }
          >
            {all ? "Select none" : "Select all"}
          </Button>
          <Button
            variant="primary"
            disabled={!picks.length || busy}
            onClick={async () => {
              setBusy(true);
              const ok = await fixFindings(c, picks);
              setBusy(false);
              if (ok) markSent(picks.map(k));
            }}
          >
            {all ? "Fix all " + picks.length : "Fix " + picks.length + " selected"}
          </Button>
        </div>
      )}
    </div>
  );
}
