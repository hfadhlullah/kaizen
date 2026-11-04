// What the dungeon and the town scenes share: the WebGL renderer, page-token colours that follow
// the theme, tracked geometry and materials, size and theme watching, and clean-up. One three.js
// copy serves both scenes (web/scenes.ts is the single entry).
import { BoxGeometry, Color, ConeGeometry, MeshLambertMaterial, SphereGeometry, WebGLRenderer, type BufferGeometry, type Material } from "three";

export type Kit = {
  renderer: WebGLRenderer;
  css(name: string, fallback: string): Color;
  mat(token: string, fallback: string, mix?: [string, number]): MeshLambertMaterial;
  box(w: number, h: number, d: number): BoxGeometry;
  cone(r: number, h: number, sides?: number): ConeGeometry;
  ball(r: number): SphereGeometry;
  recolor(): void;
  // Calls onSize(width) when `stage` is resized and onChange() after a theme flip.
  watch(stage: HTMLElement, onSize: (width: number) => void, onChange: () => void): void;
  destroy(): void;
};

// null when the browser gives no WebGL context.
export function makeKit(host: HTMLElement, stage: HTMLElement, label: string): Kit | null {
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ antialias: true, alpha: true }); } catch { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", label);
  stage.append(renderer.domElement);

  const css = (name: string, fallback: string) => { try { return new Color(getComputedStyle(host).getPropertyValue(name).trim() || fallback); } catch { return new Color(fallback); } };
  const tracked: { mat: MeshLambertMaterial; token: string; fallback: string; mix?: [string, number] }[] = [];
  const geos: BufferGeometry[] = [], mats: Material[] = [];
  const keep = <T extends BufferGeometry>(g: T): T => { geos.push(g); return g; };
  const recolor = () => {
    for (const t of tracked) {
      const c = css(t.token, t.fallback);
      if (t.mix) c.lerp(t.mix[0].startsWith("#") ? new Color(t.mix[0]) : css(t.mix[0], "#000000"), t.mix[1]);
      t.mat.color.copy(c);
    }
  };
  let ro: ResizeObserver | null = null, mo: MutationObserver | null = null, mq: MediaQueryList | null = null, flip: (() => void) | null = null;
  return {
    renderer, css, recolor,
    mat(token, fallback, mix) { const m = new MeshLambertMaterial(); tracked.push({ mat: m, token, fallback, mix }); mats.push(m); return m; },
    box: (w, h, d) => keep(new BoxGeometry(w, h, d)),
    cone: (r, h, sides = 5) => keep(new ConeGeometry(r, h, sides)),
    ball: (r) => keep(new SphereGeometry(r, 14, 10)),
    watch(st, onSize, onChange) {
      flip = () => { recolor(); onChange(); };
      ro = new ResizeObserver(() => onSize(st.clientWidth)); ro.observe(st); onSize(st.clientWidth);
      mo = new MutationObserver(flip); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      mq = matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener("change", flip);
    },
    destroy() {
      ro?.disconnect(); mo?.disconnect(); if (mq && flip) mq.removeEventListener("change", flip);
      geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose());
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
