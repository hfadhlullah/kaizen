// The Notebook page carries no React. Its popups (Search, Add a project, New workspace, the worktree menu) are the board's
// kit components, shipped as one more bundle (web/dist/notebook-kit.js, entry kit.ts) that this loader fetches the first
// time one is asked for, with the kit's stylesheet. The page itself gains only these few lines.
import type { Kit } from "./kit.ts";

declare global {
  interface Window {
    kzKit?: Kit;
  }
}
// A page marks itself `<html data-kit>` when its stylesheet is layered so the kit's classes can win (notes.html). A page
// without it (Video) keeps the old way: send the person to the board.
export const kitHere = () => document.documentElement.hasAttribute("data-kit");
export const kitLive = (): Kit | null => window.kzKit ?? null;
let loading: Promise<Kit> | null = null;
const add = (el: HTMLLinkElement | HTMLScriptElement) =>
  new Promise<void>((ok, no) => {
    el.onload = () => ok();
    el.onerror = () => no(new Error("could not load " + (el instanceof HTMLLinkElement ? el.href : el.src)));
    document.head.append(el);
  });
export function loadKit(): Promise<Kit> {
  if (!kitHere()) return Promise.reject(new Error("this page has no kit"));
  return (loading ??= (async () => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/ui.css";
    const js = document.createElement("script");
    js.src = "/notebook-kit.js";
    await Promise.all([add(css), add(js)]);
    if (!window.kzKit) throw new Error("the kit did not start");
    return window.kzKit;
  })().catch((e) => {
    loading = null; // a failed load can be tried again
    throw e;
  }));
}
