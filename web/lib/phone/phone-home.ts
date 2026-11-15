// What a phone's Home and Runs pages show, without the DOM (phone-home.test.ts): the agents grouped by workspace, this
// computer's runs sorted into Waiting, Active, Tasks and Done, the devices, and the line under each run. The cards,
// projects and agents come from the side menu's data (lib/rail), which the board refreshes; components/phone/phone-home.tsx
// draws what these return.
import { age, need } from "@lib/core";
import { agentStatus, dueWord, gitDue, stateOf, taskForCard, type Agent, type RailData, type Status } from "@lib/rail";

export type Computer = { name: string; dns: string; os: string; online: boolean };
export type Net = { self: Computer | null; computers: Computer[]; tailscale: boolean };
export type Usage = { agent: string; error?: string; five?: Win; week?: Win };
type Win = { pct: number; resetsAt?: number };

const STAGE = ["idea", "planning", "building", "reviewing", "done"];
// A run is over when it is done or abandoned.
const over = (c) => ["done", "abandoned"].includes(c.status);
export const phoneRuns = (cards: any[]) => cards.filter((c) => c.kind === "run" && !c.archived);
// Tasks not started yet: a phone has no Tasks page, so the Runs page lists them.
export const phoneTasks = (cards: any[]) => cards.filter((c) => c.kind === "idea" && !c.archived);
export const rowKey = (c) => (c.kind === "run" ? c.id : c.text);
export const stateWord = (c, d: RailData) => stateOf(c, taskForCard(c, d.tasks));

// The line under a run's title: what it waits on, else its stage and age.
export function subline(c, now: number, task?: { attention: { reason: string; action: string } } | null) {
  if (task) return task.attention.reason + " · " + task.attention.action;
  // An idle agent and no run yet: it answered, or waits for the user.
  if (c.kind === "idea")
    return !c.pty?.alive
      ? "idea"
      : c.pty.asking
        ? "waiting on you"
        : c.pty.busy
          ? "planning · starting"
          : "agent · open";
  const t = c.moved ?? now;
  if (c.stage === "explore")
    return c.awaiting ? `exploring · ${need(c.awaiting)}` : `exploring · ${age(c.moved ?? now, now)}`;
  if (c.status === "waiting")
    return c.awaiting ? `${STAGE[c.column] ?? "waiting"} · ${need(c.awaiting)}` : "waiting on you";
  if (c.accept === "needs") return "done, not approved";
  if (gitDue(c)) return `waiting on you · ${dueWord(c)}`;
  if (c.accept === "auto") return `auto-accepted · ${age(t, now)} ago`;
  if (c.status === "done" || c.status === "abandoned") return `${c.status} · ${age(t, now)} ago`;
  if (c.status === "stalled") return `stalled · ${age(t, now)}`;
  return `${STAGE[c.column] ?? c.status} · ${age(t, now)}`;
}

// Home's slider: one card per workspace with an agent open, those asking first.
const URGENT: Record<Status, number> = { conflict: 0, failed: 0, asking: 1, working: 2, done: 3 };
export type AgentRow = { a: Agent; st: Status };
export type AgentGroup = { k: string; rows: AgentRow[] };
export const groupKey = (a: Agent) => a.dir + "\n" + (a.ws ?? "");
export const wsName = (a: Agent) => a.ws?.split(/[\\/]/).pop() || "main";
export function agentGroups(agents: Agent[], now: number): AgentGroup[] {
  const groups = new Map<string, AgentRow[]>();
  for (const a of agents) {
    const k = groupKey(a);
    groups.set(k, [...(groups.get(k) ?? []), { a, st: agentStatus(a, now) }]);
  }
  return [...groups]
    .map(([k, rows]) => ({ k, rows: rows.sort((x, y) => URGENT[x.st] - URGENT[y.st]) }))
    .sort((x, y) => URGENT[x.rows[0]!.st] - URGENT[y.rows[0]!.st]);
}
export const askingCount = (groups: AgentGroup[]) => groups.filter((g) => g.rows[0]!.st === "asking").length;

// This computer's line under Devices: its projects, its runs going and those waiting on you.
export function homeStats(d: RailData) {
  const all = phoneRuns(d.cards);
  return {
    projects: new Set(all.map((c) => c.state)).size,
    active: all.filter((c) => !over(c)).length,
    waiting: all.filter((c) => stateWord(c, d) === "wait").length,
  };
}
// The twelve runs that moved last.
export const recentRuns = (cards: any[]) =>
  [...phoneRuns(cards)].sort((a, b) => (b.moved ?? 0) - (a.moved ?? 0)).slice(0, 12);
// Two devices show, this computer first; the rest wait behind Show more.
export const shownDevices = (computers: Computer[], all: boolean) => ({
  list: computers.slice(0, all ? undefined : 1),
  hidden: computers.length - 1,
});

// The Runs page: Waiting on you, Active, Tasks, Done.
export function runGroups(d: RailData) {
  const all = [...phoneRuns(d.cards)].sort((a, b) => (b.moved ?? 0) - (a.moved ?? 0));
  const wait = all.filter((c) => stateWord(c, d) === "wait");
  const done = all.filter(over);
  return {
    wait,
    active: all.filter((c) => !wait.includes(c) && !done.includes(c)),
    tasks: phoneTasks(d.cards).sort((a, b) => (b.moved ?? b.added ?? 0) - (a.moved ?? a.added ?? 0)),
    done,
    none: !all.length && !phoneTasks(d.cards).length,
  };
}

// Usage chips: the agent's 5-hour %, coloured as it fills; the full windows on tap.
export const NAME: Record<string, string> = { claude: "Claude", codex: "Codex" };
export const usageList = (list: Usage[]) => list.filter((u) => NAME[u.agent]);
export const usageLevel = (p: number) => (p >= 95 ? "hi" : p >= 80 ? "mid" : "");
export const resets = (t?: number) =>
  t ? new Date(t).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "unknown";
