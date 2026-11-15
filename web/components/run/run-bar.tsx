import { useEffect, useRef } from "react";
import { isPhone } from "@lib/core";
import { setFlip, useRunView } from "@lib/run";
import { IconButton } from "@components/shared";
import { RunTabs } from "./run-tabs.tsx";

// The run workspace's top bar: the tab strip (the shown tab scrolls into view) and the button that folds the run panel
// away or brings it back, with a dot when a run waits on you while it is folded.
export function RunBar() {
  const nav = useRef<HTMLElement>(null),
    on = useRunView((s) => s.on),
    flip = useRunView((s) => s.flip),
    hidden = useRunView((s) => !s.picker),
    dot = useRunView((s) => s.awaiting && s.flip !== isPhone());
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      nav.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" }),
    );
    return () => cancelAnimationFrame(id);
  }, [on]);
  return (
    <div id="rbar">
      <nav id="rtabs" aria-label="Workspace tabs" ref={nav}>
        <div className="kz-ui" style={{ display: "contents" }}>
          <RunTabs />
        </div>
      </nav>
      <IconButton
        size="sm"
        icon="open"
        label="Show or hide the run panel"
        id="rside"
        aria-pressed={flip}
        hidden={hidden}
        data-dot={dot ? "" : undefined}
        onClick={() => setFlip(!flip)}
      />
    </div>
  );
}
