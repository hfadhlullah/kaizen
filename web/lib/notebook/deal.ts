// Laying down a page: the note being left is copied onto a sheet under the paper side, and the next note slides a short way
// in over it from the right, fading up, like a fresh sheet dealt onto a stack, while the one beneath eases left into its
// shadow. The sidebar sits above both, so nothing moves across it. The copy is pixels only: never focused, never read.
// Transform and opacity only, so it stays smooth. Every open does it, the first one too. Nothing moves under reduced motion.
// `lift()` is called before the page changes (it copies what is on screen), `turn()` once the new note is drawn.
const DEAL = { duration: 260, easing: "cubic-bezier(.22,.61,.36,1)" };
let sheet: HTMLElement | null = null;

export function lift() {
  sheet?.remove();
  sheet = null;
  const main = document.querySelector<HTMLElement>(".main");
  const m = document.documentElement.dataset.motion;
  if (!main || (m ? m === "reduce" : matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
  const r = main.getBoundingClientRect(),
    top = main.scrollTop;
  const s = main.cloneNode(true) as HTMLElement;
  s.classList.add("sheet");
  s.setAttribute("aria-hidden", "true");
  s.inert = true;
  Object.assign(s.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  s.append(Object.assign(document.createElement("i"), { className: "shade" }));
  // After the real page in document order, so every id still finds the real one first.
  document.body.append(s);
  s.scrollTop = top;
  sheet = s;
}

export function turn() {
  const s = sheet;
  sheet = null;
  const main = document.querySelector<HTMLElement>(".main");
  if (!s || !main) return s?.remove();
  main.classList.add("dealt");
  const done = () => {
    main.classList.remove("dealt");
    s.remove();
  };
  main
    .animate(
      [
        { transform: "translateX(56px)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      DEAL,
    )
    .finished.then(done, done);
  // The old page is gone before the new one is fully up, so the two never read as one.
  s.animate(
    [
      { transform: "none", opacity: 1 },
      { transform: "translateX(-24px)", opacity: 0, offset: 0.6 },
      { transform: "translateX(-24px)", opacity: 0 },
    ],
    { ...DEAL, fill: "forwards" },
  );
  s.querySelector<HTMLElement>(".shade")!.animate([{ opacity: 0 }, { opacity: 1 }], { ...DEAL, fill: "forwards" });
}
