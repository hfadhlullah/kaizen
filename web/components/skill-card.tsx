import { createElement } from "react";
import {
  AGENT_FAVICONS,
  reaNode,
  reaSwitch,
  repairSkill,
  setSkill,
  useSettings,
  skillShapes,
} from "../lib/settings/index.ts";
import { cn } from "../lib/core/index.ts";
import { Button } from "../ui/button.tsx";
import { Switch } from "../ui/switch.tsx";

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

// One skill: its mark, name and what it does, a switch (or Repair / Always on for a core one), and which agents have it.
export function SkillCard({ id }: { id: string }) {
  const s = useSettings((st) => st.data?.skills?.skills.find((x: any) => x.id === id));
  if (!s) return null;
  const core = s.group === "core";
  return (
    <div className="px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-6 shrink-0 fill-none stroke-current stroke-[1.6] [stroke-linecap:round] [stroke-linejoin:round]"
        >
          {skillShapes(s.id).map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
        </svg>
        <span className="min-w-0 flex-[1_1_200px]">
          <b className="block font-medium">
            {s.title}
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
        {s.agents.map((a: any) => {
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
        })}
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
