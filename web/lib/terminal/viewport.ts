// iOS keeps the layout viewport tall when the soft keyboard covers it. Fit the app
// to the visual viewport while a terminal/composer owns focus, including raw xterm input.
let users = 0;
let detach = () => {};
export function keyboardViewport(height: number, fullHeight: number, scale: number, focused: boolean) {
  return focused && Math.abs(scale - 1) < 0.05 && fullHeight - height > 100 ? Math.round(height) : null;
}
export function trackTerminalViewport() {
  if (users++ === 0) {
    const vv = window.visualViewport;
    const update = () => {
      const active = document.activeElement;
      const focused = active instanceof HTMLElement && !!active.closest(".term, .termkeys");
      const height = vv && matchMedia("(max-width:640px)").matches ? keyboardViewport(vv.height, window.innerHeight, vv.scale, focused) : null;
      document.body.classList.toggle("term-keyboard", height !== null);
      if (height !== null) document.documentElement.style.setProperty("--term-viewport-height", `${height}px`);
      else document.documentElement.style.removeProperty("--term-viewport-height");
    };
    const focus = () => requestAnimationFrame(update);
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", focus);
    update();
    detach = () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", focus);
      document.body.classList.remove("term-keyboard");
      document.documentElement.style.removeProperty("--term-viewport-height");
    };
  }
  return () => { if (--users === 0) detach(); };
}
