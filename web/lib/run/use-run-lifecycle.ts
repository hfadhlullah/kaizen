// What runs only while the run view is shown (a hook of the run panes, so it follows the page and is torn down with it):
// the Preview polling every 3 s, the tmux-style keyboard (Ctrl+Space, then a key) and the workspace's reaction to a new
// /state (a run reaching review opens the Browser, a new run takes the panel's pick, the tabs are read again). Off the run
// view none of it runs: no timer, no key listener, no reaction.
import { useEffect } from "react";
import { dialogOpen } from "@lib/core";
import { onState } from "@lib/server";
import { useRoute } from "@lib/router";
import { autoBrowse, pollPreview, showRunView } from "./workspace.ts";
import { followNew } from "./ws-draw.ts";
import { paneKey } from "./ws-actions.ts";
import { getWs, screens, saved } from "./ws-store.ts";
import { focusPane, setRunView } from "./index.ts";

const POLL = 3000;
const keyHint = (on: boolean) => setRunView({ hint: on });
// Capture: xterm must not see these. Ctrl+B would reach an agent or a tmux inside the pane. While the prefix waits for its
// key, a chip says so and lists the keys (components/run/key-hint.tsx).
function paneKeys() {
  let armed: ReturnType<typeof setTimeout> | undefined;
  const on = (e: KeyboardEvent) => {
    if (!getWs().ctx || dialogOpen()) return;
    if (e.ctrlKey && !e.shiftKey && e.code === "Space") {
      e.preventDefault();
      e.stopPropagation();
      focusPane(screens().find((x) => x.id === saved().on)?.focus);
      clearTimeout(armed);
      keyHint(true);
      armed = setTimeout(() => ((armed = undefined), keyHint(false)), 2000);
      return;
    }
    if (!armed || ["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(armed);
    armed = undefined;
    keyHint(false);
    paneKey(e.key);
  };
  addEventListener("keydown", on, true);
  return () => (clearTimeout(armed), keyHint(false), removeEventListener("keydown", on, true));
}
export function useRunLifecycle() {
  const shown = useRoute((s) => s.view === "run");
  useEffect(() => {
    if (!shown) return;
    const offKeys = paneKeys(),
      timer = setInterval(() => void pollPreview(), POLL),
      offState = onState(() => {
        void autoBrowse();
        followNew();
        if (getWs().ctx) void showRunView();
      });
    return () => (offKeys(), clearInterval(timer), offState());
  }, [shown]);
}
