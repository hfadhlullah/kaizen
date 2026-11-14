// The Source control tab's React state (Zustand). The old panel code (lib/git/git-panel.ts via git.ts) publishes `snap`
// on every redraw of the tab. What the user typed and which inline confirm is open live here per run, so a redraw of
// the panel (which replaces the element the tab stands in) loses nothing.
import { create } from "zustand";
import { cardKey, type Card } from "@lib/core";
import type { BranchDoc, GitDoc } from "./git.ts";

export type GitAsk = "pr" | "draft" | "merge" | "remove";
export type GitUi = { msg?: string; title?: string; body?: string; ask?: GitAsk; shut: Record<string, boolean> };
export type GitSnap = {
  card: Card;
  git: GitDoc;
  branch: BranchDoc | null;
  msg: string; // the commit message the run's report suggests
  title: string; // and the pull request title
};
// A question the tab put to the user and waits on: Discard or Cancel, or the preflight's go-ahead. `ok` answers it.
export type GitConfirm =
  | { kind: "discard"; run: string | null; path: string; untracked: boolean; many: number; ok: (yes: boolean) => void }
  | {
      kind: "preflight";
      run: string | null;
      pf: { branch?: string; base: string; issues: { what: string; files?: string[] }[]; notes: string[] };
      ok: (yes: boolean) => void;
    };
export type GitState = {
  snap: GitSnap | null;
  ui: Record<string, GitUi>;
  busy: string | null; // the step or file action running ("commit", "spark", "stage:src/a.ts")...
  busyRun: string | null; // ...for this run (read it through `busyOf`: another run's panel is not busy)
  confirm: GitConfirm | null;
};
export const useGit = create<GitState>()(() => ({ snap: null, ui: {}, busy: null, busyRun: null, confirm: null }));
export const runOf = (s: GitState) => (s.snap ? cardKey(s.snap.card) : null);
export const busyOf = (s: GitState) => (s.busy && s.busyRun === runOf(s) ? s.busy : null);
export const getGit = useGit.getState;
export const setGit = useGit.setState;
// One shared empty value: a selector that returned a new object each time would never settle.
const NONE: GitUi = { shut: {} };
export const gitUi = (k: string): GitUi => getGit().ui[k] ?? NONE;
export const patchUi = (k: string, p: Partial<GitUi>) =>
  setGit((s) => ({ ui: { ...s.ui, [k]: { ...(s.ui[k] ?? NONE), ...p } } }));
export const resetUi = (k: string) =>
  setGit((s) => {
    const { [k]: _, ...ui } = s.ui;
    return { ui };
  });
