// The shortcut list (pages/board/help.tsx): shown by ? and the side menu's keyboard button, hidden by a click or Escape.
import { create } from "zustand";
export const useHelp = create<{ on: boolean }>()(() => ({ on: false }));
export const setHelp = (on: boolean) => useHelp.setState({ on });
