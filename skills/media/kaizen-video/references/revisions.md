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
- Renders still land in `output/<name>/<preset>/<name>.mp4`. The kaizen board then files each one as a
  **version** (a, b, c…) under `output/<name>/versions/<letter>/<n>/`. Next to it goes its **recipe**, a
  copy of the video folder's small files (film.json or config.json, lines, words, voice lines,
  pictures, transcript JSON), in `videos/<name>/versions/<letter>/<n>/`. Do not move or rename these
  folders by hand.
- `videos/<name>/versions.json` says which version the draft is revising (`revising`).
  - When it is set, the user picked that version on the Video page, and its recipe is in the draft. Keep
    its preset. Your render becomes that version's **try**, which the user keeps or reverts on the page.
  - When it is unset, a render becomes a new version.
- Append to `videos/<name>/REVISIONS.md`: date, the user's words verbatim, what changed, output file.
- A rejected revision is reverted on the Video page, not re-rendered. Older renders sit in each version's
  history there.

## Before re-delivering
Re-check stills of the beats that changed, master, and say exactly what changed and what did not.
