// Motion: the Settings choice (data-motion on <html>), else the system's reduced-motion.
export const motion = () => {
  const m = document.documentElement.dataset.motion;
  return m ? m === "full" : !matchMedia("(prefers-reduced-motion: reduce)").matches;
};
// fn as a view transition where the browser has them and motion is on; resolves once the DOM is updated.
export const vt = (fn: () => void): Promise<void> =>
  motion() && document.startViewTransition
    ? document.startViewTransition(fn).updateCallbackDone
    : (fn(), Promise.resolve());
