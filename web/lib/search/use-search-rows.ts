// The palette's rows as a hook: the side menu's data (the server store) and the chats, read when the palette opens. Nothing
// refills a store by hand: a change of the data is a new render, and closing the palette aborts a read in flight.
import { useEffect, useMemo, useState } from "react";
import { useRailData } from "@lib/server";
import { buildRows } from "./search-rows.ts";
import type { Item } from "./search-match.ts";

let last: any[] = []; // the chats the last open read: shown at once on the next open while the new read comes in
export function useSearchRows(open: boolean): Item[] {
  const data = useRailData(),
    [chats, setChats] = useState(last);
  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    fetch("/chats", { signal: ac.signal })
      .then((r) => r.json())
      .then((d) => setChats((last = d.chats ?? [])))
      .catch(() => {});
    return () => ac.abort();
  }, [open]);
  return useMemo(() => (open ? buildRows(data, chats) : []), [open, data, chats]);
}
