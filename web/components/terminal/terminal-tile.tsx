import { useState, type DragEvent } from "react";
import { TerminalPane } from "@components/panes";
import { IconButton } from "@components/shared";
import { askEnd, cn, host, post } from "@lib/core";
import { labelOf, stateOf, terminalActions, terminalLayout, type Session } from "@lib/terminal";
import { Button } from "@web/ui";

const DOT = { running: "bg-running", asking: "bg-warning", ended: "bg-muted-foreground opacity-60" };
const btn = "size-[22px] text-muted-foreground [&_svg]:size-[13px]";

// A header button took focus off the terminal; give it back so typing carries on.
export const focusTerminal = (key: string) =>
  requestAnimationFrame(() =>
    document
      .querySelector<HTMLElement>(`[data-tile="${CSS.escape(key)}"] .xterm-helper-textarea`)
      ?.focus({ preventScroll: true }),
  );

// One session: a header (state dot, name, Resume, open card, maximise, hide, exit) over its terminal. Dragging a header
// onto another tile swaps the two. The terminal is mounted once for as long as the tile shows, whatever else redraws.
export function TerminalTile({
  k,
  c,
  index,
  off,
  max,
  phone,
  span,
  order,
  noPointer,
}: {
  k: string;
  c: Session;
  index: number;
  off: boolean; // another tile is the one showing
  max: boolean;
  phone: boolean;
  span: number;
  order: string[];
  noPointer: boolean; // a border is being dragged: the terminals must not take its moves
}) {
  const st = stateOf(c),
    ended = st === "ended",
    [drop, setDrop] = useState(false),
    [busy, setBusy] = useState(false);
  const exit = () =>
    void askEnd().then((yes) => yes && post("/pty/exit", { key: k }).then(() => terminalActions.reload()));
  const maxLabel = max ? "Restore" : "Maximise";
  const hide = () => (terminalLayout.hide(k), focusTerminal(k));
  const onDrop = (e: DragEvent) => {
    setDrop(false);
    const from = e.dataTransfer.getData("text/kz-term");
    if (!from || from === k) return;
    e.preventDefault();
    terminalLayout.swap(order, from, k);
  };
  return (
    <section
      data-tile={k}
      className={cn(
        "relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-background pt-2",
        "focus-within:after:pointer-events-none focus-within:after:absolute focus-within:after:inset-0 focus-within:after:z-3 focus-within:after:shadow-[inset_0_0_0_1px_var(--accent)] focus-within:after:content-['']",
        phone && "flex-1",
        off && "hidden",
        max && "fixed inset-2 z-10 shadow-(--shadow-1)",
        st === "asking" && "shadow-[inset_0_0_0_2px_var(--warn)] motion-safe:animate-ask",
        drop && "outline-2 -outline-offset-2 outline-(--accent)",
        noPointer && "pointer-events-none",
      )}
      style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("text/kz-term")) return;
        e.preventDefault();
        setDrop(true);
      }}
      onDragLeave={() => setDrop(false)}
      onDrop={onDrop}
    >
      <header
        draggable
        title={`${c.kind === "run" ? c.id : c.text} · ${c.where}${index < 9 ? ` · Alt+${index + 1}` : ""}`}
        className={cn("flex min-h-[26px] cursor-grab select-none items-center gap-2 pr-1 pl-2.5", phone && "hidden")}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/kz-term", k);
          e.dataTransfer.effectAllowed = "move";
        }}
        // A phone shows one tile anyway: a double-tap there would only leave desktop maximised.
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("button") || phone) return;
          terminalLayout.toggleMax(k);
          focusTerminal(k);
        }}
      >
        <span role="img" title={st} aria-label={st} className={cn("size-2 shrink-0 rounded-full", DOT[st])} />
        <b className="min-w-0 truncate text-[11px] font-normal text-muted-foreground">{labelOf(c)}</b>
        {ended && (
          <span className="shrink-0 rounded-full px-1.5 text-[11px] text-muted-foreground ring-1 ring-border ring-inset">
            ended
          </span>
        )}
        <span className="flex-1" />
        {ended && c.kind === "run" && (
          <Button
            size="sm"
            title="Continue this run's agent"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void terminalActions.resume(c).then((ok) => !ok && setBusy(false));
            }}
          >
            Resume
          </Button>
        )}
        {c.kind !== "shell" && (
          <IconButton icon="open" label="Open card" className={btn} onClick={() => host.openCard(c)} />
        )}
        <IconButton
          icon={max ? "min" : "max"}
          label={`${maxLabel} (Ctrl+Shift+M)`}
          className={btn}
          onClick={() => (terminalLayout.toggleMax(k), focusTerminal(k))}
        />
        {!ended && <IconButton icon="dash" label="Hide" className={btn} onClick={hide} />}
        <IconButton
          icon="close"
          label={ended ? "Close" : "Exit session"}
          className={btn}
          onClick={ended ? hide : exit}
        />
      </header>
      <TerminalPane
        sessionKey={k}
        label="Agent terminal"
        onEnd={() => terminalActions.reload()}
        className={cn("[&_.xterm]:h-full [&_.xterm]:p-1 [&_.xterm-viewport]:bg-transparent!", ended && "opacity-60")}
      />
    </section>
  );
}
