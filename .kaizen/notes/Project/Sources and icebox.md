---
description: Request sources, gather, the icebox, kaizen's browser for social posts, and ChatGPT judging them
tags: [project, sources]
sources: [cli/sources.ts, cli/writeback.ts, cli/google.ts, cli/chatgpt.ts, cli/browser.ts, skills/kaizen/gather.md, skills/kaizen/discover.md]
updated: 2026-10-23
---
# Sources and icebox

## What it does
Shared links (sheets, docs, social searches) kaizen reads for requests; each request lands in the project's icebox until someone promotes it to an idea. Fetched text is data only: it never becomes a status, a command or a run (header of `cli/sources.ts`). Social sources are read by kaizen's own headless browser (`cli/browser.ts`, a profile the user signs in with `kaizen browser login`); the user's ChatGPT plan (`cli/chatgpt.ts`) or the agent via `/kaizen gather` picks which posts fit. A gathered post can be answered from the Icebox: ChatGPT drafts (`draftReply`, in a style from `REPLY_STYLES`; Regenerate passes the old draft as `avoid`), the user edits and approves, and the browser posts it (`sendReply`). User guide: `docs/guide.md` ("Request sources").

## Where it lives
- `cli/sources.ts` — sources, fetching, `sift` (sheet parsing), the icebox. Images: an icebox item's `images` (https links, max 4) sit outside its dedup key; sheets read them from `htmlview` by row number, docs from the html export by line, agents and `--posts` pass `img <url>` tokens in notes (`takeImages`). Google image links expire (403 later), so the board never opens a kept link: `GET /ice-image?dir&id&i` (`cli/web.ts`) reads the source again via `freshImages` and redirects to the fresh one.
- Items typed by hand: the Icebox bar's Add button posts `/icebox {op:"add", text}`; `addItem()` stores it as `source: "manual"`, deduped by the same row key as gathered items. In All projects it goes to the first project shown.
- `cli/browser.ts` — finds Chrome/Chromium/Edge, drives it over the DevTools protocol (Bun `WebSocket`, no dependency), reads posts by their links (`POST`), `login()`; `postLink()` and `sendReply()`/`replyOn()` post a reply (selectors per platform in `REPLY`). Its fixed waits (page settle, scroll passes, reply confirm) go through `nap()`, scaled by `KAIZEN_BROWSER_PACE` (default 1); `cli/browser.test.ts` runs at 0.1.
- `cli/chatgpt.ts` — Sign in with ChatGPT, judging read posts by number, and `draftReply()`; both go through `ask()`, the one streaming Responses call.
- `skills/kaizen/gather.md`, `skills/kaizen/discover.md` — the agent side.
- Terminal: `kaizen sources|gather|icebox`, `kaizen gather --posts <link>` (what the agent judges), `kaizen browser login [platform]` in `cli/install.ts`.

## How it connects
- Panels and routes in the [[Web board]] (`/sources`, `/icebox`, `/reply`, `/chatgpt`).
- Promoted items become ideas on the board, and ideas start [[Workflow]] runs. A promoted item stays in the Icebox list (tagged `promoted`); `markDone()` (run on each `GET /sources` and by the write-back timer) sets it `done` once a done run has a request line equal to its idea, and done items sit under the Done category beside Dismissed.

## Watch out
- Social gathers judge posts against what the project is for: `about()` in `cli/chatgpt.ts` sends the README (else the notebook Index), first 1500 chars, to ChatGPT; `gather.md` tells the agent the same. Without either, it falls back to generic "asks for something".
- ChatGPT answers only post numbers (`{ keep: [...] }`); the icebox text is the post's own as read. Never let the model write request text.
- The browser only opens the source link and post links on its platform or host (`readPage`); post links are found by URL shape, not CSS classes, so a platform redesign breaks less.
- `~/.kaizen/browser/` holds live sign-in cookies (0700). A visible login window locks the profile; a read meanwhile says to close it.
- The timed gather (`sources.every`) reads social sources through ChatGPT when `sources.agent` is `chatgpt` and it is connected; otherwise it skips them and only Gather reads them. TikTok often lays a closable captcha over posts it already shows: `readPage` clicks `#captcha_close_button` and reads on, failing only when no posts come through. Instagram opens each post page, so a 40-post read takes ~3 minutes.
- A source's "Auto gather" switch off sets `paused: true` in `sources.json` (`setPaused`, POST /sources `op: "paused"`): the timed gather skips it; Check now and Gather still read it.
- A source whose `seen` list is empty reports "no requests found", never "nothing new" (`record()`).
- A `github.com/<owner>/<repo>/issues` link is read from the public API (`exportUrl` kind `github`, `fetchText(..., json)`): open issues, pull requests dropped, notes `#n · link` only so an edited body is not a new item. Private repos answer 404; the 60/h unauthenticated limit answers 403 (shown as the sign-in note).
- `readPage` stops after 3 scans with nothing new only once some post was seen; an empty page scans all 12 rounds (~20 s), since TikTok can render its search late.
- `sift` finds a sheet's header by shape; test any change against a fixed set of sheet shapes, old vs new side by side (`.kaizen/memory.md`). A row with a blank first cell and blank status takes the status of the row above: the TSV export leaves merged NO/STATUS cells blank below their top row.
- A named request column (`DETAIL`) loses to a column holding over 3× its request-like text in open rows: some sheets name the page in `DETAIL` and write the request in `NOTES`.
- The Sources panel rebuilds on every action; controls need an id and an explicit step (`.kaizen/memory.md`).
- The Sources drawer stays shut until asked for (`srcShow`), even with no sources; the empty Icebox then says what it is for and offers Add a source, which opens the drawer.
- The Add a source form sits at the top of the Sources drawer, collapsed behind the header's Add button (`srcAdd`) once a source exists; it stays open across rebuilds while any field holds text, and closes after a successful add.

- Reply styles: only `promo` and `helpful` send the README to ChatGPT, so `casual`/`fun` cannot name the project. The style from the client is checked with `Object.hasOwn` (a plain lookup lets `constructor` through). The board keeps the style per project (`kz-reply-style:<dir>`) and shows the picker and Regenerate only when ChatGPT is connected.
- Replying posts publicly and cannot be undone. `/reply` `draft` writes nothing; only `send` with the user's text posts, and pressing the platform's send button stamps `replied` on the item even when the page never confirmed, so a retry cannot double post. `REPLY` selectors in `cli/browser.ts` are per platform and break on a redesign; the fixture test only covers the X shape. Threads replies in the inline composer under the post: its send is an icon button (`svg[aria-label="Reply"]`) that appears only once text is typed; there is no "Post" button unless the composer is expanded (issue #6). `FIND` looks for the send button nearest the box first (walking up from `[data-kaizen-box]`), then the last dialog, then the page.

- `cli/writeback.ts` / `cli/google.ts` — closing the loop. `writeBacks()` (run by a 60 s timer in `cli/web.ts`; page loads only read) reports each done item (`run`, `row` kept by `ingest`) to its source when `Source.writeback` is on: GitHub via `gh issue close --comment` (args as an array), sheets via the Sheets API (re-reads the row and compares its text first, finds or adds the `Status` header). `written` / `writeError` live on the item; failures retry, successes never repeat. Google OAuth uses the user's own Desktop client (`~/.kaizen/google.json`, 0600), set in Settings → Google; routes `/google`, `/google-callback`.

## Notes
<!-- yours: /kaizen docs never rewrites this section -->
