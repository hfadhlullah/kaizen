import { host, post } from "@lib/core";
import { resumable, resumeRun, runAgentInfo, setFlip, usePanel } from "@lib/run";
import { useRailData } from "@lib/server";
import { agentName } from "@lib/task";
import { AgentChip } from "@components/task";
import { IconButton } from "@components/shared";
import { Button } from "@web/ui";

// The top row of the run workspace's panel, the same as the task conversation's: the agent on the run with a ring while it
// works, Stop or Resume beside it, and the icon that folds the panel away (the run bar's button brings it back).
export function RunAgent() {
  const card = usePanel((s) => s.footer?.card ?? s.card),
    state = usePanel((s) => s.runDoc?.state),
    ro = usePanel((s) => s.ro),
    data = useRailData();
  const info = runAgentInfo(card, state, data.agents);
  const stop = !ro && info?.state === "working" && info.key,
    resume = !!card && !ro && info?.state === "stopped" && resumable(card);
  return (
    <div className="flex min-h-9 items-center gap-2 pb-1.5">
      <div className="mr-auto min-w-0">
        {info && (
          <AgentChip
            agents={[{ agent: info.agent, name: agentName(info.agent), state: info.state, current: true }]}
            stage={info.stage}
          />
        )}
      </div>
      {stop && (
        <Button size="sm" onClick={() => void post("/pty/kill", { key: info.key }).then(() => host.loadBoard())}>
          Stop
        </Button>
      )}
      {resume && (
        <Button size="sm" onClick={() => void resumeRun(card)}>
          Resume
        </Button>
      )}
      <IconButton icon="side" label="Collapse the panel" onClick={() => setFlip(true)} />
    </div>
  );
}
