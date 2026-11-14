import { useMemo } from "react";
import type { RailData } from "./types.ts";
import { useServer } from "./server-store.ts";
import { liveTerminals } from "./attention.ts";

// What the side menu's Projects list and the phone's Home and Runs pages draw: every project's cards, projects and agents,
// and the tasks that need you.
const empty: RailData = { cards: [], projects: [], agents: [], tasks: null };
export const useRailData = (): RailData => {
  const every = useServer((s) => s.every),
    tasks = useServer((s) => s.tasks);
  return useMemo(() => (every ? { ...every, tasks } : { ...empty, tasks }), [every, tasks]);
};
export const railDataNow = (): RailData => {
  const { every, tasks } = useServer.getState();
  return every ? { ...every, tasks } : { ...empty, tasks };
};
// The footer's live terminals: the agent sessions on every project plus the shells.
export const useLiveTerminals = () => useServer((s) => liveTerminals(s.every?.cards ?? [], s.shells));
