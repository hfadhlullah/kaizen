# Build: page, rounds, Three.js lessons

## Stack for the prototype
- One `game.html`, no build step. Three.js from an importmap with an exact version, add-ons from the same version:
  ```html
  <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
    "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
  ```
  GLTFLoader, SkeletonUtils (to clone animated characters) and OrbitControls come from `three/addons/`.
- `shared/data.js` is a classic script setting one global (teams, rounds, cases), so concepts, game and tools all read the same data.
- Assets are Kenney CC0 packs (mini characters with animations, city, roads, car, nature, furniture kits, interface, impact and jingle sounds).
  GLBs reference `Textures/colormap.png` next to them, so keep each pack's folder layout. Copy in only what you use, plus `License.txt`, and list the packs in `assets/CREDITS.md`.
  Convert `.ogg` to `.m4a` (`ffmpeg -i x.ogg -c:a aac -b:a 96k x.m4a`) and pick by `audio.canPlayType`, because older iOS Safari cannot play Ogg.
- Music is a short procedural WebAudio loop that stays off until the first tap. One mute toggle controls everything.
- Targets: first load under 3 MB on 4G, each round under 1 MB extra, 30+ fps on a mid-range Android phone.

## Page skeleton
- **Screens.** One `go(name)` switches screens (login, character, lobby, hub, game, result, review, leaderboard, final, podium).
  `?screen=<name>` jumps straight to any screen with sample state, so screenshots and agents need no click path. A direct jump into a game skips the intro and starts at once.
- **Spectator view.** `?view=spectator` (plus `&mode=final`) is a 1280×720 screen for the video call: large type (names 28 px or more, key numbers 48 px or more), flat colours (gradients turn to mush in compression), a room filter, and live top 10 bars.
- **Test hook.** `window.__game = { go, get view(), get S(), get gpu() }`, where `gpu` = `renderer.info.memory` plus counts. Scripts read state from it and never poke globals.
- **Honest labels.** Show a small "PROTOTYPE, simulated data" pill and a "sample question" note on content.
- **Fallbacks.** If WebGL is missing, each round has a 2D version. If GLBs fail to load (for example over `file://`), use primitive shapes. In both cases, log `console.warn` and never throw.
- **Accessibility.** Contrast at least 4.5:1, touch targets at least 44 px, a visible focus ring, labels on icon buttons, no colour-only signals.
  Under `prefers-reduced-motion`, tweens jump to their end state. Every round must also be playable with laptop keys.

## Round shell and module contract
The page owns the clock, scoring and result. A round module only plays. Keep the contract as a comment at the top of the reference module, because every agent reads it there.
```
rounds/<key>.js
  export const READY = true            false = placeholder: the hub shows a "coming soon" sheet
  export const ASSETS = [...]          GLB paths preloaded before start()
  export const CASES = [...]           { id, prompt, action, reason, source } in play order (the review screen lists them)
  export default function start(ctx)

ctx (everything a module may touch; it never reads page globals)
  n, meta, root, stage, gl, THREE, data, S, RM (reduced motion)
  sh: st { solved, wrong, pen, elapsed, running, ended }, total,
      good(text, caseId)  bad(text, spoken, caseId) (+penalty, case stays open)
      miss(text, spoken, caseId) (+penalty, case closed)  penalty(sec, text)  end()
  intro(steps, onStart)  mount(view)  makeCharacter(i)  prop(path, opts)  instanced(path, items)
  lights(scene, …)  tween(dur, fn, delay, done)  sfx(name)  say(text)  buzz(ms)
  later(fn, ms) every(fn, ms) onKey(fn) on(el, ev, fn) onSwipe(el, fn)   (all removed on screen change)
```
- The shell ends the round when `solved === total`, or at the time limit including penalties. It stores the first result only, plus the solved and missed case ids for the review screen.
- `view = { scene, camera, resize(w, h), update(dt), onTap?, controls?(orbit), onMount?, onUnmount? }`.
- A module loads with `import()` when its building is entered. A missing or broken module shows the placeholder sheet instead of a blank screen.
- Once the shell and the reference module work, each further round is one file, so agents can build several at once.

## Three.js lessons (each one cost a redo)
- **One renderer, one canvas** for all screens. `mount(view)` and `unmount()` swap the scene and camera.
- **Release GPU memory on unmount.** Patch `EventDispatcher.prototype.addEventListener` so that every object registering a `'dispose'` listener goes into a `GPU` set.
  That set is exactly what three.js uploaded. On unmount, dispose everything in it except the shared model, material and geometry caches.
  Measured: textures 37 → 29 after five games in a row, against 137 → 445 without it. Also remove the DOM nodes the round created.
- **OrbitControls clamps zoom and angles every frame.** `minZoom`/`maxZoom` must cover every scripted camera move (intro, dive into a building). Otherwise the tween stalls halfway and looks like a stutter.
- **One camera move at a time.** Give each move a job id and ignore stale ones: `const id = ++camJob; tween(d, p => { if (id === camJob) fn(p); })`. Two tweens writing zoom at once jitter.
- **Never ease towards a stale target.** When flying to a building on a spinning island, ease the spin out first and aim at the building's live world position every frame.
- **`OrbitControls.dispose()` leaves an inline `touch-action: auto`** on the shared canvas. Clear it, or the next view loses its swipes to page scrolling.
- **Keep the old interactions when adding a new one.** Using drag to pan between islands silently removed drag-to-rotate, and the user noticed at once.
  Before changing input handling, list what each gesture does now, and keep that list in the agent's brief.
- **Screen-sized labels** (sprites with `sizeAttenuation: false`) go into a registry at creation. Never `scene.traverse` every frame to find them.
- **Phones.** Pixel ratio capped at 2, `powerPreference: 'low-power'`, `PCFShadowMap` on touch devices (soft PCF on desktop), one shadow-casting light, instancing for repeated props (trees, lamps), and pause rendering when the tab is hidden.
- **Animated characters.** Clone with `SkeletonUtils.clone`. Use one `AnimationMixer` per character and crossfade clips (idle, walk, sprint, jump, fall, emote).
- **Labels must not collide** with fixed UI: test the tallest building's label against the segmented control at 1440×900 and 2000×1100.

## UI direction that the client approved (Apple HIG)
- Clarity: one purpose per screen; a large title of 34 px, body text of 17 px, `tabular-nums` for timers and scores.
- System font for the UI; one display font only for titles and game moments.
- Deference: neutral surfaces with one accent colour for primary actions, and no ornament.
- Depth: cards on a grouped background with soft shadows. Bottom sheets with a grabber for details. Blur only on controls that float over the 3D view.
- iOS patterns: inset grouped lists, segmented controls, and one primary button pinned at the bottom (`padding-bottom: max(16px, env(safe-area-inset-bottom))`).
- Motion: about 350–500 ms with `cubic-bezier(.32,.72,0,1)` and `scale(.97)` on press. Every tap gets feedback (sound, `navigator.vibrate(10)`).
- Thin line icons drawn as inline SVG. No emoji icons, no hype copy, no purple gradients, no fake stats.
- Login on a phone: the password field must stay visible above the keyboard. Keep the hero and the list short, and let Enter submit.

## Parallel agents
- First one agent builds the shell and one reference round end to end. Then one agent per remaining round, each editing only its own `rounds/<key>.js`.
  If an agent needs a page change, it describes it in its report, and you apply it.
- The brief, as a file in the scratchpad: what the user asked (quoted), files to read first, the contract, the content rules, the "keep" list, the verification to run, and a word-capped report.
  The report covers what was done, controls, case count, asset KB, weak spots, and the "what's new" lines.
- Tell every agent whether the site is live. On the real project, edits went public the moment they were saved, so "keep it working at every save" was in every brief.
