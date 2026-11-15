// The Notebook page carries the React kit in its own bundle (kit.ts, mounted by notebook.ts) and registers it as
// `window.kzKit` before anything asks. Code shared with the board and Video bundles (workspace.ts, search.ts) reaches the
// kit's stores through it instead of importing them, so the Video bundle never carries React.
import type { Kit } from "./kit.ts";

declare global {
  interface Window {
    kzKit?: Kit;
  }
}
// A page marks itself `<html data-kit>` when it carries the kit and its stylesheet is layered so the kit's classes can win
// (notes.html). A page without it (Video) keeps the old way: send the person to the board.
export const kitHere = () => document.documentElement.hasAttribute("data-kit");
export const kitLive = (): Kit | null => window.kzKit ?? null;
export const loadKit = (): Promise<Kit> =>
  window.kzKit ? Promise.resolve(window.kzKit) : Promise.reject(new Error("this page has no kit"));
