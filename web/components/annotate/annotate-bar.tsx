import type { ReactNode } from "react";
import type { Annotator } from "@lib/annotate";
import { cn } from "@lib/core";
import { Icon } from "@web/ui";

const MODES: [string, string, string][] = [
  ["element", "a-pick", "Pick an element"],
  ["text", "a-text", "Select text"],
  ["multi", "a-multi", "Pick several elements"],
  ["area", "a-area", "Drag an area"],
];

// One icon button of the pill: a round 32 px target, lit when its tool is on, dimmed when it has nothing to act on.
function Tool({
  icon,
  title,
  on,
  off,
  badge,
  onClick,
}: {
  icon: string;
  title: string;
  on?: boolean;
  off?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={off}
      onClick={onClick}
      className={cn(
        "relative m-0 grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-inherit hover:bg-[#2c2c2e] hover:text-white disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-inherit",
        on && "bg-[#3a3a3c] text-white",
      )}
    >
      <Icon name={icon} className="size-[17px]" />
      {!!badge && (
        <i className="absolute top-px right-0 h-[15px] min-w-[15px] rounded-lg bg-[#f59e0b] px-1 text-center text-[10px] leading-[15px] font-semibold text-[#1c1c1e] not-italic">
          {badge}
        </i>
      )}
    </button>
  );
}
const Sep = (): ReactNode => <span className="mx-1 h-[18px] w-px bg-[#3a3a3c]" />;

// Icon buttons in one dark pill, as in Agentation: modes, then pause, markers, copy, send, clear, notes, settings, close.
export function AnnotateBar({ ann, wide }: { ann: Annotator; wide: boolean }) {
  const s = ann.use((x) => x),
    none = !s.notes.length;
  return (
    <div
      className={cn(
        "absolute bottom-3.5 z-[6] flex max-w-[calc(100%-28px)] flex-wrap items-center justify-center gap-0.5 rounded-[26px] border border-[#3a3a3c] bg-[#1c1c1e] p-1.5 text-[#c7c7cc] shadow-[0_8px_28px_#0007]",
        wide ? "right-[314px] max-sm:right-[254px]" : "right-3.5",
      )}
    >
      {MODES.map(([id, icon, title]) => (
        <Tool key={id} icon={icon} title={title} on={s.on && s.settings.mode === id} onClick={() => ann.mode(id)} />
      ))}
      <Sep />
      <Tool icon="a-pause" title="Freeze animations (P)" on={s.pause} onClick={ann.togglePause} />
      <Tool icon="eye" title="Show or hide markers (H)" on={!s.hide} onClick={ann.toggleHide} />
      <Tool icon="a-copy" title="Copy notes as markdown (C)" off={none} onClick={() => void ann.copy()} />
      <Tool icon="send" title="Type the notes into this run's agent (S)" off={none} onClick={() => void ann.send()} />
      <Tool icon="trash" title="Remove all notes (X)" off={none} onClick={ann.clear} />
      <Sep />
      <Tool icon="note" title="Notes list" on={s.list} badge={s.notes.length} onClick={ann.toggleList} />
      <Tool icon="gear" title="Output detail, colour, behaviour" on={s.setOpen} onClick={ann.toggleSettings} />
      <Tool icon="x" title="Close the annotator (the Annotate button brings it back)" onClick={ann.close} />
    </div>
  );
}
