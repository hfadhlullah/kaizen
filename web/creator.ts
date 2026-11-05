// The hero creator: a 3D preview of the hero beside sliders, style pickers and colours. Nothing is saved until Save; the
// page (web/game.ts) does the saving through POST /game/look and the server checks every value again. Inside /scenes.js
// (web/scenes.ts), which sets window.KzCreator; bundled by `bun run build:web`.
import { AmbientLight, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene } from "three";
import { makeKit } from "./scene-kit.ts";
import { loadHero, type Hero } from "./hero.ts";
import { BEARDS, COLORS, HAIRS, HERO_DEFAULTS, PRESETS, SLIDERS, type HeroLook } from "./hero-look.ts";

export type CreatorHandle = { update(saved: Partial<HeroLook>): void; destroy(): void };
export type CreatorOpts = { look: Partial<HeroLook>; art: string[]; onSave(look: HeroLook): Promise<string | null> };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const LABEL: Record<string, string> = { gender: "Body type (female to male)", tall: "Height", build: "Build", muscle: "Muscle", skinColor: "Skin", hairColor: "Hair", facialHairColor: "Beard", eyeColor: "Eyes" };
const title = (s: string) => s[0]!.toUpperCase() + s.slice(1);

export function mountCreator(host: HTMLElement, o: CreatorOpts): CreatorHandle | null {
  let saved: HeroLook = { ...HERO_DEFAULTS, ...o.look }, cur: HeroLook = { ...saved };
  host.innerHTML = `<div class="cr"><div class="cr-stage"></div><form class="cr-form" autocomplete="off">
    <div class="cr-presets" role="group" aria-label="Starting looks">${PRESETS.map((p, i) => `<button type="button" data-preset="${i}">${esc(p.name)}</button>`).join("")}</div>
    <label>Hair <select name="hair">${HAIRS.map((h) => `<option value="${h}">${esc(title(h))}</option>`).join("")}</select></label>
    <label>Beard <select name="beard">${BEARDS.map((b) => `<option value="${b}">${esc(title(b))}</option>`).join("")}</select></label>
    ${SLIDERS.map((k) => `<label>${LABEL[k]} <input type="range" name="${k}" min="-1" max="1" step="0.05"></label>`).join("")}
    <div class="cr-colors">${COLORS.map((k) => `<label>${LABEL[k]} <input type="color" name="${k}"></label>`).join("")}</div>
    <div class="cr-actions"><button type="submit" class="cr-save">Save hero</button><button type="button" class="cr-reset">Reset</button></div>
    <p class="cr-status" role="status" aria-live="polite"></p></form></div>`;
  const stage = host.querySelector<HTMLElement>(".cr-stage")!, form = host.querySelector<HTMLFormElement>(".cr-form")!;
  const status = host.querySelector<HTMLElement>(".cr-status")!, save = host.querySelector<HTMLButtonElement>(".cr-save")!;
  const kit = makeKit(host, stage, "Your hero, turning slowly, with the choices you make on the right");
  if (!kit) { host.innerHTML = `<p class="empty">This browser cannot draw the hero (no WebGL).</p>`; return null; }
  const { renderer } = kit;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const scene = new Scene();
  scene.add(new HemisphereLight(0xdfe8f0, 0x5a4634, 1.0));
  scene.add(new AmbientLight(0xffffff, 0.35));
  const key = new DirectionalLight(0xfff1dc, 2.1); key.position.set(2.5, 3.2, 3.5); scene.add(key);
  const rim = new DirectionalLight(0x9fc4ff, 0.9); rim.position.set(-3, 2, -2.5); scene.add(rim);
  const cam = new PerspectiveCamera(28, 1, 0.1, 30); cam.position.set(0, 1.0, 4.6); cam.lookAt(0, 0.88, 0);

  let hero: Hero | null = null, dead = false, raf = 0, last = performance.now(), spin = reduce ? 0.55 : 0;
  const form_ = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
  const paint = () => {
    for (const k of ["hair", "beard", ...SLIDERS, ...COLORS] as const) { const el = form_(k); if (el && el.value !== String(cur[k])) el.value = String(cur[k]); }
    const dirty = JSON.stringify(cur) !== JSON.stringify(saved);
    save.disabled = !dirty; status.textContent = dirty ? "Not saved yet." : "Saved.";
    hero?.setLook(cur); kick();
  };
  const kick = () => { if (!raf && !dead) { last = performance.now(); raf = requestAnimationFrame(draw); } };
  function draw(now: number) {
    raf = 0;
    if (dead) return;
    const dt = Math.min(100, now - last); last = now;
    if (hero) { if (!reduce) spin += dt * 0.00045; hero.root.rotation.y = spin; hero.tick(reduce ? 0 : dt); }
    renderer.render(scene, cam);
    if (!reduce) raf = requestAnimationFrame(draw);
  }
  kit.watch(stage, (cw) => {
    const w = Math.max(240, cw), h = Math.round(Math.max(320, Math.min(520, w * 1.15)));
    renderer.setSize(w, h, false); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = h + "px";
    cam.aspect = w / h; cam.updateProjectionMatrix(); kick();
  }, () => kick());
  void loadHero(kit, o.art, cur).then((h) => {
    if (dead) return;
    if (!h) { stage.insertAdjacentHTML("beforeend", `<p class="cr-missing">The hero is not downloaded yet. Use the Download button above.</p>`); return; }
    hero = h; scene.add(h.root); h.play("idle"); if (reduce) h.tick(400); paint();
  });

  form.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (!t.name) return;
    (cur as unknown as Record<string, string | number>)[t.name] = t.type === "range" ? Number(t.value) : t.value;
    paint();
  });
  host.querySelector(".cr-presets")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-preset]");
    if (b) { cur = { ...HERO_DEFAULTS, ...PRESETS[Number(b.dataset.preset)]!.look }; paint(); }
  });
  host.querySelector(".cr-reset")!.addEventListener("click", () => { cur = { ...saved }; paint(); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); save.disabled = true; status.textContent = "Saving…";
    const err = await o.onSave({ ...cur });
    if (err) { status.textContent = err; save.disabled = false; return; }
    saved = { ...cur }; paint();
  });
  paint();
  return {
    update(next) { saved = { ...HERO_DEFAULTS, ...next }; paint(); },
    destroy() { dead = true; cancelAnimationFrame(raf); kit.destroy(); },
  };
}
