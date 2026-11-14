import { Fragment } from "react";
import { cn } from "@lib/core";
import { setHelp, useHelp } from "@lib/shell";

// The shortcut list, shown by ? and the side menu's keyboard button (lib/shell/help-store.ts); a click closes it.
const GLOBAL: [string[], string][] = [
  [["←↓↑→", "hjkl"], "move between cards"],
  [["Enter"], "open"],
  [["←→", "hl"], "tabs, in an open run"],
  [["↑↓", "jk"], "scroll, in an open run"],
  [["n"], "new task"],
  [["e"], "edit"],
  [["x"], "reject / abandon"],
  [["r"], "run"],
  [["a"], "all projects"],
  [["Esc"], "close"],
  [["?"], "this list"],
];
const WORKSPACE: [string[], string][] = [
  [["←↓↑→", "hjkl"], "move between panes"],
  [["1-9"], "go to tab"],
  [["n", "p"], "next, previous tab"],
  [["c"], "new tab menu"],
  [["r"], "split right menu"],
  [["d"], "split down menu"],
  [["x"], "close pane"],
  [["?"], "this list"],
];
const Keys = ({ rows, style }: { rows: [string[], string][]; style?: React.CSSProperties }) => (
  <dl style={style}>
    {rows.map(([keys, what]) => (
      <Fragment key={keys.join()}>
        <dt>
          {keys.map((k) => (
            <kbd key={k}>{k}</kbd>
          ))}
        </dt>
        <dd>{what}</dd>
      </Fragment>
    ))}
  </dl>
);
export function KeyHelp() {
  const on = useHelp((s) => s.on);
  return (
    <div className={cn("help", on && "on")} id="help" onClick={() => setHelp(false)}>
      <div>
        <p>Optional. Everything here is also a button.</p>
        <Keys rows={GLOBAL} />
        <Keys rows={[[["Ctrl", "Shift", "Space"], "search, also from a terminal"]]} style={{ marginTop: 16 }} />
        <h3>In a workspace</h3>
        <p>
          Press <kbd>Ctrl</kbd> <kbd>Space</kbd> to focus the current pane, then one key:
        </p>
        <Keys rows={WORKSPACE} />
      </div>
    </div>
  );
}
