---
name: kaizen-game
description: Design, build, verify and share any browser game (web track) — arcade, puzzle, runner, platformer, board or card game, 3D toy world, idle or story game, campaign or learning game — as a phone-first page with Three.js or plain Canvas/DOM, levels or rounds as separate modules, real-input Playwright play-throughs, frame-timing checks, and a public review link. Has an extra track for live event and learning games (content where the answer is an action in the game, rankings, a spectator view for Zoom). Use when the user wants to make a web game, a game design document (GDD), a playable game prototype, a game for an event, training or campaign, or wants an existing browser game fixed, smoothed or extended. Not for native, console or Unity/Godot games.
---

# Kaizen game (web)

Any browser game, from brief to a link people can play: an arcade or puzzle game, a runner, a 3D toy world, a campaign game, a learning game.
The core flow (brief, concepts, GDD, build, verify, share) is the same for all of them.

**Tracks.** Pick one in the brief, and say which in the GDD:
- **Game** (default): any web game. Skip the content step and the event parts.
- **Event / learning**: a game with real-world content (training, compliance, onboarding, a campaign quiz) and often a live event with rankings and a shared screen.
  This adds the "not a quiz in a skin" rule, the case model, `content.md`, and the run-of-show and spectator parts.

The lessons here come from a real event / learning project. It was a one-hour live compliance competition: 43 teams on phones, 12 playable rounds over two 3D islands, played in the browser, with Zoom used only by moderators.
It reached client review as a prototype. Steps marked **unproven** were planned there but not yet built. Say so when you reach them.

```
docs/
  GDD.md  GDD.pdf          the design, approved before games are built
  CONTENT-REVIEW.md        event / learning track: every case with answer, reason, source, for the client's expert
.preview/                  what the server shows
  index.html               landing: play link, downloads, "what's new" per version
  game.html                the game: one page, Three.js from an importmap, no build step
  shared/data.js           levels, tuning, content (one global, e.g. window.GDATA)
  rounds/<key>.js          one ES module per level or round, loaded with import() when it is entered
  assets/                  Kenney CC0 models and sounds actually used, with License.txt and CREDITS.md
  v1/ v2/ …                copies of game.html before each big pass
tools/serve.json           which paths the public server may serve
```

`S=<this skill>/scripts`. Run scripts from the project folder.

## 0. Setup, once per machine
`$S/check.sh` lists what is missing (node, Playwright with Chromium, optional pandoc for the GDD PDF). `$S/setup.sh`
installs Playwright 1.62.1 and Chromium into `~/.kaizen/kaizen-game` (about 150 MB; tell the user first). If kaizen-book
already installed Playwright in `~/.kaizen/kaizen-book`, the scripts use that one.

## 1. Brief, then concepts
Read [`references/design.md`](references/design.md). Ask what kind of game it is, who plays, on what device, and how long a session lasts.
For the event / learning track, also ask **who the client is and their sector, before writing any content**. On the real project, content was first written for
the wrong sector and every case had to be rewritten.
When the direction is still open, run the `kaizen-concept` skill: truly different concepts, each with its signature
round playable to the result, on one review page. Build nothing big until one concept is picked.

## 2. GDD, approved
Write `docs/GDD.md` from the skeleton in `design.md`. Every game gets a core loop, controls on phone and laptop, a fail state and win state, tuning knobs, and a difficulty curve.
In the event / learning track, the rule that decides most of the design is that **the game is not a quiz in a skin**.
The question is a situation inside the game, and the answer is an action (dodge, stop, pick up, choose a path).
`node $S/gdd-pdf.mjs docs/GDD.md` builds `docs/GDD.pdf` for the client (needs pandoc).
Inside a kaizen run, the GDD approval is the plan approval.

## 3. Build
Read [`references/build.md`](references/build.md): page skeleton, `?screen=` jumps, the round shell, the module contract,
and the Three.js lessons (camera, disposal, touch, fallbacks), each of which cost a redo.
- Order that worked: playable flow first, then a UI pass (Apple HIG), then a richness pass (models, sound, light), then the real levels or rounds one by one.
- 2D games use the same skeleton with Canvas or DOM in place of Three.js. The lessons on screens, modules, fallbacks and verification still apply.
- Copy `game.html` to `v<N>/` before every big pass.
- Several rounds can be built at once by sub-agents, **one module file per agent**, with the contract in the reference module's header.
  Write each agent a brief: files to read, a "keep" list of recent behaviour it must not undo, the verification, and the report format.

## 4. Content (event / learning track)
Read [`references/content.md`](references/content.md). Cases come from the client's real published rules, read in full.
Never invent an article number. Mark every case as a sample and list it in `docs/CONTENT-REVIEW.md`, with a column for what still needs the client's confirmation.

## 5. Verify
Read [`references/verify.md`](references/verify.md). The minimum before you say it works:
```
node $S/smoke.mjs http://127.0.0.1:4321/game.html --screens login,hub,result   # 390×844 touch + 1440×900, errors, overflow, shots
node $S/frames.mjs http://127.0.0.1:4321/game.html?screen=hub --click 700,600 --gpu   # frame gaps around one interaction
```
Then play every round **by real input** (taps, swipes, keys) to the result, once with mistakes, and look at every screenshot yourself.
"Smooth" is a measurement on the real GPU, not a guess. Swiftshader frame times mean nothing.

## 6. Share
Read [`references/ship.md`](references/ship.md). `PUBLIC=1 node $S/serve.mjs .preview 8060` serves only what
`tools/serve.json` allows. Expose it through the `deploy-tunnel` skill or any static host. Going public is outward-facing, so confirm with the user first.
Each version gets 3–5 "what's new" lines in the user's language on the landing page.

## Unproven (plan it, don't claim it)
Server-authoritative realtime or multiplayer play (WebSocket, a server clock, answer keys on the server), a host or moderator console,
saves that survive a refresh, a load test with simulated clients, tests on real cheap phones, and app-store wrapping. The GDD template
has sections for them. Until they are built, the prototype simulates other players, and the landing page says so.

## Improve this skill after each game
This skill grows from real projects. When a game reaches review, ask the user whether to fold its lessons back in, and add only what was proven in that project:
- a mistake that cost a redo goes to the "lessons" list of the matching reference, as one line with the measured evidence (`build.md`, `verify.md`, `content.md`);
- a check that caught a real bug goes into `verify.md` or a script;
- a step marked **unproven** that the project built and tested loses its mark, and its how-to goes into `ship.md` or `build.md`;
- a new genre that needed different rules gets its own short section in `design.md`.
Keep it generic: no client names, client content or project paths, because the skill is published.

## Kaizen
In a kaizen run: the brief and GDD approvals are the plan approval, each game or pass is a build, and the review plays
the game against the GDD using `verify.md`. Screenshots go in the run's `attachments/` for the Preview gate.
