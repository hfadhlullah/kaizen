// What the dungeon and the town scenes share: the WebGL renderer, page-token colours that follow
// the theme, tracked geometry and materials, size and theme watching, and clean-up. One three.js
// copy serves both scenes (web/scenes.ts is the single entry).
import { BoxGeometry, Color, ConeGeometry, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, SphereGeometry, Vector3, WebGLRenderer, type BufferGeometry, type Group, type Material, type Object3D, type Texture } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export type Kit = {
  renderer: WebGLRenderer;
  css(name: string, fallback: string): Color;
  mat(token: string, fallback: string, mix?: [string, number]): MeshLambertMaterial;
  box(w: number, h: number, d: number): BoxGeometry;
  cone(r: number, h: number, sides?: number): ConeGeometry;
  ball(r: number): SphereGeometry;
  recolor(): void;
  // A scene from the downloaded Blender art (GET /game/assets/<name>.glb); null when it cannot be loaded.
  // The kit disposes what it returns when it is destroyed.
  glb(name: string): Promise<Group | null>;
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
  const loaded: Object3D[] = [];
  let gone = false;
  let ro: ResizeObserver | null = null, mo: MutationObserver | null = null, mq: MediaQueryList | null = null, flip: (() => void) | null = null;
  return {
    renderer, css, recolor,
    async glb(name) {
      try {
        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        const g = (await loader.loadAsync(`/game/assets/${name}.glb`)).scene;
        if (gone) { disposeTree(g); return null; }
        loaded.push(g); return g;
      } catch { return null; }
    },
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
      gone = true; loaded.forEach(disposeTree);
      ro?.disconnect(); mo?.disconnect(); if (mq && flip) mq.removeEventListener("change", flip);
      geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose());
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}

function disposeTree(root: Object3D) {
  const mats = new Set<Material>(), texs = new Set<Texture>();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mt of Array.isArray(m.material) ? m.material : [m.material]) {
      mats.add(mt);
      for (const v of Object.values(mt)) if (v && (v as Texture).isTexture) texs.add(v as Texture);
    }
  });
  mats.forEach((m) => m.dispose()); texs.forEach((t) => t.dispose());
}

// Keeps only the instances of every instanced mesh in `root` whose world position passes `keep`, so a scene
// made for a walk-through (trees on both sides of a trail) can be seen from the side (no tree in front of the hero).
export function cullInstances(root: Object3D, keep: (p: Vector3) => boolean) {
  root.updateMatrixWorld(true);
  const m = new Matrix4(), p = new Vector3();
  root.traverse((o) => {
    const im = o as InstancedMesh;
    if (!im.isInstancedMesh) return;
    let n = 0;
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m); p.setFromMatrixPosition(m).applyMatrix4(im.matrixWorld);
      if (keep(p)) { if (n !== i) im.setMatrixAt(n, m); n++; }
    }
    im.count = n; im.instanceMatrix.needsUpdate = true;
  });
}
