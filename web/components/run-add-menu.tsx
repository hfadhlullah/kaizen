import { useEffect, useState, type KeyboardEvent, type ReactElement } from "react";
import { run, setRunView, useRunView, type RvMenu } from "../lib/run/index.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";
import { Icon } from "../ui/icon.tsx";
import { Switch } from "../ui/switch.tsx";

// The agents with their own mark in the sprite; the rest show the generic one.
const MARKS = ["claude", "codex", "gemini"];
const row = "grid grid-cols-[18px_1fr] items-start gap-2.5 px-2.5 py-1.5";
const Row = ({ icon, name, note, onSelect }: { icon: string; name: string; note: string; onSelect: () => void }) => (
  <DropdownMenuItem className={row} onSelect={onSelect}>
    <Icon name={icon} className="mt-px size-4" />
    <span className="text-foreground">
      {name}
      <small className="block text-[11.5px] text-muted-foreground">{note}</small>
    </span>
  </DropdownMenuItem>
);
// j and k walk a menu as the arrows do (the board's other lists are walked that way).
const walk = (e: KeyboardEvent) => {
  const step = { j: 1, k: -1 }[e.key];
  if (!step) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]")];
  items[(items.indexOf(document.activeElement as HTMLElement) + step + items.length) % items.length]?.focus();
};
// The + (a new tab), split right and split down menus: the agents (default first), a Bypass switch for this launch, then
// Shell, Browser, Preview and History. `mode` says where the new item goes. One is open at a time (`menu` in the store,
// which the Ctrl+Space keys also set); the child is the button that opens it.
export function RunAddMenu({ mode, children }: { mode: RvMenu; children: ReactElement }) {
  const agents = useRunView((s) => s.agents),
    defAgent = useRunView((s) => s.defAgent),
    pty = useRunView((s) => s.pty),
    open = useRunView((s) => s.menu === mode),
    dflt = agents.find((a) => a.cmd === defAgent) ?? agents[0],
    [bypass, setBypass] = useState(false),
    pick = (n: string) =>
      run.act.openNew(n, mode, n.startsWith("agent:") && bypass !== !!dflt?.bypassDefault ? bypass : undefined);
  // Bypass starts from Settings → Agents → Permissions (the default agent's) and resets each time the menu opens.
  useEffect(() => {
    if (open) setBypass(!!dflt?.bypassDefault);
  }, [open, dflt?.bypassDefault]);
  const agentRow = (a: (typeof agents)[number]) => (
    <Row
      key={a.cmd}
      icon={MARKS.includes(a.cmd) ? a.cmd : "ai"}
      name={a.name}
      note={a === dflt ? "default agent, in this folder" : "the agent alone, no run"}
      onSelect={() => pick("agent:" + a.cmd)}
    />
  );
  return (
    <DropdownMenu open={open} onOpenChange={(o) => setRunView({ menu: o ? mode : null })}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[250px] max-h-[calc(100vh-60px)] overflow-y-auto"
        onKeyDown={walk}
      >
        {pty && agents.length > 0 && (
          <>
            {agents.some((a) => a.yolo) && (
              <label className="mb-1 flex items-center justify-between gap-4 border-b border-border px-2.5 pb-2.5 pt-1.5 text-base">
                <span>
                  Bypass permissions
                  <small className="block text-[11.5px] text-muted-foreground">run commands without asking</small>
                </span>
                <Switch checked={bypass} onCheckedChange={setBypass} aria-label="Bypass permissions" />
              </label>
            )}
            {agentRow(dflt!)}
            {agents.filter((a) => a !== dflt).map(agentRow)}
            <DropdownMenuSeparator />
          </>
        )}
        {pty && <Row icon="term" name="Shell" note="a terminal in this folder" onSelect={() => pick("shell")} />}
        <Row icon="link" name="Browser" note="localhost pages, e.g. the dev server" onSelect={() => pick("local")} />
        <Row icon="eye" name="Preview" note="the run's Preview" onSelect={() => pick("preview")} />
        <Row icon="note" name="History" note="finished runs in this workspace" onSelect={() => pick("history")} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
