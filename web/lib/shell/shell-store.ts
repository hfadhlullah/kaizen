// The page shell as state (Zustand): the theme and the side menu's folded state, and the Setup row. Which view shows is the
// router's (lib/router); the shell and the pages read it and never touch the page's elements.
import { create } from "zustand";
export type Setup = { resume: boolean; step: number; total: number };
export const useShell = create<{
  dark: boolean;
  min: boolean; // the side menu shows icons only
  setup: Setup | null;
  look: number; // bumped when the theme or colour changes (what shows the choice redraws)
}>()(() => ({
  dark: false,
  min: false,
  setup: null,
  look: 0,
}));
export const getShell = useShell.getState;
export const setShell = useShell.setState;

// The Setup row follows what onboarding has saved: shown while setup is skipped or unfinished.
export const setSetupRow = (o: Partial<Setup> | null) =>
  setShell({ setup: o && o.resume ? { resume: true, step: o.step ?? 0, total: o.total ?? 4 } : null });
