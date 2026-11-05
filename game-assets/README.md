# game-assets

Sources for the 3D scenes of the Game page. Not in the npm package (`package.json` `files` does not list it) and the
built `.glb` files are never committed: they are published as release downloads and fetched by `kaizen game assets`.

Build (Blender 5.x with the MCP for Blender add-on, Poly Haven on; assets of `LICENSES.md` imported at 1k):
1. `build/billboards.py` — tree cards (needs the full-detail trees imported).
2. `build/forest.py`; `build/common.py` then `build/dungeon.py` and `build/town.py` — each exports a raw `.glb` to `~/.cache/kaizen-game/`.
`cli/game-assets.test.ts` checks that this folder's scripts and `LICENSES.md` name the same Poly Haven assets.
3. `bun game-assets/pack.ts` — compresses (meshopt + WebP), makes leaf cards alpha-tested, writes `dist/*.glb` and `dist/manifest.json` (sha256, size).

The hero: `build/human.py` (MPFB2 human, morph targets, clothes, eyebrows, beards from `hair.json` and `human.py`'s list, hair, the Quaternius clips; run it in Blender 5.x, it writes `hero_raw.glb`; copy that to `hero.glb` next to the scene files and run `pack.ts`). `build/spikes/` keeps the scripts of the attempts that did not work (clips assigned directly, every bone retargeted, the body skinned to the library's skeleton), as a record of why the arms are scripted.
