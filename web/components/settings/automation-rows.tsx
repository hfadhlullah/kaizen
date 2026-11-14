import { automationOp, setDraft, useSettings } from "../../lib/settings/index.ts";
import { Button } from "../../ui/button.tsx";
import { Input } from "../../ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select.tsx";
import { Switch } from "../../ui/switch.tsx";
import { Textarea } from "../../ui/textarea.tsx";
import { Field } from "../shared/index.ts";

const when = (t: number) =>
  new Date(t).toLocaleString([], {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
const SCHEDULE: Record<string, string> = {
  hourly: "Every hour",
  daily: "Every day",
  weekdays: "Weekdays",
  weekly: "Every week",
  cron: "Cron",
};
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
// Radix Select takes no empty value: the project default is "default".
const DEFAULT = "default";

// One schedule: when it next fires, Run now / Edit / Delete, a switch to pause it, and its history.
export function AutomationCard({ id }: { id: string }) {
  const r = useSettings((s) => s.data?.automations?.rules.find((x: any) => x.id === id));
  if (!r) return null;
  return (
    <div className="px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="min-w-0 flex-[1_1_200px]">
          <b className="block font-medium">{r.name}</b>
          <span className="text-xs text-muted-foreground">
            {SCHEDULE[r.kind]} · <code>{r.cron}</code> ·{" "}
            {r.enabled ? (r.next ? "next " + when(r.next) : "never") : "paused"}
          </span>
        </span>
        <Button data-auto="run" data-id={r.id} onClick={() => void automationOp("run", r.id)}>
          Run now
        </Button>
        <Button data-auto="edit" data-id={r.id} onClick={() => void automationOp("edit", r.id)}>
          Edit
        </Button>
        <Button data-auto="delete" data-id={r.id} onClick={() => void automationOp("delete", r.id)}>
          Delete
        </Button>
        <Switch
          data-auto={r.enabled ? "pause" : "resume"}
          data-id={r.id}
          aria-label={r.name}
          title={r.enabled ? "On" : "Paused"}
          checked={r.enabled}
          onCheckedChange={() => void automationOp(r.enabled ? "pause" : "resume", r.id)}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {r.text.length > 140 ? r.text.slice(0, 140) + "…" : r.text}
      </p>
      {r.history.length > 0 && (
        <details className="mt-1.5 text-xs text-muted-foreground">
          <summary className="cursor-pointer">History ({r.history.length})</summary>
          <ul className="mt-1 list-disc pl-5">
            {r.history.map((h: any, i: number) => (
              <li key={i}>
                <time>{when(h.at)}</time> · {h.kind} · <b>{h.status.replace(/_/g, " ")}</b>
                {h.reason ? ` · ${h.reason}` : ""}
                {h.run && (
                  <>
                    {" "}
                    · <code>{h.run}</code>
                  </>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const pick = (value: string, onChange: (v: string) => void, items: [string, string][], a: object) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger {...a} className="w-full">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {items.map(([v, l]) => (
        <SelectItem key={v} value={v}>
          {l}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

// The new-automation form (or, with Edit, the one being changed). What is typed lives in the store, so a redraw or a
// change of schedule keeps it. The server decides everything; this only posts.
export function AutomationForm() {
  const d = useSettings((s) => s.data?.automations),
    draft = useSettings((s) => s.draft),
    editing = useSettings((s) => s.editing);
  if (!d) return null;
  const f = (k: string) => draft[k] ?? "";
  const text = (k: string, label: string, extra: object = {}) => (
    <Field id={`au-${k}`} label={label}>
      {(a) => (
        <Input
          {...a}
          value={f(k)}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setDraft(k, e.target.value)}
          {...extra}
        />
      )}
    </Field>
  );
  const kind = f("kind");
  return (
    <div className="grid gap-3 px-3.5 py-2.5">
      <div>
        <b className="block font-medium">{editing ? "Edit automation" : "New automation"}</b>
        <span className="text-xs text-muted-foreground">
          Project: {d.project}. Times are {d.zone}, this computer's. One board per project: runs start only while a
          board is open.
        </span>
      </div>
      <p role="alert" className="text-xs text-warning">
        Warning: an automation runs unattended in auto mode. It plans, builds and reviews with nobody watching, so it
        changes code in this project and spends tokens. It stops at the final approval only if your approval settings
        say so. At most {d.cap} runs a day, and one open run at a time.
      </p>
      {text("name", "Name", { maxLength: 60 })}
      <Field id="au-text" label="Request (what each run should do)">
        {(a) => (
          <Textarea
            {...a}
            rows={3}
            value={f("text")}
            onChange={(e) => setDraft("text", e.target.value)}
            className="min-h-16 rounded-sm border border-border bg-card px-2.5 py-1.5 hover:border-muted-foreground"
          />
        )}
      </Field>
      <Field id="au-kind" label="Schedule">
        {(a) =>
          pick(kind, (v) => setDraft("kind", v), Object.entries(SCHEDULE), {
            id: a.id,
            "aria-describedby": a["aria-describedby"],
          })
        }
      </Field>
      {kind === "cron" ? (
        text("cron", "Cron (minute hour day month weekday)", { placeholder: "0 9 * * 1-5" })
      ) : (
        <>
          {text("time", kind === "hourly" ? "At minute (uses the minutes of HH:MM)" : "Time (HH:MM)", {
            placeholder: "09:00",
          })}
          {kind === "weekly" && (
            <Field id="au-day" label="Day">
              {(a) =>
                pick(
                  f("day"),
                  (v) => setDraft("day", v),
                  DAYS.map((x) => [x, x]),
                  { id: a.id },
                )
              }
            </Field>
          )}
        </>
      )}
      <Field id="au-agent" label="Agent">
        {(a) =>
          pick(
            f("agent") || DEFAULT,
            (v) => setDraft("agent", v === DEFAULT ? "" : v),
            [[DEFAULT, "Project default"], ...d.agents.map((x: any): [string, string] => [x.cmd, x.name])],
            { id: a.id },
          )
        }
      </Field>
      {text("precheck", "Check before each scheduled run (optional shell command; exit 0 continues)", {
        placeholder: 'git fetch -q && test -n "$(git log --since=7.days -1)"',
      })}
      <p className="-mt-2 text-xs text-muted-foreground">
        Runs on this computer, in the project folder, every time this fires. Not run by Run now.
      </p>
      {text("precheck_timeout", "Check time limit (seconds)", { inputMode: "numeric" })}
      {text("grace_minutes", "Late start allowed (minutes after the due time)", { inputMode: "numeric" })}
      <div className="flex gap-1.5">
        <Button variant="primary" data-auto="save" onClick={() => void automationOp("save")}>
          {editing ? "Save" : "Create"}
        </Button>
        {editing && (
          <Button data-auto="cancel" onClick={() => void automationOp("cancel")}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

export const NoAutomations = () => (
  <p className="px-3.5 py-2.5 text-sm text-muted-foreground">
    Open a project to add automations. They belong to one project each.
  </p>
);
