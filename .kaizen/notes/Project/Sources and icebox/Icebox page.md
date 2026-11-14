---
description: The board's Icebox page: capture box, boards bar, Cards | Sort, item menus, and the phone list with swipe
tags: [project, sources, web-board]
sources: [web/pages/icebox-page.tsx, web/components, web/lib/icebox/icebox.ts, web/lib/icebox/icebox-actions.ts, web/lib/icebox/icebox-store.ts, web/lib/icebox/icebox-view.ts, web/lib/icebox, web/html/board.html, web/board/views.ts, web/icebox.test.ts]
updated: 2026-11-14
---
# Icebox page

## In plain words
The page where you throw things into the icebox and sort them out: a box to type in, your collections, and your items as cards or as a fast list. Part of [[Sources and icebox]].

## Where it lives
- React since 2026-11-14 (run 2026-11-14-frontend-rewrite-phase1, phase 2): `web/pages/icebox-page.tsx` is drawn into `#icev` by the Board App (`web/pages/board/pages.tsx`, `Once`) the first time `go("sources")` runs. It is a page of its own (the old one was drawn into the docked run panel, `#pbody`, and rebuilt by `openSources()` after every action); `sources` is in `AREA` in `views.ts`, so the panel closes as it does for Tasks. The header title, the project pickers (`#proj`, `#showc`) and the `body.ice` class are still the board's.
- Layers: pieces in `web/components` (`capture-box`, `request-row`, `request-card`, `request-phone-row`, `request-detail`, `promote-form`, `reply-box`, `request-actions`, `kind-menu`, `board-menu`, `snooze-menu`, `choice-menu`, `collection-dialog`, `bulk-bar`, `swipe-deck`, `source-drawer`, `source-card`, `source-form`, `service-chip`, `favicon`, `project-mark`, `mic-button`, `segmented`, `filter-popover`, `picker`); the drawer is `ui/sheet`, the write-back and auto-gather switches `ui/switch`. Rules in `web/lib/icebox/icebox.ts` (types, `deriveIce`, `catOf`, `stepPast`, words), requests and toasts in `icebox-actions.ts`, page state in `icebox-store.ts` (Zustand), clicks in `icebox-view.ts`, data in `hooks/use-icebox.ts`, keys in `hooks/use-ice-keys.ts`, gestures in `hooks/use-card-drag.ts` and `use-row-swipe.ts`.
- Data: `GET /sources[?dir=]` through `refreshIce()`: one request at a time, a stale answer dropped, refetched on `kz-changed` (live.ts dispatches it on every `changed` event), `kz-state` (a project switch) and `kz-shown` (the "Showing" picker, `setShown()`). Nothing is held back while a menu is open: React redraws in place.
- What survives leaving the page lives in the store: filters, view (`kz-ice-view` per browser; a card's text switches to Sort for the visit only), checked items, open item, the capture text, files and picked collection, the add-source draft. The cursor (`cur`) is the row `j`/`k` walk and the row whose actions show; focus or a click on a row sets it, so a menu opened from it keeps its trigger visible.
- Keys: `keys.ts` calls `react.iceKeys(e)` first while `view === "sources"`; it ignores keys while a text field or an open Radix popup (`data-state=open`) has them.
- Dialogs the old page asked with `modal()` / `confirm()` are `collection-dialog` and `confirm-dialog`, asked as promises from `icebox-actions.ts` (`askCollection`, `askConfirm`) and drawn by the page from `store.ask`. "Connect Google first" is a toast, not an `alert()`.
- Dictation is `web/lib/dictation` (the engine, a worker and the microphone) and the file shrinker stays the board's (`host.dataUrls`): `MicButton` (`components/shared`) draws the dictation button from the lib's per-button state and stops it with the page; the capture textarea is uncontrolled (dictation types into it and sends an input event).
- Styles: Tailwind in the components; the only legacy CSS left is the `#icev` container rule and `body.ice .hdr #showc` on a phone in `web/html/board.html`. Kind colours are theme names (`text-kind-client|finding|people`, `bg-promote`) in `web/ui/theme.css`.
- Routes: `/sources`, `/icebox` (ops add, promote, dismiss, restore, snooze, unsnooze, kind, board, boards, task-draft), `/reply`, `/chatgpt`, `/google`, `/ice-image` ([[Web board/Server and routes]]); unchanged by the rewrite.

## Watch out
- A phone (<= 640 px) never reaches this page: `go()` sends `sources` to Home when `isPhone()`. The phone rows, swipe-by-drag and the full-screen swipe deck are kept (`request-phone-row`, `use-row-swipe`, `swipe-deck`) but only a test renders them; they were last proven on a device before the rewrite.
- `lib/core/toast.ts` gives every toast its own id and dismisses the previous one: sonner keeps the old timer when a toast is replaced under the same id, so a message sent shortly before the old one ends vanished with it.
- `deriveIce` returns the filters as they hold (an unknown board, category or source cleared); the page writes them back, as the old page did, so a filter that comes back later does not reapply.
- Bulk actions, `j`/`k` and select-all act on the current page only (`store.order`); Swipe covers every filtered request (`store.deck`).

## Notes
<!-- yours: /kaizen docs never rewrites this section -->
