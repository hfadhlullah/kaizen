// The Icebox's data: GET /sources, refreshed when the board says something changed (`kz-changed`, the server's
// event stream), when its own state moved (`kz-state`: a project switch) and when the "Showing" picker changes
// (`kz-shown`). One request at a time (a second asks for one more round), a stale answer is dropped. Every redraw
// is React's, so an open menu or a press in progress is never disturbed by a refresh.
import { useEffect } from "react";
import { getSources, host, getStore } from "../core/index.ts";
import { setIce } from "./icebox-store.ts";

let sequence = 0,
  loading = false,
  again = false;
export async function refreshIce() {
  if (getStore().view !== "icebox") return;
  if (loading) {
    again = true;
    return;
  }
  loading = true;
  do {
    again = false;
    const gen = ++sequence,
      data = await getSources(host.scopeDir());
    if (gen !== sequence || getStore().view !== "icebox") continue;
    setIce({ data, loaded: true });
  } while (again);
  loading = false;
}
// Mounted while the Icebox shows.
export function useIceData() {
  useEffect(() => {
    const tick = () => void refreshIce();
    tick();
    for (const e of ["kz-state", "kz-changed", "kz-shown"]) addEventListener(e, tick);
    return () => {
      for (const e of ["kz-state", "kz-changed", "kz-shown"]) removeEventListener(e, tick);
      sequence++; // an answer still on its way is dropped
    };
  }, []);
}
