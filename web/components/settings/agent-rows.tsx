import { useState } from "react";
import {
  AGENT_FAVICONS,
  saveAgentPrefs,
  setDefaultAgent,
  setPermissions,
  toggleAgentOpen,
  useSettings,
} from "../../lib/settings/index.ts";
import { cn } from "../../lib/core/index.ts";
import type { Agent } from "../../lib/settings/index.ts";
import { Button, Icon, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@web/ui";
import { Chip, Field, IconButton, Segmented } from "../shared/index.ts";
import { CommitInput } from "./commit-input.tsx";

const MODES: [string, string][] = [
  ["own", "Each agent's own settings"],
  ["bypass", "Bypass every permission prompt"],
];
const mark = (cmd: string, size: number) =>
  AGENT_FAVICONS[cmd] ? (
    <img src={AGENT_FAVICONS[cmd]} alt="" width={size} height={size} className="shrink-0 rounded-[3px]" />
  ) : null;

// The default for new agents: one chip per usable agent, and Auto.
export function AgentDefaultRow() {
  const ap = useSettings((s) => s.data?.agents),
    cfg = useSettings((s) => s.data?.cfg),
    def = useSettings(
      (s) => s.local["agent.default"] ?? cfg?.rows.find((r) => r.key === "agent.default")?.value ?? "auto",
    );
  if (!ap) return null;
  const scope = cfg && cfg.scope !== "all" ? cfg.projects.find((p) => p.dir === cfg.scope)?.label : "";
  return (
    <div className="flex flex-col gap-2 px-3.5 py-2.5">
      <span id="ag-def-l" className="text-sm text-strong">
        Default for new agents{scope ? ` in ${scope}` : ""}
      </span>
      <div role="group" aria-labelledby="ag-def-l" className="flex flex-wrap gap-1.5">
        {[{ cmd: "auto", name: "Auto" }, ...ap.agents.filter((a) => a.enabled && a.installed)].map((a) => (
          <Chip
            key={a.cmd}
            className="h-8 px-3 text-base"
            pressed={a.cmd === def}
            onPressedChange={() => void setDefaultAgent(a.cmd)}
          >
            {mark(a.cmd, 16)}
            {a.name}
            {a.cmd === def ? " ✓" : ""}
          </Chip>
        ))}
      </div>
    </div>
  );
}

// What every agent may do without asking. A bypass asks first; a no leaves the select where the server has it.
export function AgentPermissionRow() {
  const ap = useSettings((s) => s.data?.agents);
  if (!ap) return null;
  return (
    <Field
      row
      id="ag-perm"
      label="All agents"
      help="What every agent may do without asking, for all your projects. You can set one agent differently below. Cards show when a run uses bypass."
    >
      {({ id }) => (
        <Select value={ap.permissions} onValueChange={(v) => void setPermissions(v)}>
          <SelectTrigger id={id} className="w-60 @max-[520px]:w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODES.map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}

// One agent: on or off, make it the default, and (opened) its permissions, command, arguments, environment and launch line.
export function AgentCard({ cmd }: { cmd: string }) {
  const ap = useSettings((s) => s.data?.agents),
    cfg = useSettings((s) => s.data?.cfg),
    opened = useSettings((s) => s.openAgents.includes(cmd)),
    def = useSettings(
      (s) => s.local["agent.default"] ?? cfg?.rows.find((r) => r.key === "agent.default")?.value ?? "auto",
    );
  const a = ap?.agents.find((x) => x.cmd === cmd);
  if (!ap || !a) return null;
  const id = "ag-" + cmd;
  return (
    <div className={cn("px-3.5 py-2.5", !a.installed && "opacity-65")}>
      <div className="flex flex-wrap items-center gap-2.5">
        <img src={AGENT_FAVICONS[cmd] ?? ""} alt="" width={28} height={28} className="size-7 shrink-0 rounded-sm" />
        <span className="min-w-0 flex-[1_1_120px]">
          <b className="block font-medium">{a.name}</b>
          <code className="break-words text-xs text-muted-foreground">{a.command || a.cmd}</code>
        </span>
        {!a.installed && <span className="text-xs text-muted-foreground">Not installed</span>}
        <Segmented
          label={`${a.name} enabled`}
          idPrefix={`${id}-on`}
          options={[
            { id: "true", label: "Enabled" },
            { id: "false", label: "Disabled" },
          ]}
          value={String(a.enabled)}
          onChange={(v) => void saveAgentPrefs({ agent: cmd, enabled: v === "true" })}
        />
        <Button
          id={`${id}-def`}
          aria-pressed={def === cmd}
          disabled={!a.enabled || !a.installed}
          onClick={() => void setDefaultAgent(cmd)}
        >
          {def === cmd ? "✓ Default" : "Default"}
        </Button>
        <IconButton
          id={`${id}-more`}
          icon={<Icon name="chev" className={cn("transition-transform", opened && "rotate-180")} />}
          label={`Details for ${a.name}`}
          aria-expanded={opened}
          aria-controls={`${id}-b`}
          onClick={() => toggleAgentOpen(cmd)}
        />
      </div>
      {opened && <AgentBody a={a} envWorks={ap.envWorks} all={ap.permissions} />}
    </div>
  );
}

function AgentBody({ a, envWorks, all }: { a: Agent; envWorks: boolean; all: string }) {
  const id = "ag-" + a.cmd;
  const [name, setName] = useState(""),
    [value, setValue] = useState("");
  const allMode = MODES.find(([v]) => v === all)?.[1];
  return (
    <div id={`${id}-b`} className="mt-3 grid gap-3 pl-[38px] @max-[520px]:pl-0">
      {a.bypass ? (
        <Field id={`${id}-perm`} label="Permissions">
          {({ id: pid }, labelId) => (
            <Select value={a.permissions} onValueChange={(v) => void setPermissions(v, a.cmd, a.name)}>
              <SelectTrigger id={pid} aria-labelledby={labelId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  ["all", `Same as all agents · ${allMode}`],
                  ["own", `Use ${a.name}'s own settings`],
                  ["bypass", "Bypass every permission prompt"],
                ].map(([v, l]) => (
                  <SelectItem key={v} value={v!}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      ) : (
        <p className="text-xs text-muted-foreground">{a.name} has no bypass mode, so it uses its own settings.</p>
      )}
      <Field id={`${id}-cmd`} label="Command">
        {(f) => (
          <CommitInput
            {...f}
            raw
            value={a.command}
            placeholder={a.cmd}
            spellCheck={false}
            autoComplete="off"
            onCommit={(v) => saveAgentPrefs({ agent: a.cmd, command: v })}
          />
        )}
      </Field>
      <Field id={`${id}-args`} label="Arguments">
        {(f) => (
          <CommitInput
            {...f}
            raw
            value={a.args}
            placeholder="No default arguments"
            spellCheck={false}
            autoComplete="off"
            onCommit={(v) => saveAgentPrefs({ agent: a.cmd, args: v })}
          />
        )}
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-base font-medium">Environment</span>
        {a.env.map((k) => (
          <div key={k} className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-[1_1_120px] break-words">{k}=•••</code>
            <Button size="sm" onClick={() => void saveAgentPrefs({ agent: a.cmd, envRemove: k })}>
              Remove
            </Button>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 @max-[520px]:grid-cols-1">
          <Input
            id={`${id}-ek`}
            placeholder="NAME"
            aria-label="Variable name"
            spellCheck={false}
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            id={`${id}-ev`}
            type="password"
            placeholder="value"
            aria-label="Variable value"
            autoComplete="new-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button
            id={`${id}-ea`}
            onClick={() => {
              if (!name.trim()) return;
              void saveAgentPrefs({ agent: a.cmd, envName: name.trim(), envValue: value }).then(
                () => (setName(""), setValue("")),
              );
            }}
          >
            Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Don't store secrets here: values are saved as plain text in ~/.kaizen/agents.json and are visible in the
          process list while the agent runs.{envWorks ? "" : " Not applied on Windows yet."}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-base font-medium">Launch line</span>
        <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-background p-2 text-xs">
          {a.preview}
        </pre>
      </div>
    </div>
  );
}
