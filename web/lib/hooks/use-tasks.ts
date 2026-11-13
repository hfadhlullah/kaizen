// The Tasks list: fetch, refresh on the board's state ticks, one request at a time (a second asks for one more
// round, a stale answer is dropped). Every redraw is React's, so an open filter or a press in progress is never
// disturbed by a refresh.
import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { getTasks } from "../api.ts";
import { host } from "../host.ts";
import { getStore, setStore, useStore } from "../store.ts";

let sequence = 0,
  loading = false,
  again = false;
export async function refreshTasks() {
  if (getStore().view !== "tasks") return;
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
      if (gen !== sequence || getStore().view !== "tasks") continue;
      setStore({ tasks: items, tasksLoaded: true, tasksError: "" });
      host.setTaskAttention(items);
      dispatchEvent(new CustomEvent("kz-task-list", { detail: items }));
    } catch (e) {
      if (getStore().view === "tasks")
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
    addEventListener("kz-state", tick);
    return () => {
      removeEventListener("kz-state", tick);
      sequence++; // an answer still on its way is dropped
    };
  }, []);
  return useStore(useShallow((s) => ({ tasks: s.tasks, loaded: s.tasksLoaded, error: s.tasksError, scope: s.scope })));
}
