// xterm.js ships as its own script (dist/term.js) and style (term.css), loaded the first time a terminal is shown. It
// sets window.kzTerm(el, key, onEnd): mounts a terminal on /pty in `el` and returns the function that unmounts it.
export type KzTerm = (el: HTMLElement, key: string, onEnd?: () => void) => () => void;
let lib: Promise<KzTerm> | null = null;
export const termLoad = () =>
  (lib ||= new Promise<KzTerm>((ok, no) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "/term.css";
    document.head.append(l);
    const sc = document.createElement("script");
    sc.src = "/term.js";
    sc.onload = () => ok((window as any).kzTerm);
    sc.onerror = () => {
      lib = null;
      no();
    };
    document.head.append(sc);
  }));
