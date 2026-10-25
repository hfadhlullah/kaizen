# Revisions

Clients revise. Make every revision cheap, traceable and reversible.

## Classify the request, then touch only that layer
| request | what changes | redo |
|---|---|---|
| "change this sentence / say it warmer / mispronounced X" | `lines.json` entry | `vo.py <film-dir> "" v04` (only that key; empty voice = use film.json), then master |
| "different text on screen" | beat `kick/title/sub/items` in `film.json` | master |
| "swap this picture" | beat `img` (+ intake for new photos) | master |
| "slower / faster / shorter" | preset `pace`, beat `hold`, drop or merge beats | master |
| "music too loud / different mood" | preset `music.base/lift` or `music.sh` new track | master |
| "other colours / logo / font" | `film.brand`, `logo` | master |
| "make a vertical / 15 s version" | new film entry with its own (shorter) script | vo + master |
| "different style" | `preset` (and usually a rewritten script) | vo + master |

Never regenerate all narration for a one-line change: voices vary between takes and credits cost money.

## Versioning
- `master.sh` moves the previous delivery to `out/previous/<name>-<timestamp>.*` before writing the new one.
- Append to `~/.kaizen/videos/<slug>/REVISIONS.md`: date, the user's words verbatim, what changed, output file.
- When a revision is rejected, restore from `out/previous/` instead of re-rendering.

## Before re-delivering
Re-check stills of the beats that changed, master, and say exactly what changed and what did not.
