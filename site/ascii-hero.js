// The hero background: kaizen's block wordmark, filling the hero. Hover stutters it:
// bands of the same drawing tear sideways. No other glyphs are ever drawn.
{
  const WORD = [
    "██╗  ██╗ █████╗ ██╗███████╗███████╗███╗   ██╗",
    "██║ ██╔╝██╔══██╗██║╚══███╔╝██╔════╝████╗  ██║",
    "█████╔╝ ███████║██║  ███╔╝ █████╗  ██╔██╗ ██║",
    "██╔═██╗ ██╔══██║██║ ███╔╝  ██╔══╝  ██║╚██╗██║",
    "██║  ██╗██║  ██║██║███████╗███████╗██║ ╚████║",
    "╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═╝  ╚═══╝",
  ];
  const LINES = { "═": "lr", "║": "ud", "╗": "ld", "╔": "rd", "╝": "lu", "╚": "ru" };
  const FRAME_MS = 70, SETTLE_MS = 260;
  const hero = document.querySelector(".hero");
  const canvas = document.querySelector(".ascii");
  const ctx = canvas.getContext("2d");
  const sprite = document.createElement("canvas");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  let cw = 0, py = 0, until = 0, timer = 0;

  function paint() {
    const box = canvas.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    const w = (sprite.width = canvas.width = Math.round(box.width * dpr));
    const h = (sprite.height = canvas.height = Math.round(box.height * dpr));
    const s = sprite.getContext("2d");
    cw = w / WORD[0].length;
    const ch = h / WORD.length / 2;
    const t = Math.max(1, cw / 8);
    s.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--ghost");
    WORD.forEach((row, r) =>
      [...row].forEach((c, i) => {
        const x = i * cw, y = r * ch * 2;
        if (c === "█") return s.fillRect(x, y, cw + 1, ch * 2 + 1);
        const mx = x + cw / 2, my = y + ch;
        for (const d of LINES[c] || "") {
          if (d === "l") s.fillRect(x, my, cw / 2 + t, t);
          if (d === "r") s.fillRect(mx, my, cw / 2, t);
          if (d === "u") s.fillRect(mx, y, t, ch + t);
          if (d === "d") s.fillRect(mx, my, t, ch);
        }
      }),
    );
    rest();
  }
  function rest() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sprite, 0, 0);
  }
  function stutter() {
    const { width: w, height: h } = canvas;
    if (performance.now() > until) return (timer = 0), rest();
    ctx.clearRect(0, 0, w, h);
    const jump = Math.random() < 0.25 ? cw * (Math.random() < 0.5 ? -1 : 1) : 0;
    for (let y = 0; y < h; ) {
      const band = Math.min(h - y, h * (0.02 + Math.random() * 0.1));
      const near = Math.abs(y - py) < h * 0.3 && Math.random() < 0.6;
      const off = jump + (near ? (Math.random() - 0.5) * cw * 8 : 0);
      ctx.drawImage(sprite, 0, y, w, band, off, y, w, band);
      y += band;
    }
    timer = setTimeout(stutter, FRAME_MS);
  }
  hero.addEventListener("pointermove", (e) => {
    if (still.matches) return;
    if (e.target.closest(".pill")) return (until = 0);
    const box = canvas.getBoundingClientRect();
    py = (e.clientY - box.top) * (devicePixelRatio || 1);
    until = performance.now() + SETTLE_MS;
    if (!timer) stutter();
  });
  addEventListener("resize", paint);
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", paint);
  paint();
}
