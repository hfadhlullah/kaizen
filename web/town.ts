// The guild town: one building per guild on a grid, drawn with three.js from primitives
// (placeholders until the Blender art of phases 4 to 6). It draws what web/town-script.ts says.
// Inside /scenes.js (web/scenes.ts), which sets window.KzTown; bundled by `bun run build:web`.
import { AmbientLight, Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, type BoxGeometry, type ConeGeometry } from "three";
import { makeKit } from "./scene-kit.ts";
import { GAP, ROW_GAP, townScript, type Building, type TownGuild } from "./town-script.ts";

export type TownHandle = {
  update(guilds: TownGuild[]): void;
  select(id: string | null): void;   // the building that is open (ring under it)
  hover(id: string | null): void;    // the building a dragged skill is over (it lifts a little)
  idAt(clientX: number, clientY: number): string | null; // the guild id under a point on the canvas
  destroy(): void;
};

const FLOOR = 1.15, FOV = 38, ELEV = (42 * Math.PI) / 180;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// `art` lists the Blender scenes that are downloaded; with "town" in it the square, houses and forest surround the guild buildings.
export function mountTown(host: HTMLElement, first: TownGuild[], opts: { onPick(id: string): void; art?: string[] }): TownHandle | null {
  host.innerHTML = `<div class="tw-stage"></div>`;
  const stage = host.querySelector<HTMLElement>(".tw-stage")!;
  const kit = makeKit(host, stage, "The guild town: one building for each guild; a taller building is a guild of higher level");
  if (!kit) { host.innerHTML = ""; return null; }
  const { renderer, mat, box, cone } = kit;
  const animated = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  let guilds = first, width = 640, cols = 5, selected: string | null = null, hovered: string | null = null;
  let raf = 0, dead = false, t = 0, last = performance.now();

  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 0.75));
  const sun = new DirectionalLight(0xffffff, 0.55); sun.position.set(-6, 14, 10); scene.add(sun);
  const cam = new PerspectiveCamera(FOV, 2, 0.1, 400);
  const town = new Group(); scene.add(town);
  // The Blender surroundings sit around the middle of the guild grid; the grid itself stays the page's own.
  const env = new Group(); scene.add(env);
  if (opts.art?.includes("town")) void kit.glb("town").then((root) => {
    if (!root || dead) return;
    env.add(root); scene.background = new Color("#5d6b73"); scene.fog = new Fog("#5d6b73", 60, 150);
    scene.add(new HemisphereLight(0xcfd8e0, 0x4a3a2a, 0.55)); kick();
  });

  const walls = [0.08, 0.16, 0.24, 0.32].map((k) => mat("--panel-2", "#eadcb8", ["--gold-fill", k]));
  const mRoof = mat("--danger", "#8f2323", ["#1a0505", 0.3]), mDoor = mat("--ink", "#2c1d0e"), mGold = mat("--gold-fill", "#d9a62e");
  const mPlot = mat("--line", "#7a5a2c", ["--bg", 0.35]), mLawn = mat("--ok", "#2f6b2d", ["--panel", 0.22]);
  // The same size is the same geometry: a rebuild after a write reuses what it has.
  const boxes = new Map<string, BoxGeometry>(), cones = new Map<string, ConeGeometry>();
  const bx = (w: number, h: number, d: number) => { const k = `${w},${h},${d}`; let g = boxes.get(k); if (!g) boxes.set(k, (g = box(w, h, d))); return g; };
  const cn = (r: number, h: number) => { const k = `${r},${h}`; let g = cones.get(k); if (!g) cones.set(k, (g = cone(r, h, 4))); return g; };
  const put = (g: Group, geo: BoxGeometry | ConeGeometry, m: typeof mRoof, x: number, y: number, z: number) => { const o = new Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };

  type Placed = { b: Building; g: Group; ring: Mesh; label: HTMLElement; top: number };
  let placed: Placed[] = [];
  let lawn: Mesh | null = null;

  function build() {
    town.clear(); stage.querySelectorAll(".tw-label").forEach((e) => e.remove());
    const script = townScript(guilds, cols);
    placed = script.buildings.map((b, i) => {
      const g = new Group(); g.position.set(b.x, 0, b.z); g.userData.id = b.id;
      let top = 0.6;
      if (b.founded) {
        for (let f = 0; f < b.floors; f++) put(g, bx(3.2, FLOOR - 0.05, 3.2), walls[i % walls.length]!, 0, FLOOR / 2 + f * FLOOR, 0);
        top = b.floors * FLOOR;
        const roof = put(g, cn(2.45, 1.6), mRoof, 0, top + 0.8, 0); roof.rotation.y = Math.PI / 4;
        put(g, bx(0.7, 0.9, 0.12), mDoor, 0, 0.45, 1.66);
        [[-2.5, 0], [2.5, 0], [0, -2.5]].slice(0, b.wings).forEach(([x, z]) => {
          put(g, bx(1.8, 1.05, 2), walls[(i + 1) % walls.length]!, x!, 0.52, z!);
          const r = put(g, cn(1.45, 0.9), mRoof, x!, 1.5, z!); r.rotation.y = Math.PI / 4;
        });
        top += 1.6;
      } else {
        put(g, bx(3.6, 0.08, 3.6), mPlot, 0, 0.04, 0);
        for (const [x, z] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) put(g, bx(0.2, 0.6, 0.2), mGold, x!, 0.3, z!);
      }
      const ring = put(g, bx(4.6, 0.05, 4.6), mGold, 0, 0.025, 0); ring.visible = false;
      town.add(g);
      const label = document.createElement("div");
      label.className = "tw-label"; label.setAttribute("aria-hidden", "true");
      label.innerHTML = b.founded ? `<b>${esc(b.name.replace(/^Guild of /, ""))}</b> Lv ${b.level}` : `<b>${esc(b.name.replace(/^Guild of /, ""))}</b> empty plot`;
      stage.append(label);
      return { b, g, ring, label, top: top + 0.6 };
    });
    const spanX = (script.cols - 1) * GAP, spanZ = (script.rows - 1) * ROW_GAP;
    if (lawn) town.remove(lawn);
    lawn = new Mesh(bx(spanX + 14, 0.4, spanZ + 14), mLawn); lawn.position.set(spanX / 2, -0.19, -spanZ / 2); town.add(lawn);
    env.position.set(spanX / 2, 0, -spanZ / 2);
    mark();
  }
  function mark() { for (const p of placed) { p.ring.visible = p.b.id === selected; p.g.scale.setScalar(p.b.id === hovered ? 1.05 : 1); } }

  function fit() {
    const script = townScript(guilds, cols), spanX = (script.cols - 1) * GAP + 6, spanZ = (script.rows - 1) * ROW_GAP + 6;
    const half = Math.tan((FOV * Math.PI) / 360), aspect = cam.aspect;
    const dist = Math.max((spanX / 2) / (half * aspect), (spanZ * 0.55 + 6) / half, 14) * 0.95;
    const target = new Vector3(((script.cols - 1) * GAP) / 2, 2, (-(script.rows - 1) * ROW_GAP) / 2);
    const a = animated ? Math.sin(t / 7000) * 0.12 : 0;
    cam.position.set(target.x + Math.sin(a) * dist * Math.cos(ELEV), target.y + dist * Math.sin(ELEV), target.z + Math.cos(a) * dist * Math.cos(ELEV));
    cam.lookAt(target);
  }

  const pt = new Vector3();
  function draw(now: number) {
    raf = 0;
    if (dead) return;
    t += Math.min(100, now - last); last = now;
    fit();
    cam.updateMatrixWorld();
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    for (const p of placed) {
      pt.set(p.b.x, p.top, p.b.z).project(cam);
      const show = pt.z < 1;
      p.label.style.display = show ? "" : "none";
      p.label.style.transform = `translate(${((pt.x + 1) / 2) * w}px, ${((1 - pt.y) / 2) * h}px) translate(-50%, -100%)`;
    }
    renderer.render(scene, cam);
    if (animated) raf = requestAnimationFrame(draw);
  }
  const kick = () => { if (!raf && !dead) { last = performance.now(); raf = requestAnimationFrame(draw); } };

  kit.watch(stage, (cw) => {
    width = Math.max(280, cw);
    const h = Math.round(Math.max(260, Math.min(460, width * (width < 520 ? 0.95 : 0.5))));
    renderer.setSize(width, h, false); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = h + "px";
    cam.aspect = width / h; cam.updateProjectionMatrix();
    const next = width < 520 ? 3 : 5;
    if (next !== cols || !placed.length) { cols = next; build(); }
    kick();
  }, () => kick());
  kit.recolor();
  build(); kick();

  const ray = new Raycaster(), ndc = new Vector2();
  const idAt = (x: number, y: number) => {
    const r = renderer.domElement.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null; // off the canvas: a ray from there could still hit a building
    ndc.set(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1));
    cam.updateMatrixWorld(); ray.setFromCamera(ndc, cam);
    for (const hit of ray.intersectObjects(town.children, true)) {
      let o: typeof hit.object | null = hit.object;
      while (o && o.userData.id === undefined) o = o.parent;
      if (o) return String(o.userData.id);
    }
    return null;
  };
  renderer.domElement.style.cursor = "pointer";
  renderer.domElement.addEventListener("click", (e) => { const id = idAt(e.clientX, e.clientY); if (id) opts.onPick(id); });

  return {
    update(next) {
      const same = JSON.stringify(next.map((g) => [g.id, g.name, g.founded, g.level, g.skills.filter((s) => s.learned).length])) === JSON.stringify(guilds.map((g) => [g.id, g.name, g.founded, g.level, g.skills.filter((s) => s.learned).length]));
      guilds = next;
      if (!same) { build(); kick(); }
    },
    select(id) { selected = id; mark(); kick(); },
    hover(id) { hovered = id; mark(); kick(); },
    idAt,
    destroy() { dead = true; cancelAnimationFrame(raf); kit.destroy(); stage.querySelectorAll(".tw-label").forEach((e) => e.remove()); },
  };
}
