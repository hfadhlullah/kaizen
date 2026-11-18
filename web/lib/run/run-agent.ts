// The agent on the run whose panel is open, for the panel's top row: the tool the run recorded (or the one that has its
// terminal open now), and whether it works, is stopped, or the run is over.
import type { Card } from "@lib/core";

export type RunAgentInfo = { agent: string; state: "working" | "stopped" | "done"; stage?: string; key?: string };
export function runAgentInfo(
  card: Card | null | undefined,
  stateJson: string | undefined,
  agents: { key: string; dir: string; run?: string; agent?: string }[] = [],
): RunAgentInfo | null {
  if (!card || card.kind !== "run") return null;
  let recorded = "";
  try {
    recorded = JSON.parse(stateJson ?? "{}").agent ?? "";
  } catch {}
  const open = agents.find((a) => a.run === card.id && a.dir === card.state),
    agent = open?.agent || (typeof recorded === "string" ? recorded : "");
  if (!agent) return null;
  const over = ["done", "abandoned"].includes(card.stage ?? "") || ["done", "abandoned"].includes(card.status);
  return {
    agent,
    state: card.pty?.alive || open ? "working" : over ? "done" : "stopped",
    stage: card.stage,
    key: card.pty?.key ?? open?.key,
  };
}
