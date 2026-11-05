# game-assets

Sources for the 3D scenes of the Game page. Not in the npm package (`package.json` `files` does not list it) and the
built `.glb` files are never committed: they are published as release downloads and fetched by `kaizen game assets`.

Build (Blender 5.x with the MCP for Blender add-on, Poly Haven on; assets of `LICENSES.md` imported at 1k):
1. `build/billboards.py` — tree cards (needs the full-detail trees imported).
2. `build/forest.py`; `build/common.py` then `build/dungeon.py` and `build/town.py` — each exports a raw `.glb` to `~/.cache/kaizen-game/`.
`cli/game-assets.test.ts` checks that this folder's scripts and `LICENSES.md` name the same Poly Haven assets.
3. `bun game-assets/pack.ts` — compresses (meshopt + WebP), makes leaf cards alpha-tested, writes `dist/*.glb` and `dist/manifest.json` (sha256, size).
