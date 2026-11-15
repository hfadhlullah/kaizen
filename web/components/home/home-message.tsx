import { runsIn, type Msg } from "@lib/home";
import { host, cn } from "@lib/core";
import { Button, Icon } from "@web/ui";
import { Markdown } from "@components/markdown";

const stepIcon = (k?: string) => (k === "edit" ? "note" : k === "project" ? "board" : "term");

// The agent is working on this reply: a small laptop floating, what it is doing, three dots.
function Activity({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="flex min-h-[54px] items-center gap-2.5 text-sm text-muted-foreground [overflow-wrap:anywhere]"
    >
      <span aria-hidden="true" className="relative block size-[52px] flex-none">
        <i className="absolute left-3.5 top-5 block h-[13px] w-6 rounded-[3px] border-[1.5px] border-primary bg-primary/70 animate-hfloat after:absolute after:-bottom-1 after:-left-1 after:-right-1 after:h-0.5 after:rounded-b-[5px] after:bg-primary" />
      </span>
      <span className="flex min-w-0 flex-col gap-1.5">
        <span>{text || "Thinking…"}</span>
        <span aria-hidden="true" className="flex h-[7px] items-center gap-1.5">
          {[0, 1, 2].map((n) => (
            <i
              key={n}
              className="size-1.5 rounded-full bg-primary opacity-35 animate-hdot"
              style={{ animationDelay: `${n * 0.16}s` }}
            />
          ))}
        </span>
      </span>
    </div>
  );
}

// One message of the chat: the person's in a bubble on the right, the agent's as markdown with its steps folded.
export function HomeMessage({ m, last, busy }: { m: Msg; last: boolean; busy: boolean }) {
  if (m.role === "user")
    return (
      <div className="flex flex-col items-end gap-1.5 animate-hin">
        {m.text && (
          <div className="max-w-[80%] whitespace-pre-wrap rounded-[18px_18px_4px_18px] bg-muted px-3.5 py-[9px] text-foreground [overflow-wrap:anywhere]">
            {m.text}
          </div>
        )}
        {!!m.files?.length && (
          <div className="flex max-w-[80%] flex-wrap justify-end gap-1.5">
            {m.files.map((f, n) => (
              <span
                key={n}
                className="inline-flex max-w-full items-center gap-[5px] rounded-full border border-border px-2 py-1 text-xs [overflow-wrap:anywhere]"
              >
                <Icon name="clip" className="size-3 flex-none" />
                {f.name}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  const active = last && busy;
  const steps = m.steps ?? [];
  // A move is news, not a detail: shown under the reply as well as in the steps.
  const moved = steps.filter((s) => s.kind === "project");
  const runs = runsIn(
    m.text + " " + steps.map((s) => s.text).join(" "),
    host.runCards().map((c) => c.id),
  );
  // Nothing yet: the typing dots stand in for the reply.
  if (!steps.length && !m.text && !m.error && !active) return null;
  return (
    <div className="flex flex-col items-start gap-1.5 animate-hin">
      {m.text && (
        <Markdown
          text={m.text}
          className="w-full leading-[1.6] text-foreground [overflow-wrap:anywhere] [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_p]:max-w-none"
        />
      )}
      {!!steps.length && (
        <details className="group min-w-0 max-w-full text-sm text-muted-foreground">
          <summary className="w-max cursor-pointer hover:text-foreground">
            {steps.length} step{steps.length > 1 ? "s" : ""}
          </summary>
          <ul className="mt-1.5 flex flex-col gap-[3px] border-l-2 border-border pl-2.5">
            {steps.map((s, n) => (
              <li key={n} className={cn("flex min-w-0 items-start gap-1.5", s.ok === false && "text-danger")}>
                <Icon name={stepIcon(s.kind)} className="mt-0.5 size-[13px] flex-none" />
                <code className="min-w-0 whitespace-pre-wrap font-mono [overflow-wrap:anywhere]">{s.text}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
      {m.error && <div className="whitespace-pre-wrap text-base text-danger">{m.error}</div>}
      {moved.map((s, n) => (
        <div
          key={n}
          className={cn("flex items-center gap-1.5 text-sm", s.ok === false ? "text-danger" : "text-success")}
        >
          <Icon name="board" className="size-[13px]" />
          {s.text}
        </div>
      ))}
      {runs.map((id) => (
        <Button
          key={id}
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            const c = host.runCards().find((x) => x.id === id);
            if (c) host.openCard(c);
          }}
        >
          <Icon name="board" className="size-3.5" />
          Open {id}
        </Button>
      ))}
      {active && <Activity text={m.activity || "Thinking…"} />}
    </div>
  );
}
