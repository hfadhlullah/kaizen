import { useEffect, useState } from "react";
import type { Card } from "../lib/board.ts";
import { loadAgents, startRun, type Agents } from "../lib/board-actions.ts";
import type { RunPick } from "../lib/board-store.ts";
import { cn } from "../lib/utils.ts";
import { Button } from "../ui/button.tsx";
import { Icon } from "../ui/icon.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select.tsx";
import { Switch } from "../ui/switch.tsx";
import { Checkbox } from "../ui/checkbox.tsx";
import { FormFrame } from "./form-frame.tsx";

const NORMAL = "__normal"; // Radix Select has no empty value: the normal login
// The Run form for a task or backlog item: which agent (with its account, when it has some), Explore first, Yolo
// where the agent has a skip-permissions mode, then Cancel / Lite / Full run. `onStart` takes the choice instead of
// starting (the Tasks page starts its own task); without it the run starts here and its workspace opens.
export function RunForm({
  card,
  inline,
  onDone,
  onStart,
}: {
  card: Card;
  inline?: boolean;
  onDone: () => void;
  onStart?: (p: RunPick) => void;
}) {
  const [d, setD] = useState<Agents | null | undefined>(undefined),
    [agent, setAgent] = useState(""),
    [account, setAccount] = useState(NORMAL),
    [yolo, setYolo] = useState(false),
    [explore, setExplore] = useState(false),
    [touched, setTouched] = useState(false);
  const cur = d?.agents.find((a) => a.cmd === agent);
  const pickAgent = (a: Agents["agents"][number]) => {
    setAgent(a.cmd);
    setAccount(a.defaultAccount ?? NORMAL);
  };
  useEffect(() => {
    void loadAgents(card.state).then((x) => {
      setD(x);
      if (!x) return;
      pickAgent(x.agents.find((a) => a.cmd === x.default) ?? x.agents[0]!);
      setExplore(x.explore === true);
    });
  }, [card.state]);
  const go = (kind: "full" | "lite") => {
    const p: RunPick = {
      kind,
      agent: d ? agent : undefined,
      account: cur?.accounts?.length ? (account === NORMAL ? "" : account) : undefined,
      yolo: !!(yolo && cur?.yolo),
      explore: d && touched ? explore : undefined,
    };
    onDone();
    if (onStart) onStart(p);
    else void startRun(card, kind, p);
  };
  return (
    <FormFrame inline={inline} label="Run">
      <div className="text-base font-medium">Run "{card.text}"</div>
      <div className="text-sm text-muted-foreground">Opens your agent with this request in a terminal.</div>
      <div className="text-sm text-muted-foreground">
        Full plans, builds, and checks with a separate reviewer. Lite does it in one session.
      </div>
      {d && (
        <>
          <div role="radiogroup" aria-label="Agent" className="flex flex-wrap gap-1.5">
            {d.agents.map((a) => (
              <button
                key={a.cmd}
                type="button"
                role="radio"
                aria-checked={a.cmd === agent}
                onClick={() => pickAgent(a)}
                className={cn(
                  "inline-flex h-(--btn-s) items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 text-base hover:border-muted-foreground",
                  a.cmd === agent && "border-primary bg-primary/10 text-foreground",
                )}
              >
                <Icon sprite="c" name={a.cmd} className="size-4" />
                {a.name}
              </button>
            ))}
          </div>
          {cur?.accounts?.length ? (
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger aria-label="Account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NORMAL}>Normal login</SelectItem>
                {cur.accounts.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <label className="flex items-center gap-2 text-base">
            <Checkbox
              checked={explore}
              onCheckedChange={(v) => (setExplore(v === true), setTouched(true))}
              aria-label="Explore first"
            />
            Explore first
          </label>
        </>
      )}
      <div className="grid gap-2">
        {cur?.yolo && (
          <label
            className="flex items-center gap-2 text-base"
            title="Yolo: the agent runs every command and edit without asking"
          >
            <Switch checked={yolo} onCheckedChange={setYolo} aria-label="Yolo" />
            Yolo
          </label>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button onClick={() => go("lite")}>Lite</Button>
          <Button variant="primary" className="col-span-2" onClick={() => go("full")}>
            Full run
          </Button>
        </div>
      </div>
    </FormFrame>
  );
}
