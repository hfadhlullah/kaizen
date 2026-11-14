import { useMemo, useRef } from "react";
import { leaves, rects, useLayout, useRunView } from "@lib/run";
import { Pane } from "./pane.tsx";
import { PaneGutter } from "./pane-gutter.tsx";
import { RunEmpty } from "./run-empty.tsx";

// The workspace centre: every open item as a pane, the shown screen's tree laid out by rectangles, and the gutters
// between its panes. Panes are keyed by workspace and item and kept in the order they first appeared, so React never
// moves one: a terminal stays connected and a frame stays loaded through splits, drags, tab switches and redraws.
export function RunPanes() {
  const wsk = useRunView((s) => s.wsk),
    items = useRunView((s) => s.items),
    empty = useRunView((s) => s.empty),
    ws = useRunView((s) => s.ws),
    lay = useLayout((s) => (wsk ? s.all[wsk] : undefined)),
    cur = lay?.screens.find((sc) => sc.id === lay.on),
    box = useRef<HTMLDivElement>(null),
    order = useRef<{ wsk: string | null; ids: string[] }>({ wsk: null, ids: [] }),
    { panes, guts } = useMemo(() => (cur ? rects(cur.tree) : { panes: {}, guts: [] }), [cur?.tree]);
  if (order.current.wsk !== wsk) order.current = { wsk, ids: [] };
  const ids = items.map((t) => t.id);
  order.current.ids = [
    ...order.current.ids.filter((id) => ids.includes(id)),
    ...ids.filter((id) => !order.current.ids.includes(id)),
  ];
  const split = !!cur && leaves(cur.tree).length > 1;
  return (
    <div ref={box} className="absolute inset-0">
      {wsk &&
        order.current.ids.map((id) => {
          const item = items.find((t) => t.id === id)!;
          return (
            <Pane
              key={wsk + "|" + id}
              item={item}
              rect={panes[id]}
              wsk={wsk}
              ws={ws}
              sid={cur?.id ?? null}
              split={split}
              focus={split && cur?.focus === id}
            />
          );
        })}
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
