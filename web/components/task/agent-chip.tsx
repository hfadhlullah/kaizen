import { agentName, type TaskAgent } from "@lib/task";
import { Popover, PopoverContent, PopoverTrigger } from "@web/ui";
import { AgentMark } from "./agent-mark.tsx";

const VERB: Record<string, string> = { explore: "exploring", plan: "planning", build: "building", review: "reviewing" };
const STATE = { working: "working", stopped: "stopped", done: "done" } as const;

// Who is on this task. The agent working now stands in front with a ring and says what it is doing; the others step
// back. Pressing it lists every agent on the task and what each is doing. Nothing when no run has an agent yet.
export function AgentChip({ agents, stage }: { agents: TaskAgent[]; stage?: string }) {
  if (!agents.length) return null;
  const cur = agents.find((a) => a.current) ?? agents[agents.length - 1],
    shown = [cur, ...agents.filter((a) => a !== cur)].slice(0, 3),
    word = cur.state === "working" ? (VERB[stage ?? ""] ?? "working") : cur.state === "stopped" ? "stopped" : "done";
  const label = cur.current ? agentName(cur.agent) : agents.map((a) => a.name || agentName(a.agent)).join(" and ");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Agents on this task: ${agents.map((a) => `${a.name} ${STATE[a.state]}`).join(", ")}`}
          className="flex min-w-0 items-center gap-2 rounded-full py-1 pl-1.5 pr-2.5 text-sm hover:bg-muted"
        >
          <span className="flex shrink-0 gap-1">
            {shown.map((a) => (
              <AgentMark
                key={a.agent}
                agent={a.agent}
                live={a.state === "working"}
                dim={a !== cur && agents.length > 1 && cur.state === "working"}
              />
            ))}
          </span>
          <span className="truncate">
            <span className="font-medium text-strong">{label}</span>
            <span className="text-muted-foreground"> · {word}</span>
          </span>
          <span aria-hidden="true" className="text-[10px] text-muted-foreground">
            ▾
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px]">
        {agents.map((a) => (
          <div key={a.agent} className="flex items-center gap-2.5 rounded-sm px-2 py-2">
            <AgentMark agent={a.agent} live={a.state === "working"} />
            <span className="min-w-0 flex-1 truncate font-medium text-strong">{a.name || agentName(a.agent)}</span>
            <span className={a.state === "working" ? "text-sm text-success" : "text-sm text-muted-foreground"}>
              {a.state === "working" ? (VERB[stage ?? ""] ?? "working") : STATE[a.state]}
            </span>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
