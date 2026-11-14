// The Home workspace's "+" menu: the agents that can start in the Home folder, and what starting one does. board/home-ws.ts
// owns the window and its terminals and fills this in; components/home-ws-add.tsx draws the menu.
import { create } from "zustand";

export type HomeWsMenu = {
  agents: { cmd: string; name: string }[];
  dflt: string;
  open: () => Promise<void>; // read the agents (once) when the menu opens
  start: (cmd?: string) => void; // an agent, or the shell when no command
};
export const useHomeWsMenu = create<HomeWsMenu>()(() => ({ agents: [], dflt: "", open: async () => {}, start: () => {} }));
export const setHomeWsMenu = useHomeWsMenu.setState;
// Only these have a mark of their own in the sprite.
export const MARKS = ["claude", "codex", "gemini"];
export const markOf = (cmd: string) => (MARKS.includes(cmd) ? cmd : "ai");
