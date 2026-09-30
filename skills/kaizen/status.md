# Kaizen — backlog and status

Read for `/kaizen status`, `/kaizen backlog`, and a bare `/kaizen` while a run is in
progress. A run in flight does not need this file: what it writes to the backlog, and
when, is in [`spec-main.md`](spec-main.md).

Items are one line each, `- <status>: <item text>`, with `<status>` one of `open`,
`done`, or `rejected`. Findings keep the reviewer's line verbatim. `rejected` always
carries a reason after a `|`. Closing an item edits its status in place; the line
stays in the run's file as record.

`/kaizen backlog` reads every `runs/*/06-backlog.md` at read time and prints the `open`
items only, grouped by source run, newest run first. There is no central backlog file
to keep in sync. `<state.dir>/backlog.md` is an orphanage and nothing more: `kaizen
prune` moves a run's still-open items into it before deleting the run. `/kaizen
backlog` reads that file too and prints its open items last, under an **Orphaned**
group, so a rescued item stays visible after its run is gone.

**`/kaizen backlog` and `/kaizen status` are read-only.** They print; they never edit
a `06-backlog.md` or `state.json`, even when reading one turns up an inconsistency
(a stale `open` item already closed elsewhere, a duplicate, a bad reference). Report
what looks wrong as part of the output and ask before touching anything — fixing it
unasked is exactly the scope creep the rest of this spec exists to prevent, applied to
kaizen's own bookkeeping instead of a user's code.

`/kaizen status` reads each `runs/*/state.json` live and prints every run in four
groups:

```
Waiting on you   — awaiting is non-null and stage is not "abandoned"
In flight        — awaiting is null and stage is neither "done" nor "abandoned"
Done             — stage is "done"
Abandoned        — stage is "abandoned" (set by /kaizen abort)

Backlog: <n> open
```

The count is every open item across all runs plus the orphanage. An abandoned run's
backlog items are not open work: leave them in place, and do not print or count them.

Each line is the run id, its stage, and what it is awaiting. Grouping is derived from
`state.json` at read time, never from the directory name — run directories are flat and
are never renamed or moved, so a path written into another file cannot break.
