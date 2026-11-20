import { createElement, useEffect, useState } from "react";
import {
  AGENT_FAVICONS,
  getSettings,
  hasSkillIcon,
  letterOf,
  reaNode,
  reaSwitch,
  removeMySkill,
  removePlugin,
  repairSkill,
  setSettings,
  setSkill,
  skillShapes,
  useSettings,
} from "@lib/settings";
import { cn } from "@lib/core";
import { COPY, STEP } from "@lib/home";
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Switch } from "@web/ui";
import { WorksFlow } from "@components/home";
import { Segmented } from "@components/shared";
import { OwnerMark } from "./skill-store.tsx";

const WORD: Record<string, string> = { installed: "installed", missing: "missing", other: "your own copy" };
const AGENT_CMD: Record<string, string> = {
  "Claude Code": "claude",
  Codex: "codex",
  Antigravity: "agy",
  OpenCode: "opencode",
  Cursor: "cursor",
  "Gemini CLI": "gemini",
};
type Need = {
  state: "missing" | "old";
  have?: string;
  how: "winget" | "brew" | "link";
  command?: string;
  url?: string;
};

// REA runs on the PC's Node.js: missing, or older than REA accepts. `command` is what the server will run.
function NodeButton({ n }: { n: Need }) {
  const busy = useSettings((s) => s.busy === "rea-node");
  if (n.how === "link")
    return (
      <Button asChild>
        <a href={n.url} target="_blank" rel="noopener">
          Get Node.js
        </a>
      </Button>
    );
  return (
    <Button data-rea-node={n.state} disabled={busy} onClick={() => void reaNode(n.state, n.command ?? "")}>
      {n.state === "missing" ? "Install Node.js" : "Update Node.js"}
    </Button>
  );
}

// The "?" beside Kaizen workflow: the welcome's picture of how a run goes (ask, plan, approve, build, review), to look at again.
function HowItWorks() {
  const [open, setOpen] = useState(false);
  const c = COPY[STEP.works]!;
  return (
    <>
      <button
        type="button"
        aria-label="How kaizen works"
        title="How kaizen works"
        data-how-it-works
        onClick={() => setOpen(true)}
        className="ml-1.5 inline-grid size-4 place-items-center rounded-full border border-border align-middle text-[10px] leading-none text-muted-foreground hover:text-foreground"
      >
        ?
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(720px,calc(100vw-32px))] gap-3 p-6">
          <DialogTitle className="text-xl font-bold text-strong">{c.title}</DialogTitle>
          <DialogDescription className="text-base">{c.sub}</DialogDescription>
          <WorksFlow />
        </DialogContent>
      </Dialog>
    </>
  );
}

// One skill: its mark, name and what it does, a switch (or Repair / Always on for a core one), and which agents have it.
export function SkillCard({ id }: { id: string }) {
  const s = useSettings((st) => st.data?.skills?.skills.find((x: any) => x.id === id));
  if (!s) return null;
  const core = s.group === "core";
  return (
    <div className="px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <SkillMark id={s.id} />
        <span className="min-w-0 flex-[1_1_200px]">
          <b className="block font-medium">
            {s.title}
            {s.id === "kaizen" && <HowItWorks />}
            {s.status && s.status !== "stable" && (
              <em className="ml-1.5 rounded-xs border border-border px-1.5 text-[10.5px] font-normal not-italic text-muted-foreground">
                {s.status === "beta" ? "Beta" : "Experimental"}
              </em>
            )}
          </b>
          <span className="text-xs text-muted-foreground">{s.description}</span>
        </span>
        {core ? (
          s.agents.some((a: any) => a.state !== "installed") ? (
            <Button
              data-repair={s.id}
              onClick={() =>
                void repairSkill(
                  s.id,
                  s.agents.some((a: any) => a.state === "other"),
                )
              }
            >
              Repair
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Always on</span>
          )
        ) : (
          <>
            {s.rea?.node && <NodeButton n={s.rea.node} />}
            {s.rea?.update && (
              <Button data-rea-update="1" onClick={() => void reaSwitch(true, true)}>
                Update to {s.rea.latest}
              </Button>
            )}
            {!s.rea && !s.off && s.agents.some((a: any) => a.state === "missing") && (
              <Button data-skill={s.id} data-on="true" onClick={() => void setSkill(s.id, true, false)}>
                Install
              </Button>
            )}
            <Switch
              data-skill={s.id}
              aria-label={s.title}
              title={s.off ? "Off" : "On"}
              checked={!s.off}
              onCheckedChange={(on) => void setSkill(s.id, on, !!s.offByDefault)}
            />
          </>
        )}
      </div>
      <div className="ml-[34px] mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground @max-[520px]:ml-0">
        <AgentMarks agents={s.agents} />
        {s.needs.map((n: any) => (
          <span key={n.name} className={cn(!n.found && "text-warning")}>
            Needs {n.name}
            {n.found ? "" : " (not found)"}
          </span>
        ))}
        {s.note && <span>{s.note}</span>}
      </div>
    </div>
  );
}

// A skill's mark: its drawn icon, or for a skill from outside kaizen the first letter of its name in a square.
function SkillMark({ id }: { id: string }) {
  if (!hasSkillIcon(id) && !id.startsWith("kaizen"))
    return (
      <span
        aria-hidden="true"
        className="grid size-6 shrink-0 place-items-center rounded-sm border border-border text-xs font-semibold text-muted-foreground"
      >
        {letterOf(id)}
      </span>
    );
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-6 shrink-0 fill-none stroke-current stroke-[1.6] [stroke-linecap:round] [stroke-linejoin:round]"
    >
      {skillShapes(id).map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}
// Which agents have a skill: each agent's icon, lit when it has it. An agent not installed here is left out, even when
// its folder exists.
function AgentMarks({ agents }: { agents: { agent: string; state: string }[] }) {
  const absent = useSettings((s) => s.data?.agents?.agents?.filter((a) => !a.installed).map((a) => a.cmd).join(" ") ?? "");
  const gone = new Set(absent.split(" "));
  return agents.filter((a) => !gone.has(AGENT_CMD[a.agent] ?? "")).map((a) => {
    const t = `${a.agent}: ${WORD[a.state] ?? a.state}`;
    return (
      <img
        key={a.agent}
        src={AGENT_FAVICONS[AGENT_CMD[a.agent] ?? ""] ?? ""}
        width={18}
        height={18}
        alt={t}
        title={t}
        className={cn("rounded-[3px]", a.state !== "installed" && "opacity-30 grayscale")}
      />
    );
  });
}
const tag = "ml-1.5 rounded-xs border border-border px-1.5 text-[10.5px] font-normal text-muted-foreground";

// Settings → Skills: kaizen's own skills, the user's skills from elsewhere, or the skill store.
export function SkillTabs() {
  const tab = useSettings((s) => s.skillTab);
  return (
    <div className="pb-3">
      <Segmented
        label="Skills"
        idPrefix="sk-tab"
        options={[
          { id: "kaizen", label: "Kaizen" },
          { id: "mine", label: "My Skills" },
          { id: "store", label: "Find skills" },
        ]}
        value={tab}
        onChange={(t) => setSettings({ skillTab: t })}
      />
    </div>
  );
}

// A skill the agents have from outside kaizen. Only one kaizen installed from the store can be removed here.
export function OutsideSkillCard({ id }: { id: string }) {
  const s = useSettings((st) => st.data?.skills?.outside?.find((x: any) => x.id === id));
  const busy = useSettings((st) => st.busy === "store-" + id);
  if (!s) return null;
  const from =
    s.origin === "store" ? `from the store · ${s.source}` : s.origin === "link" ? "linked" : "your own folder";
  return (
    <div className="px-3.5 py-2.5" data-outside={s.id}>
      <div className="flex flex-wrap items-center gap-2.5">
        {s.source ? <OwnerMark source={s.source} name={s.id} /> : <SkillMark id={s.id} />}
        <span className="min-w-0 flex-[1_1_200px]">
          <b className="block font-medium">
            {s.id}
            <em className={cn(tag, "not-italic")}>{from}</em>
          </b>
          <span className="text-xs text-muted-foreground">{s.description}</span>
        </span>
        <Button data-remove={s.id} disabled={busy} onClick={() => void removeMySkill(s)}>
          {busy ? "Removing…" : "Remove"}
        </Button>
      </div>
      <div className="ml-[34px] mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground @max-[520px]:ml-0">
        <AgentMarks agents={s.agents} />
        <span className="min-w-0 truncate">{s.path}</span>
      </div>
    </div>
  );
}
// My Skills' search box: narrows the list once typing pauses for a moment.
export function MySkillsSearch() {
  const [text, setText] = useState(() => getSettings().skillQ);
  useEffect(() => {
    const t = setTimeout(() => setSettings({ skillQ: text.trim().toLowerCase() }), 250);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <div className="pb-1">
      <Input
        type="search"
        aria-label="Search my skills"
        placeholder="Search my skills"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={100}
      />
    </div>
  );
}
export function NoSkills() {
  const q = useSettings((s) => s.skillQ);
  return (
    <p className="py-2 text-sm text-muted-foreground">
      {q ? `No skills match "${q}".` : "No skills from other places yet. Find skills to add some."}
    </p>
  );
}

export function MoreSkills() {
  const n = useSettings((st) => (st.data?.skills?.outside?.length ?? 0) + (st.data?.skills?.plugins?.length ?? 0));
  return (
    <div className="px-3.5 py-2">
      <Button variant="ghost" data-a="skills-all" onClick={() => setSettings({ skillAll: true })}>
        Show all {n}
      </Button>
    </div>
  );
}

// One installed Claude Code plugin and the skills inside it. Read-only: plugins are managed with `claude plugin`.
export function PluginSkillCard({ plugin }: { plugin: string }) {
  const p = useSettings((st) => st.data?.skills?.plugins?.find((x: any) => x.plugin === plugin));
  const busy = useSettings((st) => st.busy === "store-" + plugin);
  if (!p) return null;
  return (
    <details className="group px-3.5 py-2.5" data-plugin={p.plugin}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2.5 [&::-webkit-details-marker]:hidden">
        {p.owner ? <OwnerMark source={p.owner} name={p.plugin} /> : <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-6 shrink-0 fill-none stroke-current stroke-[1.6] [stroke-linecap:round] [stroke-linejoin:round]"
        >
          <path d="M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0zM12 18v3" />
        </svg>}
        <span className="min-w-0 flex-[1_1_200px]">
          <b className="block font-medium">
            {p.plugin}
            <em className={cn(tag, "not-italic")}>
              {p.skills.length} skill{p.skills.length === 1 ? "" : "s"}
            </em>
          </b>
          <span className="text-xs text-muted-foreground">
            Claude Code plugin{p.marketplace ? ` from ${p.marketplace}` : ""}
            {p.store ? " · installed from the store" : ""}
          </span>
        </span>
        {p.user && (<Button
          data-remove-plugin={p.plugin}
          disabled={busy}
          onClick={(e) => {
            e.preventDefault(); // a click on the button is not a click on the row's open/close
            void removePlugin(p);
          }}
        >
          {busy ? "Removing…" : "Remove"}
        </Button>)}
        <span aria-hidden="true" className="text-xs text-muted-foreground group-open:rotate-90">
          ›
        </span>
      </summary>
      <ul className="ml-[34px] mt-1.5 flex flex-col gap-1 text-xs text-muted-foreground">
        {p.skills.map((k: any) => (
          <li key={k.id} className="min-w-0 truncate">
            <span className="text-foreground">{k.id}</span>
            {k.description ? ` · ${k.description}` : ""}
          </li>
        ))}
      </ul>
    </details>
  );
}
