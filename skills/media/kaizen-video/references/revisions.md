# Revisions

Clients revise. Make every revision cheap, traceable and reversible.

## Classify the request, then touch only that layer
| request | what changes | redo |
|---|---|---|
| "change this sentence / say it warmer / mispronounced X" | `lines.json` entry | `vo.py <film-dir> "" v04` (only that key; empty voice = use film.json), then build and render |
| "different text on screen" | beat `kick/title/sub/items` in `film.json` | build + master |
| "swap this picture" | beat `img` (+ intake for new photos) | build + render |
| "slower / faster / shorter" | preset `pace`, beat `hold`, drop or merge beats | build + render |
| "music too loud / different mood" | preset `music.base/lift` or `music.sh` new track | build + render |
| "other colours / logo / font" | `film.brand`, `logo` | build + render |
| "make a vertical / 15 s version" | new film entry with its own (shorter) script | vo + master |
| "different style" | `preset` (and usually a rewritten script) | vo + master |

Never regenerate all narration for a one-line change: voices vary between takes and credits cost money.

## Versioning
- `master.sh` moves the previous delivery to `output/<name>/<preset>/previous/<name>-<timestamp>.*` before writing the new one.
- Append to `videos/<name>/REVISIONS.md`: date, the user's words verbatim, what changed, output file.
- When a revision is rejected, restore from `previous/` instead of re-rendering.

## Before re-delivering
Re-check stills of the beats that changed, master, and say exactly what changed and what did not.
