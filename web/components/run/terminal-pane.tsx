import { useEffect, useRef, useState } from "react";
import { run, termLoad } from "@lib/run";

// A terminal tab: xterm.js (dist/term.js) mounted once in a div React never draws into. It lives as long as its tab:
// a redraw, a tab switch or a /state tick never reconnects it, and its own ResizeObserver refits it when the pane
// resizes or appears.
export function TerminalPane({ sessionKey }: { sessionKey: string }) {
  const el = useRef<HTMLDivElement>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let off: (() => void) | null = null,
      gone = false;
    termLoad().then(
      (mount) => {
        if (!gone) off = mount(el.current!, sessionKey, () => run.act.termEnded());
      },
      () => setFailed(true),
    );
    return () => {
      gone = true;
      off?.();
    };
  }, [sessionKey]);
  return (
    // kz-keep: the terminal's own bar and search (term.js) are styled by the board's CSS, which the kit's preflight would reset.
    <div ref={el} className="term kz-keep min-h-0 flex-1">
      {failed && "The terminal could not load."}
    </div>
  );
}
