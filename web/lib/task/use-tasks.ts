// The Tasks list: fetch, refresh on the board's state ticks, one request at a time (a second asks for one more
// round, a stale answer is dropped). Every redraw is React's, so an open filter or a press in progress is never
// disturbed by a refresh.
import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { getTasks, host, setStore, useStore } from "@lib/core";
import { getRoute } from "@lib/router";
import { onState, setTasks } from "@lib/server";

let sequence = 0,
  loading = false,
  again = false;
export async function refreshTasks() {
  if (getRoute().page !== "tasks") return;
  if (loading) {
    again = true;
    return;
  }
  loading = true;
  do {
    again = false;
    const gen = ++sequence;
    try {
      const items = await getTasks();
      if (gen !== sequence || getRoute().page !== "tasks") continue;
      setStore({ tasks: items, tasksLoaded: true, tasksError: "" });
      setTasks(items);
      dispatchEvent(new CustomEvent("kz-task-list", { detail: items }));
    } catch (e) {
      if (getRoute().page === "tasks")
        setStore({ tasksError: e instanceof Error ? e.message : "Tasks could not be loaded" });
    }
  } while (again);
  loading = false;
}
// Mounted while the Tasks page shows.
export function useTasks() {
  useEffect(() => {
    const tick = () => {
      setStore({ scope: host.scopeDir() });
      void refreshTasks();
    };
    tick();
    const off = onState(tick);
    return () => {
      off();
      sequence++; // an answer still on its way is dropped
    };
  }, []);
  return useStore(useShallow((s) => ({ tasks: s.tasks, loaded: s.tasksLoaded, error: s.tasksError, scope: s.scope })));
}
