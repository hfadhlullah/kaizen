---
description: The board's Icebox page on a wide screen: capture box, boards bar, Cards | Sort, item menus
tags: [project, sources, web-board]
sources: [web/board/icebox.ts, web/board.html]
updated: 2026-11-09
---
# Icebox page

## In plain words
The page where you throw things into the icebox and sort them out: a box to type in, your boards, and your items as cards or as a fast list. Part of [[Sources and icebox]].

## Where it lives
- The desktop Icebox page (2026-11-09-icebox-desktop, run 2 of icebox-inbox; mockup A): `openSources()` in `web/board/icebox.ts` draws capture box (`#ice-cap`), boards bar (`.ice-boards`: All, each board with its waiting count, a person mark on a client's, `+ Board` → `/icebox {op:"boards", act:"add"}` via `prompt`/`confirm`; kind chips toggle `iceKinds`), the bar (Cards | Sort, count, filter popover, Swipe, `Sources · N`), then cards (`.ice-cards`, CSS `columns`, `cardOf()`) or the Sort list (`row()`), both from one `order`: newest first by `at`, filters board → kind → category → source. Category is a filter only now (no group headers). The view is `kz-ice-view` per browser; a card's text or → Task switches to Sort for the visit only (`iceView`, not saved), with the row open. Under 640 px (`narrowQ`, re-rendered on change) there are no cards or switch. Item menus Snooze / Kind / Board are one open menu, `iceMenu = "<dir> <id> <menu>"`, drawn inside its row or card but `position:fixed` under its button (an absolute pop-up inside CSS columns is split between columns); a click elsewhere, Esc or scrolling `#pbody` shuts it. Snooze (menu, `h`, bulk) goes through `snoozeAll()` and a toast with Undo (`unsnooze`). Gather all (`#src-go`) sits in the Sources drawer header beside Add. A link card's block is coloured from a hash of the site name; nothing is fetched from the site.
- Styles: the `/* The icebox page … */` block in `web/board.html` (`.ice-cap`, `.ice-chip`, `.ice-card`, `.ice-lk`, `.ice-mpop`, kind colours `.k-client|finding|people` mixed with `--ink` so both themes read); nothing outside `.ice-*` changed.
- Route: `/icebox` op `boards` ([[Web board/Server and routes]]).

## Watch out
- The capture box's textarea and mic button are module-level nodes (`cap.ta`, `cap.mic`) moved into `#ice-cap-slot` / `#ice-mic-slot` on every rebuild, so text, caret and a running dictation survive `openSources()`; `stopDictation(!$("ice-cap"))` stops only dictation into fields that left the page. Anything else typed on the page must be carried over by hand, as `typed`, `iceDraft` and `cats` are.
- `matchMedia` and the document click listener are wired on the first `openSources()` (`wireOnce`), not at import: `cli/board.test.ts` loads the board modules with no window.

## Notes
<!-- yours: /kaizen docs never rewrites this section -->
