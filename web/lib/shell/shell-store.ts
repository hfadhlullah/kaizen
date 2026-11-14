// The page shell as state (Zustand): which board view shows, which pages have been opened (a page is drawn the first time
// it is opened and kept after), the theme and the side menu's folded state, and the Setup row. The view is set by the
// board's router (web/board/views.ts go()); the shell and the pages read it and never touch the page's elements.
import { create } from "zustand";
import { litItem, viewTitle } from "./shell-rules.ts";

export type Setup = { resume: boolean; step: number; total: number };
export const useShell = create<{
  view: string;
  lit: string; // the side menu item marked as the current page
  title: string; // the header's title
  mark: boolean; // the header shows the wordmark instead of the title (a phone's Home)
  seen: string[];
  dark: boolean;
  min: boolean; // the side menu shows icons only
  setup: Setup | null;
}>()(() => ({
  view: "board",
  lit: "board",
  title: "Board",
  mark: false,
  seen: [],
  dark: false,
  min: false,
  setup: null,
}));
export const getShell = useShell.getState;
export const setShell = useShell.setState;

export function setView(view: string, phone: boolean) {
  setShell({ view, lit: litItem(view, phone), title: viewTitle(view, phone), mark: view === "home" && phone });
}
// A page that is drawn once it has been opened: "tasks", "task", "icebox", "home".
export const see = (page: string) => {
  if (!getShell().seen.includes(page)) setShell((s) => ({ seen: [...s.seen, page] }));
};
// The Setup row follows what onboarding has saved: shown while setup is skipped or unfinished.
export const setSetupRow = (o: Partial<Setup> | null) =>
  setShell({ setup: o && o.resume ? { resume: true, step: o.step ?? 0, total: o.total ?? 4 } : null });
