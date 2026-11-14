import { MODES, terminalLayout, useTerminals } from "@lib/terminal";
import { Icon, Toggle } from "@web/ui";

// The layout switch at the right of the page header: Grid, Side by side, Stacked.
export function TerminalModes() {
  const mode = useTerminals((s) => s.lay.mode);
  return (
    <>
      {MODES.map(([v, label, icon]) => (
        <Toggle
          key={v}
          pressed={mode === v}
          onPressedChange={() => terminalLayout.mode(v)}
          title={label}
          aria-label={label}
          className="grid size-8 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground"
        >
          <Icon name={icon} className="size-4" />
        </Toggle>
      ))}
    </>
  );
}
