// The dungeon scene: a flat side view drawn with three.js from primitives (placeholders until
// the Blender art of phases 4 to 6). It draws what web/dungeon-script.ts says and nothing else.
// Loaded on demand by the Game page inside /scenes.js (web/scenes.ts), which sets window.KzDungeon;
// bundled by `bun run build:web`.
import { AmbientLight, Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, OrthographicCamera, Scene } from "three";
import { cullInstances, makeKit } from "./scene-kit.ts";
import { dungeonScript, liveFrame, replay, sceneOf, type DungeonIn, type Frame, type Script } from "./dungeon-script.ts";

export type Mounted = DungeonIn & { id: string; title: string; waves: number };
// update() answers false when the run grew a stage or a finding: the caller destroys and mounts again.
export type Handle = { update(d: Mounted): boolean; replay(): void; pause(on: boolean): boolean; destroy(): void };

const VIEW_H = 7, CAM_LEAD = 2.6;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const n = (x: number) => x.toLocaleString("en-US");

// `art` lists the Blender scenes that are downloaded ("dungeon", "forest"); without them the placeholders show.
export function mount(host: HTMLElement, first: Mounted, startPaused = false, art: string[] = []): Handle | null {
  let d = first, script: Script = dungeonScript(d);
  let paused = startPaused || matchMedia("(prefers-reduced-motion: reduce)").matches, t = 0, last = performance.now(), raf = 0, dead = false;
  let minionT = 0;
  let heroX = d.outcome === "live" ? liveFrame(d).x : 0, shownDefeated = -1, swing = 0; // a live hero starts where the run is, not at the door

  host.innerHTML = `<div class="dg-hud" aria-live="polite"></div><div class="dg-stage"></div><div class="dg-loot" hidden></div>`;
  const hud = host.querySelector<HTMLElement>(".dg-hud")!, stage = host.querySelector<HTMLElement>(".dg-stage")!, loot = host.querySelector<HTMLElement>(".dg-loot")!;
  const kit = makeKit(host, stage, "The dungeon: your hero walking left to right through the stages");
  if (!kit) { host.innerHTML = ""; return null; }
  const { renderer, mat, box, cone, ball } = kit;

  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 0.6));
  const sun = new DirectionalLight(0xffffff, 0.5); sun.position.set(-3, 6, 8); scene.add(sun);
  const cam = new OrthographicCamera(-5, 5, VIEW_H / 2, -VIEW_H / 2, 0.1, 50);
  cam.position.set(0, 2.6, 12);

  const mGround = mat("--line", "#7a5a2c"), mFar = mat("--panel-2", "#eadcb8", ["--line", 0.25]), mGold = mat("--gold-fill", "#d9a62e");
  const mHero = mat("--ink", "#2c1d0e", ["--gold", 0.15]), mSkin = mat("--panel", "#f4ead2", ["--gold-fill", 0.35]), mCape = mat("--gold", "#7a5100");
  const mMon = mat("--danger", "#8f2323"), mBoss = mat("--danger", "#8f2323", ["#1a0505", 0.45]), mDown = mat("--dim", "#5e4729");

  // The track: ground, far pillars (move at half speed), a gate at the end of each stage.
  const ground = new Mesh(box(script.width + 30, 2, 3), mGround); ground.position.set(script.width / 2, -1, 0); scene.add(ground);
  const far = new Group(); scene.add(far);
  for (let x = -12; x < script.width + 40; x += 3.4) { const p = new Mesh(box(0.7, 3 + ((x * 7) % 3 + 3) % 3 * 0.8, 0.5), mFar); p.position.set(x, 1.6, -3); far.add(p); }
  const gates = new Group(); scene.add(gates);
  script.segs.forEach((s) => {
    const g = new Group(), l = new Mesh(box(0.35, 3.2, 0.5), mGold), r = new Mesh(box(0.35, 3.2, 0.5), mGold), top = new Mesh(box(1.9, 0.35, 0.5), mGold);
    l.position.set(-0.78, 1.6, 0); r.position.set(0.78, 1.6, 0); top.position.set(0, 3.25, 0); g.add(l, r, top); g.position.set(s.gate, 0, -0.4); gates.add(g);
  });

  const hero = new Group(), body = new Mesh(box(0.7, 1.0, 0.5), mHero), head = new Mesh(ball(0.34), mSkin), cape = new Mesh(box(0.14, 0.9, 0.6), mCape), sword = new Group();
  body.position.y = 0.9; head.position.y = 1.72; cape.position.set(-0.4, 0.95, 0);
  const blade = new Mesh(box(0.1, 0.9, 0.08), mGold); blade.position.y = 0.45; sword.add(blade); sword.position.set(0.42, 1.0, 0.3);
  hero.add(body, head, cape, sword); scene.add(hero);

  const minion = new Group(); { const b = new Mesh(cone(0.3, 0.7), mDown); b.position.y = 0.35; minion.add(b); } minion.visible = false; scene.add(minion);
  const foes: { g: Group; boss: boolean; at: number; life: number }[] = [];
  script.monsters.forEach((m) => {
    const g = new Group(), k = m.boss ? 2.1 : 1, b = new Mesh(cone(0.55 * k, 1.5 * k), m.boss ? mBoss : mMon);
    b.position.y = 0.75 * k; g.add(b);
    if (m.boss) for (const sx of [-0.55, 0.55]) { const h = new Mesh(cone(0.18, 0.7), mGold); h.position.set(sx * 0.4, 2.85, 0); h.rotation.z = -sx * 0.7; g.add(h); }
    g.position.set(m.x, 0, 0); scene.add(g); foes.push({ g, boss: m.boss, at: m.x, life: 1 });
  });
  kit.recolor();

  // The downloaded Blender scene replaces the placeholder ground and pillars once it has loaded; the hero, the
  // monsters and the gates stay. Dungeon: a 20 m segment repeated along the track. Forest: a 90 m trail, with
  // the trees that stand between the camera and the hero left out.
  const want = sceneOf(first.id);
  if (art.includes(want)) void kit.glb(want).then((root) => {
    if (!root || dead) return;
    const forest = want === "forest", len = forest ? 90 : 20, from = forest ? -45 : 0;
    if (forest) cullInstances(root, (p) => p.z < -2.5 || p.z > 60);
    const art3 = new Group();
    for (let x = from - len; x < script.width + 70; x += len) { const t = root.clone(true); t.position.x = x - from; art3.add(t); }
    scene.add(art3); ground.visible = false; far.visible = false;
    scene.background = new Color(forest ? "#4c5a60" : "#17120e");
    if (forest) scene.fog = new Fog("#4c5a60", 18, 70);
    scene.add(new HemisphereLight(0xcfd8e0, 0x4a3a2a, forest ? 0.9 : 0.5));
    kick();
  });

  // The loop runs while the scene moves; paused, it draws once per change and stops.
  const kick = () => { if (!raf && !dead) { last = performance.now(); raf = requestAnimationFrame(draw); } };
  const VIEW_W = (w: number, h: number) => (VIEW_H * (w / h)) / 2;
  kit.watch(stage, (cw) => {
    const w = Math.max(280, cw), h = Math.round(Math.max(200, Math.min(380, w * 0.42)));
    renderer.setSize(w, h, false); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = h + "px";
    const half = VIEW_W(w, h); cam.left = -half; cam.right = half; cam.updateProjectionMatrix(); kick();
  }, () => kick());

  const live = () => d.outcome === "live";
  const frameAt = (): Frame => (live() ? liveFrame(d) : replay(d, t));

  function chips(f: Frame) {
    const per = script.segs.map((s, i) => {
      const from = script.monsters.findIndex((m) => m.stage === i), down = from < 0 ? 0 : Math.max(0, Math.min(s.monsters, f.defeated - from));
      const here = script.monsters[Math.min(f.defeated, script.total - 1)]?.stage ?? 0;
      const cls = i < here || (down >= s.monsters && s.monsters > 0) ? "done" : i === here ? "now" : "";
      return `<span class="dg-chip ${cls}">${esc(s.name)} <b>${down}/${s.monsters}</b></span>`;
    });
    hud.innerHTML = per.join("");
  }
  function showLoot(f: Frame) {
    const end = !live() && f.done;
    loot.hidden = !end && !live();
    if (live()) loot.innerHTML = `<b>In the dungeon now</b> · ${n(f.defeated)} of ${n(script.total)} monsters down · <b>+${n(d.pending)} XP</b> at the end`;
    else if (end) loot.innerHTML = d.outcome === "cleared"
      ? `<b>Dungeon cleared</b> · ${n(script.total)} monsters${d.waves ? `, ${d.waves} wave${d.waves > 1 ? "s" : ""}` : ""}${d.boss ? ", boss down" : ""} · <b>+${n(d.xp)} XP</b>`
      : `<b>${d.outcome === "retreat" ? "Retreat" : "Stalled"}</b> · the run stopped here · no XP`;
  }

  function draw(now: number) {
    raf = 0;
    if (dead) return;
    const dt = Math.min(100, now - last); last = now;
    if (!paused) { t += dt; swing += dt; }
    const f = frameAt();
    // A live run's monster falls only when the run finishes that work. While it waits, the hero
    // stands a little back and fights a stream of minions: decoration, never counted anywhere.
    const waiting = live() && f.fighting !== null, tx = waiting ? Math.max(0, f.x - 1.5) : f.x;
    heroX = live() && !paused ? heroX + (tx - heroX) * Math.min(1, dt / 400) : tx;
    hero.position.x = heroX;
    if (waiting && !paused) minionT += dt;
    const cyc = minionT % 1300, mk = paused ? 1 : cyc < 150 ? cyc / 150 : cyc < 950 ? 1 : Math.max(0.01, 1 - (cyc - 950) / 300);
    minion.visible = waiting; minion.scale.setScalar(Math.max(0.01, mk)); minion.rotation.z = !paused && cyc >= 950 ? ((cyc - 950) / 300) * 0.9 : 0;
    minion.position.set(heroX + 1.0, 0, 0);
    const walking = !paused && (live() ? Math.abs(tx - heroX) > 0.05 : !f.done && f.fighting === null);
    hero.position.y = walking ? Math.abs(Math.sin(now / 130)) * 0.12 : 0;
    const fighting = f.fighting !== null && !paused;
    sword.rotation.z = fighting ? -0.4 - Math.abs(Math.sin(swing / 140)) * 1.5 : -0.2;
    foes.forEach((o, i) => {
      const down = i < f.defeated;
      o.life = paused ? (down ? 0 : 1) : o.life + ((down ? 0 : 1) - o.life) * Math.min(1, dt / 160);
      o.g.visible = o.life > 0.02;
      o.g.scale.setScalar(Math.max(0.01, o.life));
      o.g.rotation.z = (1 - o.life) * 0.8;
      o.g.position.y = o.boss ? 0 : 0.06 * Math.sin(now / 300 + i);
    });
    if (shownDefeated !== f.defeated || !hud.firstChild) { shownDefeated = f.defeated; chips(f); }
    showLoot(f);
    const cx = hero.position.x + CAM_LEAD;
    cam.position.x = Math.max(cam.right - 1, cx); // follows the hero to the end of the track; only the start is clamped
    far.position.x = cam.position.x * 0.5;
    renderer.render(scene, cam);
    if (!paused) raf = requestAnimationFrame(draw);
  }
  kick();
  if (!live() && paused) t = 10 ** 8; // paused at the start (reduced motion, or a rebuild while you paused): the end of a finished run, not its first frame

  return {
    update(next) {
      if (JSON.stringify(next.stages) !== JSON.stringify(d.stages) || next.boss !== d.boss) return false;
      const finished = d.outcome === "live" && next.outcome !== "live";
      d = next;
      if (finished) { t = 0; heroX = 0; shownDefeated = -1; } // the run ended: its replay starts from the door
      kick(); return true;
    },
    replay() { t = 0; heroX = 0; shownDefeated = -1; paused = false; kick(); },
    pause(on) { paused = on; if (!on) kick(); return paused; },
    destroy,
  };

  function destroy() {
    dead = true; cancelAnimationFrame(raf); kit!.destroy();
  }
}
