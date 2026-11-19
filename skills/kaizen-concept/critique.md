# Critique

Read this at step 7, after `slop-check.md`, as the fresh reviewer. The slop check finds
what must not ship. This critique judges whether the concept is good: usable, specific
and easy to read. It does not replace the slop check and does not change its Floor,
Reflex or Finish tiers.

You are a stranger to the build. You see the screenshots, the HTML, the concept card,
`picks.md` and these files, never the build conversation. Judge what is on screen, not
what was meant.

Ideas here are adapted from the Impeccable design skill by Paul Bakaus (Apache-2.0),
built on Jakob Nielsen's ten usability heuristics, rewritten for kaizen. See `CREDITS.md`.

## How it fits step 7

Step 7 answers with a verdict word first (`ship`, `fix` or `recapture`), at most 8
findings, and at most 2 rounds. This critique lives inside those limits.

- The **score is reported next to the verdict. It is not a gate by itself.** A
  concept never fails for a low total, and never passes for a high one. What gates is
  the same as before: a Floor item, a P0 or P1 finding, or a main flow that cannot be
  completed.
- Findings from this file and from the slop check share one list of 8, ranked by what
  they cost to fix. Do not write two lists.
- The score is one short table. It is not a second report.
- Round 2 re-scores only the heuristics whose findings were fixed and checks that no
  other score fell.
- A real interface usually lands between 20 and 32 out of 40. A concept scoring 40
  means you were not looking. A concept at 14 or below needs a different idea: say so
  in a note to the user beside the verdict, not as a polish round. `recapture` means only
  that the screenshots do not show enough to judge.
- Words the user fixed (a headline, a label, a product name) are never findings. Pass
  them to the user as suggestions only.

Work in this order: look at the screenshots first, form the judgement, then read the
HTML for evidence. Check only the screens the main flow uses.

## 1. Specificity verdict

Answer first, in one line: **could an unrelated product ship this unchanged?**

Swap in a competitor's name, colours and photos. If every screen still works, the
concept has no idea of its own. Name what is specific to this product in one sentence
(a mechanic, an image world, a metaphor, a data shape). If you cannot, say so.

Mark it as one of three:
- **Specific:** the concept has a clear idea only this product could carry, visible on
  the first screen.
- **Partial:** one screen is specific and the rest falls back to a template.
- **Generic:** the look and structure could be anyone's.

Generic is a finding of at least P1, because it defeats the point of a concept stage.
Brand rules the user gave count as the product's own. A concept still has to differ in
everything the brand does not fix.

## 2. Ten heuristics, scored 0 to 4

Score each from what you saw on screen. Give one line of evidence per score: the screen
and the element. Use the same scale for all ten.

| Score | Meaning |
|---|---|
| 0 | Missing or broken. A person cannot get the benefit, or is harmed. |
| 1 | Weak. Most people hit trouble; the main path survives only by luck. |
| 2 | Partial. Works for the happy path; clear gaps at edges or on other screens. |
| 3 | Good. Small gaps, none that stop a task. |
| 4 | Excellent. Hard to improve; no real gap found. |

Do not give a 4 without evidence. Do not score down for something the concept does not
claim to do, but say what is out of scope.

1. **Visibility of system status.** The person always knows where they are, what is
   happening and what just happened. Check: progress with its number, a clear current
   tab, loading and saved states, a result shown where the eye already is.
2. **Match with the real world.** Words, icons and order follow the person's own
   language and market, not internal terms. Check: labels a first-time user knows,
   plausible local names and amounts, units and dates in the right format.
3. **User control and freedom.** A way out of every state: Undo, Cancel, Back, Esc, a
   visible close. Check: no dead ends, no trap in a modal, reversible actions undoable.
4. **Consistency and standards.** The same thing looks and acts the same everywhere,
   and the platform's own patterns hold. Check: one button recipe, one icon family,
   navigation placed where the platform puts it, tokens used rather than one-off values.
5. **Error prevention.** The design stops mistakes before they happen. Check: sensible
   defaults, constraints on inputs, a confirm only where an action cannot be undone,
   a destructive control kept away from a common one.
6. **Recognition over recall.** What a person needs is visible, not remembered. Check:
   labelled icons, visible options, recent items, context kept between steps, no
   hidden gestures as the only route.
7. **Flexibility and efficiency.** Fast routes for frequent use without confusing a
   first-timer. Check: shortcuts shown in menus, defaults, search, bulk actions.
   `[landing]` Often not applicable: mark n/a and score out of the lower total, for
   example 24 out of 32.
8. **Aesthetic and minimalist design.** Every element earns its place. Check: one
   primary action, one idea per screen, no decoration without a job, the squint test
   passes. This is where simplifying from `craft.md` shows.
9. **Help recognise, diagnose and recover from errors.** Errors say what happened, why
   and what to do, beside their source, in plain words, with the input kept. Check the
   error state of the main form or action.
10. **Help and documentation.** Guidance sits where it is needed and stays short:
    empty states that teach, hints at the moment of use, no long onboarding. Often not
    applicable on a landing page; mark n/a.

**Bands.** Out of 40 (or the lower total when some are n/a, scaled to 40): 36 to 40
excellent, 28 to 35 good, 20 to 27 acceptable, 12 to 19 poor, 0 to 11 critical. Report
the number, the band and the three lowest heuristics. That is all the score is for: it
tells the builder where to look.

## 3. Cognitive load

Check these eight on the screens the main flow uses. Each is pass or fail. Three or more
fails is a finding.

1. **One focus.** A single thing is clearly the first to look at.
2. **Chunked.** No group holds more than about four items without a break or a heading.
3. **Grouped.** Related things sit close, and unrelated things have visible space
   between. Distance, not boxes, does the work.
4. **Hierarchy.** The order of importance reads in under a second. The squint test
   confirms it.
5. **One decision at a time.** A step asks one question, not three.
6. **Few visible options.** No more than four choices at a decision point; more go
   behind a clear entry.
7. **Light on memory.** The person never has to remember a value from a previous
   screen. It is shown again where needed.
8. **Disclosed in layers.** Advanced or rare things sit behind one obvious entry, no
   deeper than two levels.

Also check the **emotional arc**: how the first screen feels, the moment of the main
result, and the last screen. People remember the peak and the end. A flat middle is
fine; a generic "Success!" at the end is a finding.

## 4. Personas on the main flow

Walk the main flow from the first screen to the result as 2 or 3 people. Choose from
this table the ones the concept's audience actually contains. Do not use all of them.

| Persona | What they do | What breaks for them |
|---|---|---|
| **First-timer** | Reads every label, hesitates, does not know the product's terms | Jargon, unlabelled icons, a first screen that does not say what this is |
| **Power user** | Uses the keyboard, wants speed and density, repeats the action often | Forced steps, no shortcuts, motion on frequent actions, wasted space |
| **Distracted mobile user** | One thumb, on the move, interrupted, bright light, poor signal | Small targets, hidden actions at the top, lost state on interruption, low contrast |
| **Accessibility user** | Keyboard only or a screen reader, or large text, or reduced motion | Missing focus, colour-only status, unlabelled controls, motion that cannot stop |
| **Sceptical buyer** `[landing]` | Looks for proof before trust | Invented numbers, vague claims, no real product screen, a hidden price |

For each persona write one line: the step they get stuck at, and why. Say "no trouble
found" when that is true. A persona walk with no named step is not a walk.

Tie these to checks you can see. The accessibility user: tab through the main flow in
the HTML and read the order. The mobile user: look at the 390px screenshot and ask
whether the main action is in thumb reach and 44px or larger.

## 5. Severity

Every finding carries one tag.

| Tag | Meaning | Effect on the verdict |
|---|---|---|
| **P0** | Blocks the main flow, or misleads about what happened. | `fix`, always. |
| **P1** | Major. A person would contact support or give up. Also a generic concept. | `fix`. |
| **P2** | Minor. A workaround exists. | Reported. Fixed when cheap. |
| **P3** | Polish. | Reported only, and kept few. |

A quick test: would a user write to support? Then P1 at least. A Floor item from
`slop-check.md` is P1 unless it also blocks the flow, which makes it P0. Use the
slop check's tier for its own items and the severity above for the rest. Never invent a
P0 to make a point. Prioritise ruthlessly: with 8 slots, a P3 must not take a place a
P1 needs.

## 6. Output shape

Keep it short. The verdict word comes first and nothing precedes it.

```
ship | fix | recapture

Score 27/40 (acceptable). Lowest: 6 Recognition 1, 5 Error prevention 2, 9 Errors 2.
Method: fresh subagent, screenshots first, then HTML. (Say "single context" if so.)
Specific: Partial. The workout dial is specific; screens 3 to 5 are a template.

Working: (2 or 3 short lines, what to keep, so a fix does not dilute it)

Findings (worst first, at most 8 in all, shared with the slop check):
1. P0 [app] Screen 4, "Save": button does nothing; no state shows. Heuristic 1. Fix: ...
2. P1 [all] ...

Personas: First-timer stops at screen 2, the term "streak" is not explained.
Power user: no trouble found. Mobile: main action sits at the top, out of thumb reach.

Cognitive load: 6 of 8 pass. Fails: 3 grouped, 6 few options.
Do not dilute: (one line on what a fix must keep.)
```

Rules for the text:
- Name the exact element and screen. "The header is cluttered" is not a finding. "Screen 2
  carries five filters in the top bar" is.
- Each finding says what is wrong, which heuristic or rule it breaks, and the fix in one
  clause. Do not say "consider".
- One line each. No praise padding, no vague advice.
- Do not make findings out of what the concept card says it does not cover.
- Do not fix anything. The reviewer never edits the work.
- One open question for the user is allowed at the end, only when a real choice is
  theirs, such as a brand rule the reviewer cannot judge.

## 7. Round 2

After the builder fixes findings, check once more with new screenshots:
- Each finding: `resolved`, `partial` or `unresolved`, in a few words.
- Re-score only the heuristics that were touched. Report the new total next to the old.
- If a fix made something else worse, that is a new finding and takes a slot.
- Verdict again, first word. What is still open goes in the report to the user. Do not
  start a third round.
