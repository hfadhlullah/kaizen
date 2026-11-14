// The Icebox's data: GET /sources, refreshed when the board says something changed (the server's event stream, counted in
// the server store), when its own state moved (a project switch) and when the "Showing" picker changes (`kz-shown`). One request at a time (a second asks for one more round), a stale answer is dropped. Every redraw
// is React's, so an open menu or a press in progress is never disturbed by a refresh.
import { useEffect } from "react";
import { getSources, host } from "@lib/core";
import { getRoute } from "@lib/router";
import { onServer, onState } from "@lib/server";
import { setIce } from "./icebox-store.ts";

let sequence = 0,
  loading = false,
  again = false;
export async function refreshIce() {
  if (getRoute().page !== "icebox") return;
  if (loading) {
    again = true;
    return;
  }
  loading = true;
  do {
    again = false;
    const gen = ++sequence,
      data = await getSources(host.scopeDir());
    if (gen !== sequence || getRoute().page !== "icebox") continue;
    setIce({ data, loaded: true });
  } while (again);
  loading = false;
}
// Mounted while the Icebox shows.
export function useIceData() {
  useEffect(() => {
    const tick = () => void refreshIce();
    tick();
    addEventListener("kz-shown", tick);
    const offs = [onState(tick), onServer((s) => s.changed, tick)];
    return () => {
      removeEventListener("kz-shown", tick);
      offs.forEach((f) => f());
      sequence++; // an answer still on its way is dropped
    };
  }, []);
}
