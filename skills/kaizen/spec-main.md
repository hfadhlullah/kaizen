# Kaizen — main thread

Read with [`spec.md`](spec.md) (core: track, intake, resume). Backlog bookkeeping and
the final approval. No subagent reads this file.

---
## Backlog

Every run produces work it deliberately does not do. Three sources, all already
written down by the time a run ends:

1. Out of scope suggestions the planner listed and the user did not fold into the
   approved scope.
2. Findings below `auto_fix.min_severity`, and findings the fix loop could not close.
3. Debts deferred at an approval because they fell outside the approved scope.

Without capture these survive only in the conversation that produced them.

`backlog.enabled: false` skips both capture points — the `02-approval.md` append at
plan approval and the `06-backlog.md` append at final approval — for that run. The run
still executes normally; it simply ends without a backlog file.

**Where it lives.** Each run holds its own backlog at `runs/<id>/06-backlog.md`, beside
the plan and the review that produced the items. There is no central backlog file to
keep in sync, and no copying: provenance is the directory the item sits in.

`<state.dir>/backlog.md`, beside `memory.md`, exists for exactly one purpose — an
orphanage. Before `state.keep_runs` prunes a run directory, that run's **open** items
are moved into it, so pruning never destroys outstanding work. Items already `done` or
`rejected` are pruned with their run. Nothing else is ever written there, and
`06-backlog.md` is never replaced by it.

`/kaizen backlog` reads `<state.dir>/backlog.md` as well as every
`runs/*/06-backlog.md`, and prints its open items last, under an **Orphaned** group —
otherwise a rescued item would be invisible to the only command that lists outstanding
work. Orphaned items count towards the open backlog count `/kaizen status` reports.

An abandoned run — `stage: "abandoned"`, set by `/kaizen abort` — is not open work. Its
`06-backlog.md` is left as it stands, and its items are neither printed by `/kaizen
backlog` nor counted.

**Item format.** One item per line:

```
- <status>: <item text> | <reason>
```

`<status>` is `open`, `done`, or `rejected`. A finding moved into the backlog keeps the
reviewer's line verbatim — `<where>: <severity>: <problem>. <fix>.` — so nothing is
rewritten in transit. `rejected` requires a reason after `|` on the same line; "not
doing this" with no reason is how the same suggestion returns three runs later. `done`
may carry a reason the same way, and usually names the run that closed it.

Items are appended, never deleted. Closing an item means editing its status in place;
it stays in its run's file as record. `/kaizen backlog` prints `open` items only, so
the active list is bounded by what is genuinely outstanding rather than by history.

Because a `<where>` reference must still resolve after its run closes, it is written as
a path relative to the repository, not to the run directory.

**Who writes it.** The main thread, at two file writes that already happen
unconditionally:

| Capture point | Stage | What gets appended |
|---|---|---|
| Writing `02-approval.md`, when the decision is an approval | Plan approval | Every out-of-scope suggestion not folded into the approved scope, and anything cut from scope at the approval |
| Setting `stage: "done"` | Final approval | Findings still open, findings below the fix threshold, and out-of-scope notes the builder wrote into `03-impl.md` |

Neither is optional and neither is a separate step to remember — a run cannot finish
without touching both files.

No subagent writes the backlog. The reviewer runs *before* the fix loop and cannot know
which of its findings will be closed; it would log items that get fixed minutes later.
The planner is not present at the approval where its suggestions are accepted or
declined. This also keeps the workflow working under adapters where there are no
subagents at all.

---

## Final approval

Controlled by `approvals.review`, skipped in `auto`.

Report: what was built, verification results, findings fixed, findings still open,
and anything the builder noted as out of scope. Then stop. Committing, pushing, or
opening a pull request happens only if the user asks.

**Open findings are offered by number.** List them with the reviewer's numbering
intact and let the user name which to fix — "fix 2 and 5". A number not named is not
touched, and goes to the backlog as `open` like any other deferred item. This is the
same granularity the fix loop already works at; the only change is that the user
picks the subset instead of accepting or declining the whole review.

Before setting `stage: "done"`, append the same three categories just reported —
findings still open, findings below the fix threshold, and the builder's out-of-scope
notes from `03-impl.md` — to `runs/<id>/06-backlog.md`, each as `open`, in the format
given in *Backlog* above. Every input is already assembled at this moment; the only
change is that it is written down rather than spoken and discarded.

Set `stage: "done"` in `state.json` once the user accepts.

---
