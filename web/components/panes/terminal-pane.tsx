import { useEffect, useRef, useState } from "react";
import { cn } from "@lib/core";
import { run, termLoad } from "@lib/run";

// A terminal tab: xterm.js (dist/term.js) mounted once in a div React never draws into. It lives as long as its tab:
// a redraw, a tab switch or a /state tick never reconnects it, and its own ResizeObserver refits it when the pane
// resizes or appears. `onEnd` says when the session ends (the run workspace reloads its tab list by default) and `focus`
// puts the cursor in the terminal once it is up.
export function TerminalPane({
  sessionKey,
  onEnd = () => run.act.termEnded(),
  focus,
  className,
  label,
}: {
  sessionKey: string;
  onEnd?: () => void;
  focus?: boolean;
  className?: string;
  label?: string;
}) {
  const el = useRef<HTMLDivElement>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let off: (() => void) | null = null,
      gone = false;
    termLoad().then(
      (mount) => {
        if (gone) return;
        off = mount(el.current!, sessionKey, onEnd);
        if (focus)
          requestAnimationFrame(() =>
            el.current?.querySelector<HTMLElement>(".xterm-helper-textarea")?.focus({ preventScroll: true }),
          );
      },
      () => setFailed(true),
    );
    return () => {
      gone = true;
      off?.();
    };
  }, [sessionKey]);
  return (
    // kz-keep: the terminal's own bar and search (term.js) and the phone's key bar, which it puts right after the terminal,
    // are styled by the board's CSS, which the kit's preflight would reset. `contents` leaves the layout to the parent.
    <div className="kz-keep contents">
      <div ref={el} aria-label={label} className={cn("term min-h-0 flex-1", className)}>
        {failed && "The terminal could not load."}
      </div>
    </div>
  );
}
