// The right-click menu on a worktree row in the side menu: the old code (board/workspace.ts) knows what a row can do and
// hands over the rows and where the pointer was; components/project/ws-menu.tsx draws the menu.
import { create } from "zustand";

export type WsMenuItem = { label: string; run: () => void };
export const useWsMenu = create<{ at: { x: number; y: number; items: WsMenuItem[] } | null }>()(() => ({ at: null }));
export const openWsMenu = (x: number, y: number, items: WsMenuItem[]) => useWsMenu.setState({ at: { x, y, items } });
export const closeWsMenu = () => useWsMenu.setState({ at: null });
