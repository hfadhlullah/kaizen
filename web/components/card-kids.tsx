import { statusIcon, wordOf, type Card } from "../lib/board.ts";
import { getBoard, setBoard, useBoard } from "../lib/board-store.ts";
import { brief } from "../lib/brief.ts";
import { host } from "../lib/host.ts";
import { StatusMark } from "./status-mark.tsx";

// The cards a run filed, folded into its card: "N children · M done", an orange dot when one waits on you, and a
// row per child that opens that child's own panel.
export function CardKids({ k, kids }: { k: string; kids: Card[] }) {
  const on = useBoard((s) => s.kidsOpen.includes(k)),
    nDone = kids.filter((x) => x.status === "done").length,
    wait = kids.some((x) => x.status === "waiting");
  const toggle = () => {
    const open = getBoard().kidsOpen;
    setBoard({ kidsOpen: open.includes(k) ? open.filter((x) => x !== k) : [...open, k] });
  };
  return (
    <div className="mt-1.5 border-t border-[color-mix(in_srgb,var(--line)_70%,transparent)] pt-1.5">
      <button
        type="button"
        aria-expanded={on}
        onClick={(e) => (e.stopPropagation(), toggle())}
        className="flex w-full cursor-pointer items-center gap-1.5 text-sm text-muted-foreground"
      >
        {on ? "▾" : "▸"} {kids.length} {kids.length === 1 ? "child" : "children"}
        {nDone ? ` · ${nDone} done` : ""}
        {wait && <span title="A child is waiting on you" className="ml-auto size-[7px] rounded-full bg-warning" />}
      </button>
      {on && (
        <ul className="mt-1 flex flex-col gap-px">
          {kids.map((x, i) => {
            const go = (e: React.SyntheticEvent) => (e.stopPropagation(), host.openCard(kids[i]));
            return (
              <li
                key={i}
                tabIndex={0}
                role="button"
                title="Open"
                onClick={go}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go(e))}
                className="grid cursor-pointer grid-cols-[16px_auto_1fr] items-start gap-2 rounded-sm px-1 py-[3px] text-sm hover:bg-muted"
              >
                <StatusMark name={statusIcon(x)} />
                <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">{wordOf(x.status)}</span>
                <span className="leading-[1.35] [overflow-wrap:anywhere]" title={x.title || x.text || x.id}>
                  {x.kind === "idea" ? brief(x.text ?? "").head : (x.text || x.id || "").replace(/-/g, " ")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
