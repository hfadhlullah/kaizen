import { useState } from "react";
import { agentMark, closeSheet, useSheet, type NewSheet, type PickSheet } from "../../lib/phone/index.ts";
import { Icon } from "../../ui/icon.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select.tsx";
import { BottomSheetContent, Sheet, SheetDescription, SheetTitle } from "../../ui/sheet.tsx";
import { StateDot } from "../shared/index.ts";
import { Switch } from "../../ui/switch.tsx";

const mark = (agent: string) => agentMark(agent, (id) => !!document.getElementById(id));
const rowCls =
  "flex min-h-12 w-full items-center gap-2 border-t border-border text-left text-lg [&_small]:ml-auto [&_small]:text-sm [&_small]:text-muted-foreground";
const Ico = ({ name }: { name: string }) => <Icon name={name} className="size-[18px] flex-none" />;

function Pick({ s }: { s: PickSheet }) {
  return (
    <>
      <SheetTitle className="mb-2 font-mono text-base font-normal text-foreground">{s.title}</SheetTitle>
      {s.rows.map((r, i) => (
        <button
          key={i}
          type="button"
          className={rowCls}
          onClick={() => {
            closeSheet();
            r.open();
          }}
        >
          <Ico name={mark(r.agent)} />
          {r.name}
          <StateDot state={r.dot} />
          <small>{r.word}</small>
        </button>
      ))}
      <button
        type="button"
        className={rowCls}
        onClick={() => {
          closeSheet();
          s.onNew();
        }}
      >
        <Ico name="ai" />
        New agent
      </button>
    </>
  );
}

// New: pick a workspace, then an agent or a plain shell (the same POST the workspace's own + button makes).
function Fresh({ s }: { s: NewSheet }) {
  const [spot, setSpot] = useState(String(s.on)),
    [yolo, setYolo] = useState(s.yolo);
  return (
    <>
      <SheetTitle className="mb-2 font-mono text-base font-normal text-foreground">New in</SheetTitle>
      <Select value={spot} onValueChange={setSpot}>
        <SelectTrigger aria-label="Workspace" className="mb-2 min-h-11 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="-1">Home — no project</SelectItem>
          {s.spots.map((x, i) => (
            <SelectItem key={i} value={String(i)}>
              {x.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label className="flex items-center justify-between gap-3 border-t border-border py-2.5 text-lg">
        <span>
          Yolo / bypass permissions
          <small className="block text-sm text-muted-foreground">Run commands without permission prompts</small>
        </span>
        <Switch checked={yolo} onCheckedChange={setYolo} aria-label="Yolo / bypass permissions" />
      </label>
      {s.kinds.map((k, i) => (
        <button
          key={i}
          type="button"
          className={rowCls}
          onClick={() => {
            closeSheet();
            s.start(Number(spot), i, yolo);
          }}
        >
          <Ico name={k.agent ? mark(k.agent) : "term"} />
          {k.name}
        </button>
      ))}
    </>
  );
}

export function PhoneSheets() {
  const sheet = useSheet((s) => s.sheet);
  return (
    <Sheet open={!!sheet} onOpenChange={(o) => !o && closeSheet()}>
      {sheet && (
        <BottomSheetContent aria-describedby={undefined}>
          <SheetDescription className="sr-only">Choose where to open or start an agent</SheetDescription>
          {sheet.kind === "pick" ? <Pick s={sheet} /> : <Fresh s={sheet} />}
        </BottomSheetContent>
      )}
    </Sheet>
  );
}
