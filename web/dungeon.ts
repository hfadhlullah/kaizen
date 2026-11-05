// The dungeon scene: a flat side view drawn with three.js from primitives (placeholders until
// the Blender art of phases 4 to 6). It draws what web/dungeon-script.ts says and nothing else.
// Loaded on demand by the Game page inside /scenes.js (web/scenes.ts), which sets window.KzDungeon;
// bundled by `bun run build:web`.
import { AmbientLight, CanvasTexture, Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshLambertMaterial, type Object3D, OrthographicCamera, PlaneGeometry, Scene, SRGBColorSpace } from "three";
import { cullInstances, makeKit } from "./scene-kit.ts";
import { loadHero, type Hero } from "./hero.ts";
import { loadFamily, type Actor, type Maker } from "./monsters.ts";
import type { HeroLook } from "./hero-look.ts";
import { dungeonScript, hpOf, liveEstimated, liveFrame, replay, sceneOf, type DungeonIn, type Frame, type Script } from "./dungeon-script.ts";

export type Mounted = DungeonIn & { id: string; title: string; waves: number; guild?: string };
// update() answers false when the run grew a stage or a finding: the caller destroys and mounts again.
export type Handle = { update(d: Mounted): boolean; replay(): void; pause(on: boolean): boolean; destroy(): void };

const VIEW_H = 7, CAM_LEAD = 2.6;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const n = (x: number) => x.toLocaleString("en-US");

// `art` lists the Blender scenes that are downloaded ("dungeon", "forest"); without them the placeholders show.
export function mount(host: HTMLElement, first: Mounted, startPaused = false, art: string[] = [], look: Partial<HeroLook> = {}): Handle | null {
  let d = first, script: Script = dungeonScript(d);
  let paused = startPaused || matchMedia("(prefers-reduced-motion: reduce)").matches, t = 0, last = performance.now(), raf = 0, dead = false;
  let minionT = 0, waitedAt = performance.now();   // waitedAt: when `d.waited` (how long the run has been on its item) was last read
  let heroX = d.outcome === "live" ? liveFrame(d).x : 0, shownDefeated = -1, swing = 0; // a live hero starts where the run is, not at the door

  host.innerHTML = `<div class="dg-hud" aria-live="polite"></div><div class="dg-stage"></div><div class="dg-loot" hidden></div>`;
  const hud = host.querySelector<HTMLElement>(".dg-hud")!, stage = host.querySelector<HTMLElement>(".dg-stage")!, loot = host.querySelector<HTMLElement>(".dg-loot")!;
  const kit = makeKit(host, stage, "The dungeon: your hero walking left to right through the stages");
  if (!kit) { host.innerHTML = ""; return null; }
  const { renderer, mat, box, cone, ball } = kit;

  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 0.6));
  const sun = new DirectionalLight(0xffffff, 0.5); sun.position.set(-3, 6, 8); scene.add(sun);
  const cam = new OrthographicCamera(-5, 5, VIEW_H / 2, -VIEW_H / 2, 0.1, 220);
  cam.position.set(0, 2.6, 12);

  const mGround = mat("--line", "#7a5a2c"), mFar = mat("--panel-2", "#eadcb8", ["--line", 0.25]), mGold = mat("--gold-fill", "#d9a62e"), mWood = mat("--ink", "#2c1d0e", ["--line", 0.3]);
  const mHero = mat("--ink", "#2c1d0e", ["--gold", 0.15]), mSkin = mat("--panel", "#f4ead2", ["--gold-fill", 0.35]), mCape = mat("--gold", "#7a5100");
  const mMon = mat("--danger", "#8f2323"), mBoss = mat("--danger", "#8f2323", ["#1a0505", 0.45]), mDown = mat("--dim", "#5e4729");

  // The track: ground, far pillars (move at half speed), a gate at the end of each stage.
  const ground = new Mesh(box(script.width + 30, 2, 3), mGround); ground.position.set(script.width / 2, -1, 0); scene.add(ground);
  const far = new Group(); scene.add(far);
  for (let x = -12; x < script.width + 40; x += 3.4) { const p = new Mesh(box(0.7, 3 + ((x * 7) % 3 + 3) % 3 * 0.8, 0.5), mFar); p.position.set(x, 1.6, -3); far.add(p); }
  const gates = new Group(); scene.add(gates);
  script.segs.forEach((s) => {
    const g = new Group(), l = new Mesh(box(0.2, 3.0, 0.3), mWood), r = new Mesh(box(0.2, 3.0, 0.3), mWood), top = new Mesh(box(1.7, 0.2, 0.34), mGold);   // a stage gate: two dark posts under a thin gold beam
    l.position.set(-0.78, 1.6, 0); r.position.set(0.78, 1.6, 0); top.position.set(0, 3.25, 0); g.add(l, r, top); g.position.set(s.gate, 0, -0.4); gates.add(g);
  });

  const hero = new Group(), body = new Mesh(box(0.7, 1.0, 0.5), mHero), head = new Mesh(ball(0.34), mSkin), cape = new Mesh(box(0.14, 0.9, 0.6), mCape), sword = new Group();
  body.position.y = 0.9; head.position.y = 1.72; cape.position.set(-0.4, 0.95, 0);
  const blade = new Mesh(box(0.1, 0.9, 0.08), mGold); blade.position.y = 0.45; sword.add(blade); sword.position.set(0.42, 1.0, 0.3);
  hero.add(body, head, cape, sword); scene.add(hero);
  // The downloaded hero (web/hero.ts) replaces the placeholder's parts: same group, so the walking and fighting logic below is unchanged.
  let real: Hero | null = null;
  if (art.includes("hero")) void loadHero(kit, art, look).then((h) => {
    if (!h || dead) return;
    real = h; for (const c of [...hero.children]) hero.remove(c);
    h.root.scale.setScalar(1.2); h.root.rotation.y = Math.PI / 2; hero.add(h.root);   // faces the way the track runs
    scene.add(new HemisphereLight(0xdfe8f0, 0x5a4634, 0.9)); h.play("idle"); kick();
  });

  const minion = new Group(); { const b = new Mesh(cone(0.3, 0.7), mDown); b.position.y = 0.35; minion.add(b); } minion.visible = false; scene.add(minion);
  // Every monster has a health bar over it. A replay drains the bar of the monster being fought over that fight; a live run's hero keeps hitting
  // the one that waits, so its bar drains and fills again (as the stream of minions beside it, it is for show and counts nothing).
  const barGeo = [new PlaneGeometry(1, 0.17), new PlaneGeometry(1, 0.1)], barMat = [new MeshBasicMaterial({ color: "#120d09" }), new MeshBasicMaterial({ color: "#d2402f" })];
  const foes: { g: Group; boss: boolean; at: number; life: number; actor?: Actor; deadAt?: number; parts: Object3D[]; bar: Group; fill: Mesh; w: number; hp: number; kb: number; flash: number; lastHit: number }[] = [];
  script.monsters.forEach((m) => {
    const g = new Group(), k = m.boss ? 2.1 : 1, b = new Mesh(cone(0.55 * k, 1.5 * k), m.boss ? mBoss : mMon);
    b.position.y = 0.75 * k; g.add(b);
    if (m.boss) for (const sx of [-0.55, 0.55]) { const h = new Mesh(cone(0.18, 0.7), mGold); h.position.set(sx * 0.4, 2.85, 0); h.rotation.z = -sx * 0.7; g.add(h); }
    const parts: Object3D[] = [...g.children];                     // the cone and its horns: what a loaded model replaces
    const w = m.boss ? 1.9 : 1.1, bar = new Group(), back = new Mesh(barGeo[0], barMat[0]), fill = new Mesh(barGeo[1], barMat[1]);
    back.scale.x = w + 0.08; fill.scale.x = w; fill.position.z = 0.01; bar.add(back, fill); bar.position.set(0, m.boss ? 3.4 : 1.8, 0.7); g.add(bar);
    g.position.set(m.x, 0, 0); scene.add(g); foes.push({ g, boss: m.boss, at: m.x, life: 1, parts, bar, fill, w, hp: 1, kb: 0, flash: 0, lastHit: 0 });
  });
  kit.recolor();

  // The downloaded monsters (web/monsters.ts) take the cones' place, each with its own idle, attack and death clips; a monster whose file is
  // missing keeps its cone. The family is the run's guild's.
  let soil: MeshLambertMaterial | null = null, undergrowth: Mesh | null = null;
  let maker: Maker | null = null, litMonsters = false, helper: Actor | null = null;   // the helper is the decorative minion the hero fights while a live run waits
  const dress = (o: (typeof foes)[number]) => {
    const a = maker?.(o.boss);
    if (!a) return;
    if (o.actor) { o.g.remove(o.actor.root); o.actor.dispose(); } else for (const c of o.parts) o.g.remove(c);   // the first time, the cone goes
    o.g.add(a.root); o.actor = a; o.deadAt = undefined; a.idle();
    o.bar.position.y = a.height + 0.35;
  };
  if (art.some((a) => a.startsWith("monster-"))) void loadFamily(kit, art, first.guild ?? "").then((m) => {
    if (dead) return;
    maker = m; foes.forEach(dress);
    helper = m(false);
    if (helper) { for (const c of [...minion.children]) minion.remove(c); minion.add(helper.root); helper.idle(); }
    if (!litMonsters) { litMonsters = true; scene.add(new HemisphereLight(0xdfe8f0, 0x5a4634, 0.9)); }
    kick();
  });

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
    scene.add(art3); ground.visible = false; far.visible = false;   // (the forest shows the ground strip again below)
    gates.visible = false;                                           // the gold gates are placeholders: with the real scene they would only look cheap
    if (forest) {
      // a second, bigger and hazier row of trees far behind the first fills the sky near the ground
      const back = new Group();
      for (let x = from * 1.6 - len * 1.6; x < script.width + 120; x += len * 1.6) { const t = root.clone(true); t.scale.setScalar(1.6); t.position.set(x - from * 1.6, 0, -34); back.add(t); }
      scene.add(back);
      // a dark band of undergrowth behind every tree trunk: trees stand in something instead of in front of the pale horizon
      const bc = document.createElement("canvas"); bc.width = 2; bc.height = 128;
      const bx = bc.getContext("2d")!, bg = bx.createLinearGradient(0, 0, 0, 128);
      bg.addColorStop(0, "rgba(28,44,26,0)"); bg.addColorStop(0.55, "rgba(28,44,26,0.78)"); bg.addColorStop(1, "rgba(22,34,20,1)"); bx.fillStyle = bg; bx.fillRect(0, 0, 2, 128);
      const bt = new CanvasTexture(bc); bt.colorSpace = SRGBColorSpace;
      const band = new Mesh(new PlaneGeometry(600, 5.5), new MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, fog: false }));
      band.position.set(0, 2.75, -80); band.renderOrder = -1; scene.add(band); undergrowth = band;
      // a warm evening: a sky that fades from blue to amber at the horizon, a haze only far away, low sun from behind the camera
      const c = document.createElement("canvas"); c.width = 2; c.height = 256;
      const x = c.getContext("2d")!, gr = x.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, "#3f74a6"); gr.addColorStop(0.5, "#86adc8"); gr.addColorStop(1, "#d3d3b2"); x.fillStyle = gr; x.fillRect(0, 0, 2, 256);
      const sky = new CanvasTexture(c); sky.colorSpace = SRGBColorSpace; scene.background = sky;
      scene.fog = new Fog("#d7c9aa", 40, 150);
      // the camera looks straight along the ground, so the floor is the strip under the hero's feet: dark forest soil, not the sky showing through
      soil = new MeshLambertMaterial({ color: "#4a3a27" }); ground.material = soil; ground.visible = true;
      scene.add(new HemisphereLight(0xfff0d6, 0x55442f, 1.5));
      const sun = new DirectionalLight(0xffdca8, 2.2); sun.position.set(-4, 6, 9); scene.add(sun);
    } else {
      scene.background = new Color("#17120e");
      scene.add(new HemisphereLight(0xcfd8e0, 0x4a3a2a, 0.5));
    }
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
  const frameAt = (): Frame & { estimated?: number } => (live() ? liveEstimated(d, waitedNow()) : replay(d, t));

  function chips(f: Frame) {
    const per = script.segs.map((s, i) => {
      const from = script.monsters.findIndex((m) => m.stage === i), down = from < 0 ? 0 : Math.max(0, Math.min(s.monsters, f.defeated - from));
      const here = script.monsters[Math.min(f.defeated, script.total - 1)]?.stage ?? 0;
      const cls = i < here || (down >= s.monsters && s.monsters > 0) ? "done" : i === here ? "now" : "";
      return `<span class="dg-chip ${cls}">${esc(s.name)} <b>${down}/${s.monsters}</b></span>`;
    });
    hud.innerHTML = per.join("");
  }
  let lootHtml = "";
  const waitedNow = () => (d.waited ?? 0) + (performance.now() - waitedAt);
  function showLoot(f: Frame) {
    const end = !live() && f.done;
    loot.hidden = !end && !live();
    if (live()) {
      const est = (f as { estimated?: number }).estimated ?? 0, real = f.defeated - est, w = waitedNow(), mins = Math.floor(w / 60000), on = mins >= 1 ? `${mins} min` : `${Math.floor(w / 1000)} s`;
      const html = `<b>In the dungeon now</b> · ${n(real)} of ${n(script.total)} monsters down, counted from the run${f.fighting !== null ? ` · the run has been on monster ${real + 1} for ${on}` : ""}${est ? ` · <i>estimated: the picture is ${est} monster${est > 1 ? "s" : ""} ahead; it snaps back when the run next finishes something</i>` : ""} · <b>+${n(d.pending)} XP</b> at the end`;
      if (html !== lootHtml) { lootHtml = html; loot.innerHTML = html; }
    }
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
    // With a real monster in front he fights that one; the stand-back-and-fight-a-stream-of-minions show is only for the cones.
    const waiting = live() && f.fighting !== null, onModel = waiting && !!foes[f.fighting!]?.actor, tx = waiting && !onModel ? Math.max(0, f.x - 1.5) : f.x;
    heroX = live() && !paused ? heroX + (tx - heroX) * Math.min(1, dt / 400) : tx;
    hero.rotation.y = 0;
    hero.position.x = heroX;
    if (waiting && !paused) minionT += dt;
    const cyc = minionT % 1300, mk = paused ? 1 : cyc < 150 ? cyc / 150 : cyc < 950 ? 1 : Math.max(0.01, 1 - (cyc - 950) / 300);
    if (helper) { if (waiting) helper.attack(); else helper.idle(); helper.tick(paused ? 0 : dt); }
    minion.visible = waiting && !onModel; minion.scale.setScalar(Math.max(0.01, mk)); minion.rotation.z = !paused && cyc >= 950 ? ((cyc - 950) / 300) * 0.9 : 0;
    minion.position.set(heroX + 1.15, 0, 0);
    const walking = !paused && (live() ? Math.abs(tx - heroX) > 0.05 : !f.done && f.fighting === null);
    hero.position.y = walking ? Math.abs(Math.sin(now / 130)) * 0.12 : 0;
    const fighting = f.fighting !== null && !paused;
    if (real) { real.play(fighting ? "attack" : walking ? "walk" : "idle"); real.tick(paused ? 0 : dt); hero.position.y = 0; }
    sword.rotation.z = fighting ? -0.4 - Math.abs(Math.sin(swing / 140)) * 1.5 : -0.2;
    foes.forEach((o, i) => {
      const down = i < f.defeated;
      // health: a replay drains the monster being fought over its fight; a live run's monster drains with the time the run has spent on it
      const hp = hpOf(f, i, waitedNow());
      // the hero's blows land about every second while he fights it: it flinches, is knocked back and flashes
      if (!paused && !down && f.fighting === i && now - o.lastHit > 1100) { o.lastHit = now; o.kb = o.boss ? 0.3 : 0.45; o.flash = 1; o.actor?.hit(); }
      o.hp = hp; o.fill.scale.x = Math.max(0.001, o.w * hp); o.fill.position.x = -(o.w * (1 - hp)) / 2; o.bar.visible = !down && o.g.visible;
      if (!paused) { o.kb *= Math.exp(-dt / 140); o.flash *= Math.exp(-dt / 170); }
      o.g.position.x = o.at + o.kb;                                  // knocked back, then settles
      if (o.actor) {
        // a model flinches when hit, falls with its death clip, then fades away; a replay stands the monster up again
        if (down) { o.actor.die(); o.deadAt ??= now; }
        else { if (o.actor.dead()) dress(o); o.deadAt = undefined; if (f.fighting === i) o.actor.attack(); else o.actor.idle(); }
        o.actor.tick(paused ? 0 : dt); o.actor.setFlash(o.flash);
        const alpha = !down ? 1 : paused ? 0 : Math.max(0, Math.min(1, 1 - (now - (o.deadAt ?? now) - 1100) / 600));
        o.actor.setAlpha(alpha); o.g.visible = alpha > 0.02; o.bar.visible = !down; o.g.rotation.z = 0; o.g.position.y = 0;
        return;
      }
      // a cone (no file): the old shrink-away, with the same knock-back
      o.life = paused ? (down ? 0 : 1) : o.life + ((down ? 0 : 1) - o.life) * Math.min(1, dt / 160);
      o.g.visible = o.life > 0.02;
      o.g.scale.setScalar(Math.max(0.01, o.life));
      o.g.rotation.z = (1 - o.life) * 0.8;
      o.g.position.y = o.boss ? 0 : 0.06 * Math.sin(now / 300 + i);
    });
    if (shownDefeated !== f.defeated || !hud.firstChild) { shownDefeated = f.defeated; chips({ ...f, defeated: f.defeated - ((f as { estimated?: number }).estimated ?? 0) }); }   // the chips count what the run really did
    showLoot(f);
    const cx = hero.position.x + CAM_LEAD;
    cam.position.x = Math.max(cam.right - 1, cx); // follows the hero to the end of the track; only the start is clamped
    if (undergrowth) undergrowth.position.x = cam.position.x;   // the band of undergrowth moves with the camera
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
      d = next; waitedAt = performance.now();
      if (finished) { t = 0; heroX = 0; shownDefeated = -1; } // the run ended: its replay starts from the door
      kick(); return true;
    },
    replay() { t = 0; heroX = 0; shownDefeated = -1; paused = false; kick(); },
    pause(on) { paused = on; if (!on) kick(); return paused; },
    destroy,
  };

  function destroy() {
    dead = true; cancelAnimationFrame(raf); soil?.dispose(); barGeo.forEach((g) => g.dispose()); barMat.forEach((m) => m.dispose()); if (undergrowth) { undergrowth.geometry.dispose(); (undergrowth.material as MeshBasicMaterial).map?.dispose(); (undergrowth.material as MeshBasicMaterial).dispose(); } kit!.destroy();
  }
}
