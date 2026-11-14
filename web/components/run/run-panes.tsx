import { useMemo, useRef } from "react";
import { leaves, rects, useLayout, useRunView, type RvPane } from "@lib/run";
import { Pane } from "./pane.tsx";
import { PaneGutter } from "./pane-gutter.tsx";
import { RunEmpty } from "./run-empty.tsx";

// The workspace centre: every open item as a pane, the shown screen's tree laid out by rectangles, and the gutters
// between its panes. Panes are keyed by workspace and item and kept in the order they first appeared, so React never
// moves one: a terminal stays connected and a frame stays loaded through splits, drags, tab switches and redraws. The terminals
// of workspaces visited before stay mounted too (`kept`), hidden, so leaving a workspace or the run view never reconnects them.
export function RunPanes() {
  const wsk = useRunView((s) => s.wsk),
    items = useRunView((s) => s.items),
    kept = useRunView((s) => s.kept),
    empty = useRunView((s) => s.empty),
    ws = useRunView((s) => s.ws),
    lay = useLayout((s) => (wsk ? s.all[wsk] : undefined)),
    cur = lay?.screens.find((sc) => sc.id === lay.on),
    box = useRef<HTMLDivElement>(null),
    order = useRef<Record<string, string[]>>({}),
    wsOrder = useRef<string[]>([]),
    { panes, guts } = useMemo(() => (cur ? rects(cur.tree) : { panes: {}, guts: [] }), [cur?.tree]);
  // Every workspace's panes in one list: the shown one's items, the terminals of the others.
  const groups: [string, RvPane[], { dir: string; ws: string } | null][] = Object.entries(kept)
    .filter(([k]) => k !== wsk)
    .map(([k, v]) => [k, v.items, v.ws]);
  if (wsk) groups.push([wsk, items, ws]);
  // Workspaces keep the order they were first shown in, so returning to one never moves another's terminals in the page.
  for (const [k] of groups) if (!wsOrder.current.includes(k)) wsOrder.current.push(k);
  groups.sort((a, b) => wsOrder.current.indexOf(a[0]) - wsOrder.current.indexOf(b[0]));
  for (const [k, list] of groups) {
    const ids = list.map((t) => t.id),
      was = order.current[k] ?? [];
    order.current[k] = [...was.filter((id) => ids.includes(id)), ...ids.filter((id) => !was.includes(id))];
  }
  const split = !!cur && leaves(cur.tree).length > 1;
  return (
    <div ref={box} className="absolute inset-0">
      {groups.flatMap(([k, list, w]) =>
        order.current[k]!.map((id) => {
          const item = list.find((t) => t.id === id)!,
            here = k === wsk;
          return (
            <Pane
              key={k + "|" + id}
              item={item}
              rect={here ? panes[id] : undefined}
              wsk={k}
              ws={w}
              sid={here ? (cur?.id ?? null) : null}
              split={here && split}
              focus={here && split && cur?.focus === id}
            />
          );
        }),
      )}
      {wsk &&
        cur &&
        guts.map((g) => (
          <PaneGutter
            key={g.path.join(".") + "/" + g.i}
            g={g}
            wsk={wsk}
            sid={cur.id}
            box={() => box.current!.getBoundingClientRect()}
          />
        ))}
      {empty && (
        <div className="absolute inset-0 overflow-auto">
          <RunEmpty />
        </div>
      )}
    </div>
  );
}
