---
name: disk-cleanup
description: Audit disk usage on this PC and clean it up safely. Shows terminal box charts of what is fat (home dirs, Steam games, caches, rebuildable build output), then a verdict panel and a pick-what-to-delete question. Use when the user asks to tidy files and dirs, free disk space, find what is safe to delete, prune caches, or "what is eating my disk".
---

# Disk cleanup

Audit first, delete only what the user picks. Never delete without an explicit pick.

## Rules learned the hard way

- **Verify before saying "safe".** Look inside (`ls`, `du`, `diff -rq`, read `project.json`) before calling anything cache or a copy. A dir named `.cache` can hold a venv, a backup, or project history.
- **Never total unlike things.** A sum of cache dirs is not "reclaimable". Report each group on its own and state what is regenerable and what is not.
- **Use real numbers.** Say what a number is (apparent vs on-disk). The disk is btrfs with zstd, so use `du -x` and `df -h /home`.
- Delete only on a pick. Prefer move-to-Archive for anything not obviously regenerable.
- Report outcomes faithfully: freed space comes from `df` before/after, not from the plan.

## Procedure

1. **Overview.** `df -h /home`, then `du -xsh ~/.[!.]* ~/* | sort -rh | head -25`. Expect `~/.local/share/Steam` to dominate; drill into it separately.
2. **Drill the fat ones** with `du -xh --max-depth=1 <dir> | sort -rh | head`:
   - Steam: `steamapps/common`, `shadercache`, `compatdata`. Game name, size and last played come from `steamapps/appmanifest_*.acf` (`name`, `SizeOnDisk`, `LastPlayed`; missing or 0 = never played).
   - Projects: rebuildable output = `node_modules`, `target`, `.next`, `dist` (`find Projects -name node_modules -type d -prune`).
   - `~/.cache`, `~/.config` browser profiles, `~/.hermes`, `~/.local/share/mise/installs` (old tool versions).
3. **Round 1: show charts, then ask where to go.** Print the box charts as chat text (see Format), then `AskUserQuestion` with: explore outside Steam / explore Steam / continue to cleanup. Do the exploration the user picks, show new boxes, ask again.
4. **Round 2: verdict, then ask what to run.** Print the verdict panel as chat text, then `AskUserQuestion` (multiSelect, max 4 options; overflow items go via "Other") whose options are the verdict rows.
5. **Run only the picks.** Close Steam before touching `steamapps`. Re-run `df -h /home` and report freed space.

## Verdict tiers

| Tier | Meaning | Examples |
|---|---|---|
| ✓ SAFE NOW | regenerates, no work lost | Steam `shadercache`, `node_modules`/`target`/`.next`, `.zcompdump`, empty dirs, stale `.claude.json.tmp.*` |
| ✓ RE-DOWNLOAD | recoverable, costs time | never-played Steam games, model caches under `~/.cache/huggingface` |
| ? YOUR CALL | depends on use | idle games (2+ months), old `mise` versions, VMs, headless browser profiles |
| ✗ KEEP | never offer | `Projects` source, `Documents`, `.ssh`, `.gnupg`, `.kaizen`, `Games/roms` |

Watch for: `whisperx-venv` is a venv, not cache; `kaizen-video` needs it. Desktop shortcuts in `~` for a "never played" game mean the user may be about to play it.

## Format

Boxes are 38 wide, two per row. No scale text in the title: the title is bold, the top-right shows the box's used total and a 5-cell gauge. Sizes show as TB, GB, MB or KB (never bare `G`); a blank line separates the title from the rows. Row bars fill the width up to the right-aligned size column and scale to the box's biggest row (`▌` half, `▏` under one half-cell). Mark never-played games `✗`.

Gauge = box total ÷ the limit (the disk size for HOME and STEAM boxes; the biggest dir's parent for others). Each filled cell is an emoji square coloured by that ratio: 🟩 <50%, 🟨 <75%, 🟧 <90%, 🟥 ≥90%; empty cells are ⬜. Both are 2 cells wide, so `box` counts them double. Bold titles use Unicode bold letters (`𝗛𝗢𝗠𝗘`) because markdown bold does not work inside a code block. Never hand-draw boxes: import the shared component `tui.py` (same dir as this file) for every report that uses a box.

```python
import sys, os; sys.path.insert(0, os.path.expanduser("~/.claude/skills/disk-cleanup"))
from tui import box, panel, render, storage, GB, MB, KB
render(box("HOME", [("Steam", GB(1500)), ("Projects", GB(52))], GB(1552), GB(1900)), box("CACHE", [("huggingface", GB(12)), ("tmp", MB(300), "✗")], GB(12), GB(1900)))
```

`box(title, [(name, bytes, flag?)], used, limit)` makes a bold-title box: sizes in bytes (`GB()`, `MB()`, `KB()` build them; shown as GB, MB, KB), bars fill the row up to the size column and scale to the box's biggest row, the top-right gauge is box total vs `limit`; `panel(title, [(line, note)], foot)` the verdict panel; `render` prints two per row. `storage([(label, bytes)], total, free)` returns the full-width DISK box: one bar split by pattern (█ ▓ ▒, then ░ other, blank free; chat text cannot colour per section), real disk size top-right, and a one-line legend underneath (short lowercase labels, sizes without a space, so it fits one line). Print it above every chart set, using disjoint sections (e.g. steam games, steam other, home rest) and the real `df` total and free. A box total must be the real `du` figure, not the sum of the rows shown.

Every box line must be 40 cells wide by `w()` (emoji = 2); check before printing.

Verdict panel: `panel()`, one numbered row per option (`[1] ✓ SAFE NOW  <what>  <size>` with a `└` note line), a `✗ KEEP` footer.

The user sees chat text and the question dialog, but a question dialog shows only its own text, so charts go in chat before the call, never inside the question.

**Bash output is collapsed in the user's terminal ("Ran 2 shell commands"), so a chart printed by `render` is invisible.** After running `tui.py`, copy its output verbatim into your own reply inside a ``` code block, before the `AskUserQuestion` call. Never ask "next step?" until the chart is in reply text. Same for the verdict panel.
