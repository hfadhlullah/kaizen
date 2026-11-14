// A question the page puts to the person before something it cannot take back: the answer is a promise, so actions
// read like `if (!(await ask({...}))) return`. The AskHost component (components/ask-host.tsx) draws the open one.
import { create } from "zustand";

export type Question = { title: string; description?: string; confirmLabel: string; danger?: boolean };
type Open = Question & { answer: (yes: boolean) => void };
export const useAsk = create<{ open: Open | null }>()(() => ({ open: null }));
export function ask(q: Question): Promise<boolean> {
  return new Promise((resolve) => {
    // A new question while one is open answers the old one no.
    useAsk.getState().open?.answer(false);
    useAsk.setState({ open: { ...q, answer: resolve } });
  });
}
export function answer(yes: boolean) {
  const o = useAsk.getState().open;
  useAsk.setState({ open: null });
  o?.answer(yes);
}
