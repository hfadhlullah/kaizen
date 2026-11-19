# Motion

Read this at step 6, before building. SKILL.md's mood table picks how much a concept
moves (Calm, Rich, Cinematic); this file says when anything may move, and how.

## Two questions before any animation

**How often will a person meet it?**

| How often | Motion |
|---|---|
| Many times an hour: keyboard shortcuts, the command palette, main navigation, switching tabs, list rows | None |
| A few times an hour: hover, toggles, moving through a list | Colour or opacity only, 150ms or less |
| Now and then: a modal, a sheet, a toast, a settings panel | Standard motion, numbers below |
| Rarely or once: onboarding, an empty state, a first result, a finished goal | The only place for a longer moment or a playful bounce |

Anything started from the keyboard does not animate.

**What is it for?** Name one: feedback that an action landed, showing where something
came from or went, showing a state change, stopping content from jumping into place,
explaining something on a marketing or onboarding screen, or a moment of delight on a
rare screen. "It looks nice" on something seen often is not a reason. Figures and
charts a person reads to decide something do not move for style.

## Numbers

**Easing.** One curve for everything that enters or leaves:
`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`. One for things that move while staying on
screen: `--ease-move: cubic-bezier(0.77, 0, 0.175, 1)`. These two tokens are the whole
set; sheets use `--ease-out` too. Linear only for progress bars. Never
`ease-in`, never the bare `ease-out` keyword, no bounce or overshoot except in a
playful concept's one rare moment. Put the curves and durations in tokens; five
hand-typed curves that are almost the same is a finding.

**Durations.**

| What | Duration | Start state |
|---|---|---|
| Press on a button or card | 100 to 160ms | `scale(.97)` on `:active` |
| Hover | 150ms or less | colour or opacity only |
| Tooltip, small popover | 125 to 250ms | popover from `scale(.95)`, tooltip from `scale(.97)` |
| Dropdown or select | 150 to 250ms | from the trigger's edge |
| Modal | about 250ms, backdrop the same | `scale(.96)` and opacity 0, centred |
| Sheet or drawer from an edge | about 500ms | `translateY(100%)` or `translateX(100%)` |
| Toast | about 400ms | its own height off the edge it sits on |
| Page or section entrance on first load | 0.35 to 0.5s | rise 8 to 16px with opacity |

Exits are shorter than entrances (a 250ms enter leaves in about 200ms) and leave the
way they came. Nothing starts from `scale(0)`. Popovers grow from their trigger
(`transform-origin` at the trigger); modals grow from the centre.

**Groups.** One entrance per container: if the panel animates in, its children do not
also stagger. A stagger is 30 to 80ms between items, only the first five items step,
and the whole group lands within about 300ms in an app (up to 600ms on a marketing
screen). Vary the step by role rather than using one fixed delay. No stagger on
anything opened many times a day.

**Numbers that count.** A figure may count up once, the first time it is seen, over 400
to 800ms, with `font-variant-numeric: tabular-nums` so digits do not jitter. Never
again on refresh, tab switch or remount, and never a figure someone is reading to act on.

**Repeating motion.** Only for a small pointer that shows where to act: first after
about 2.5s, then every 6s, and it stops as soon as the person interacts. No pulsing
badges, glowing borders, drifting blobs or shimmer on real content. Anything that keeps
moving longer than 5s next to other content has a pause control.

## How to build it

- Animate `transform` and `opacity`. `clip-path` and a measured height for accordions
  are allowed. Never width, height, top, left, margin or padding, and never
  `transition: all`; name the properties.
- Content is visible at rest. A page whose text waits for a script to fade it in is
  blank when the script fails; hide start states only under a class the script adds.
- Hover effects live inside `@media (hover: hover) and (pointer: fine)`. A hover moves
  a child of the card, not the card itself, so it does not slide away from the pointer.
  One hover signal per element.
- Use CSS transitions for things that can be triggered again quickly (toasts, toggles),
  keyframes only for one-off sequences. `@starting-style` gives entrances with no
  script.
- `will-change` only on the element that is animating, and only after seeing a visible
  stutter.
- Variant and style switchers on the review page switch instantly.

## Recipes

Read only the recipes for components the concept actually has. Plain CSS and a little JS,
no library. Every recipe uses the tokens above:
`--ease-out`, `--ease-move`, and durations from the table. Write the settled state in
the base rule and describe the start state separately, so a failed script leaves
content visible.

**Press.** Fast on the way down, same speed back.

```css
.btn { transition: transform 160ms var(--ease-out); }
.btn:active { transform: scale(.97); }
```

`:active` is safe on touch screens. Disabled controls do not press.

**Hover.** Colour or opacity, inside the hover media query (see above). The change
lands in 150ms. Nothing on a row opened many times an hour moves at all.

**Tooltip.** Appears after a short wait of about 300ms so passing the pointer over a
toolbar does not flash everything. It fades in from `scale(.97)` over 125ms. Once one
tooltip is open, the next one in the same toolbar shows at once, with no delay and no
animation, then the wait returns when the pointer leaves the group. Hide it with
opacity only.

**Popover and dropdown.** Set `transform-origin` to where the trigger sits, for example
`top left` for a menu under a left-aligned button. Start at `opacity: 0` and
`scale(.95)`, land in 200ms. Items inside do not stagger. Close in about 150ms.
Libraries often expose the origin as a variable; read it instead of guessing.

**Modal.** The backdrop fades and the panel grows from `scale(.96)`, both over about
250ms, panel origin at the centre. Close is shorter. Trap focus and return it to the
opener; the animation never replaces that work.

```css
.modal { opacity: 0; transform: scale(.96); transition-duration: 250ms;
  transition-property: opacity, transform; transition-timing-function: var(--ease-out); }
.modal[open] { opacity: 1; transform: none; }
@starting-style { .modal[open] { opacity: 0; transform: scale(.96); } }
```

For a native `<dialog>`, also list `display` and `overlay` with `allow-discrete` so the
exit can play.

**Sheet or drawer.** Move by its own height or width, not a fixed pixel count, so it
works on any screen: `translateY(100%)` to `0` over about 500ms on the edge curve. A
small floating panel that does not touch an edge uses about 200ms instead. While a
sheet is open, the page behind may dim and shrink slightly, on the same clock.

**Toast stack.** A toast enters from its own height past the edge it sits on, 400ms,
with a transition so a second toast arriving mid-move retargets instead of restarting.
Older toasts slide up by the new one's height and sit slightly smaller and dimmer; only
the newest three stay visible. A toast leaves the way it came. Hovering the stack
pauses the timers. A toast that repeats something already on screen is not shown.

**Accordion.** Measure the content height in script, set it as a pixel value, animate
to it over about 200ms with a fade, then clear it. Animating to `auto` does not work in
older engines. Where `interpolate-size: allow-keywords` is available, it is allowed
with a fallback.

```js
const h = panel.scrollHeight;
panel.style.height = h + 'px';           // open
panel.addEventListener('transitionend', () => panel.style.height = 'auto', { once: true });
```

**Tabs indicator.** One underline or pill that slides between tabs. Move it with
`transform: translateX()` and `scaleX()` from the active tab's measured left and width,
250ms on `--ease-move`. Switching the panel content below is instant, or a plain fade
of 150ms, never a slide, because tabs are used often. To change the label colour as
the pill passes, stack a copy of the row in the active colour and reveal it with a
`clip-path` that follows the pill.

**List add and remove.** An added row fades in from `scale(.95)` over 200ms while the
rows below move down together. A removed row fades out at once and leaves layout
straight away, for example by being taken out of flow at its current position, so
siblings close the gap while it fades. Never reverse-stagger an exit. For a bulk
delete, collapse all rows at once.

**Page or view change.** Inside an app, switching a main section is instant. Where two
screens form a flow (a wizard, a drill-down, a detail view), show direction: forward
enters from the right and the old view leaves to the left, back reverses it. For small
similar views, an 8px shift with a fade is enough. For full screens on a phone, use the
platform's own push. Never replay the entrance of a view the person is returning to.
Avoid blur on big areas.

**Number change.** A value that changes while the person watches (a cart total, a
counter) swaps digits with tabular figures and a short vertical shift: the old digit
leaves up or down by about a third of its height and fades, the new one enters from the
opposite side, 200 to 250ms. Direction follows the change, up for more and down for
less. A value that changes on a timer or ten times a second does not animate.

**Skeleton or spinner.** Under about 300ms, show nothing: a flash of loading UI is
worse than a short wait. For a longer wait of a known shape (a list, a card, a profile),
use a skeleton with the same layout as the result so nothing jumps when it arrives. Use
a spinner only for an action with no shape, like a save, and place it inside the button
that started it. A skeleton may shimmer slowly, but the shimmer stops after 5s of
waiting or when the content is replaced.

**Hold to confirm.** For a destructive action that has no undo. A fill grows across the
button while it is held, then the action fires. Slow on the way in, quick on the way
out, so a released press feels cancelled at once.

```css
.hold::after { content: ""; position: absolute; inset: 0; background: var(--danger-tint);
  clip-path: inset(0 100% 0 0); transition: 200ms var(--ease-out); transition-property: clip-path; }
.hold:active::after { clip-path: inset(0); transition-duration: 2s; transition-timing-function: linear; }
```

Script the commit from `pointerdown` and a timer that `pointerup` and `pointerleave`
cancel. Keyboard users get a normal confirm step instead, because holding a key is not
a good ask. Say "Hold to delete" in the label.

**Drag to dismiss.** The panel follows the finger one to one. On release it closes when
the drag passed about 40 to 50% of its size, or when the release speed was above about
0.11px per millisecond, even if the distance was short. Otherwise it springs back.

```js
let t0, y0;
el.onpointerdown = e => { el.setPointerCapture(e.pointerId); y0 = e.clientY; t0 = e.timeStamp; };
el.onpointermove = e => { if (y0 != null) el.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; };
el.onpointerup = e => {
  const dy = e.clientY - y0, v = dy / (e.timeStamp - t0);
  y0 = null;
  (dy > el.offsetHeight * .45 || v > .11) ? close() : el.style.transform = '';
};
```

Turn the transition off while dragging and back on at release. Ignore a second touch
that lands mid-drag. Release should keep the speed of the hand: a fast flick finishes
fast, a slow let-go settles slowly.

## Choreography

A screen that has several things moving needs a director. Without one, everything runs
at once or everything runs in a line, and both read as noise.

**Roles.** Give every moving element one role.

| Role | Does | Typical move |
|---|---|---|
| Lead | The thing the eye should land on, moves first and furthest | rise 12 to 16px, opacity, 0.4 to 0.5s |
| Support | Explains or frames the lead, moves after it, smaller | rise 6 to 8px, shorter |
| Decoration | Adds mood, never needed to understand | fade only, or nothing |
| Static | Chrome and navigation | does not move |

Most groups end up with one lead and everything else still or nearly so. When all items
want to be the lead, none is, and the answer is to cut.

**Pairing.** How two moves relate in time.

- **Together** is the default. Two pieces that belong to one idea (a card and its
  shadow, an icon and its label) start at the same moment on the same curve.
- **Overlap** (a stagger) only when the order itself carries meaning, such as steps or
  a ranked list. The second starts before the first has finished.
- **Sequence** only when overlap would look broken, for example a tick that must appear
  after its box has drawn. Start the second move shortly before the first ends, not
  after a pause.

**Stagger rules.** 30 to 80ms between items, only the first five step, later items
share the fifth's delay, and the whole group lands within about 300ms in an app.
Marketing and first-run screens may step 100 to 150ms on 0.5 to 0.6s entrances. Do not
use one fixed step for everything: vary delay, distance and duration by role, and let
gaps shrink as the group goes on (for example 0, 120, then 200ms). Set the delay with a
custom property and `animation-fill-mode: both`, so a delayed item does not flash at
full opacity first.

```css
.in { animation: rise .4s var(--ease-out) both; animation-delay: calc(var(--i) * 50ms); }
```

Sub-animations of one component share one duration and easing family. Related elements
that move different distances should differ in duration only slightly.

**Interrupting.** Test every sequence by breaking it: click Next twice quickly, hover
out halfway through an entrance, close a modal during its open. Rules:

- Nothing blocks a click while it plays. Pointer events stay on.
- Each effect starts from the event that caused it, not from a timer started earlier.
- A new trigger cancels or reverses the running animation from where it is. CSS
  transitions do this on their own; for WAAPI, call `getAnimations().forEach(a =>
  a.cancel())` first or read the current value and start from it.
- A repeated action skips the build-up. The tenth open of a panel does not replay the
  intro.
- A container that resizes scales its fade by distance:
  `clamp(150ms, delta / 500 * 1000ms, 270ms)` is a fair guess, never longer.

## Performance

**What to animate.** Browsers can move, scale, rotate and fade a layer on the graphics
chip without redoing layout or paint. That is `transform` and `opacity`, and in
practice `clip-path` and `filter` on small areas. Everything else costs more.

| Tier | Properties | Cost |
|---|---|---|
| Composite | `transform`, `opacity` | cheap, runs off the main thread |
| Paint | colour, background, `box-shadow`, `border-radius`, `clip-path` | redrawn every frame; keep areas small |
| Layout | width, height, margin, padding, top, left, font size | reflows the page; never |

To move something, use `translate`; to resize, use `scale`. For an animated shadow,
fade a second element carrying the full shadow, or use `filter: drop-shadow`. A blur
animates only to about 20px, and 2 to 5px is usually enough; large blurs are slow in
Safari.

**will-change.** It reserves memory. Add `will-change: transform` to one animating
element, only after a visible stutter or a one-pixel jump when the animation starts or
ends, and remove it afterwards. Never on `*`, a whole page, or a big container.

**rAF versus CSS and WAAPI.** Use CSS transitions and keyframes for motion known in
advance. Use `el.animate()` for scripted motion that needs to be cancelled, reversed or
read. Both keep playing smoothly while the main thread is busy. A `requestAnimationFrame`
loop stops when the thread stalls, so keep it for what truly needs per-frame input: a
drag, a scroll-linked effect, a canvas. Inside such a loop, write `el.style.transform`
directly and keep no state that you do not need.

**Layout thrash.** Reading a size or position (`offsetHeight`, `getBoundingClientRect`)
right after a write forces the browser to reflow at once. In a loop it does that every
frame. Read everything first, then write everything. Do not drive many children from
one custom property set on a parent: changing it makes every descendant recalculate its
style. Set the transform on the element that moves.

**Frame budget.** 16.7ms at 60Hz, 8ms at 120Hz. Long lists are rendered only for the
visible rows. Turn off animations behind an open modal if they cost anything.

**Phone testing.** A fast laptop hides everything. Check the concept on a real phone or
with CPU throttled to 4x in the browser tools, play each animation at a quarter speed to
spot a stutter or a stray frame, and step through frames of the first 300ms. If a
prototype is reviewed in screenshots only, say so in the notes.

## Gestures and touch

- **Tap highlight.** Remove the default grey flash only when the control has its own
  pressed state: `-webkit-tap-highlight-color: transparent` plus the press from above.
- **Hover is for fine pointers.** A phone fires hover on tap and leaves it stuck. Put
  every hover effect inside `(hover: hover) and (pointer: fine)`, and never hide an
  action behind hover alone; touch needs it visible or reachable another way.
- **Targets.** At least 44px square on touch. Enlarge a small icon with an invisible
  `::before` instead of padding that moves the layout.
- **Follow the finger.** Direct manipulation has no easing delay and keeps working under
  reduced motion. Easing starts at release.
- **Friction at edges.** A panel dragged past its limit does not hit a wall. It keeps
  following with growing resistance, for example movement divided by `1 + overshoot /
  60`, and springs back on release. A wall feels broken; friction feels physical.
- **One gesture owner.** A horizontal swipe on a card inside a vertical scroller needs a
  direction lock after about 10px, or the page and the card fight. Use
  `touch-action` to say which axes the element handles.
- **Fast release.** Judge by speed as well as distance, as in drag to dismiss, so a short
  flick works.
- **Pointer capture** on the dragged element, so the drag survives leaving its bounds.

## Worst-case data

Motion does not hide broken layout, and layout is not tested on perfect data. The full
list sits in the Finish tier of `slop-check.md`. Before capturing screenshots, try
every animated list, card and panel with: a very long name, a one-letter name, a long
unbreakable email, counts of 0, 1 and 1,284, an empty list, text 30% longer (another
language), a missing image, and a hundred rows. Animated things must still land in the
right place with these, and a stagger must still end within its cap.

## Reduced motion

Under `prefers-reduced-motion: reduce`, movement goes and meaning stays: drop
translation, scale, bounce and stagger delays; keep opacity, colour and state changes,
at about 150 to 200ms. A group appears at once. A sheet fades instead of sliding.
Dragging with a finger still follows the finger.

## Check before the slop review

- Every animation has a reason from the list above.
- Nothing animates on a keyboard action or a many-times-an-hour surface.
- Only the tokens above are used; no `ease-in`, no `transition: all`, no `scale(0)`.
- App interactions finish within 300ms, except modal, sheet, toast and entrances.
- Exits are faster than entrances.
- Buttons and tappable cards press to about `scale(.97)`.
- Hover motion sits inside the hover media query.
- One entrance level per container; staggers within the caps.
- A reduced-motion block exists and keeps opacity.
- No infinite loop except a small pointer that stops on interaction.
- Every start state ends visible when motion is off or a script fails.
- Screenshots are taken after entrances finish, or with reduced motion on.
- Figures, charts and tables a person reads do not move for style.
- No spinner or skeleton for a wait under about 300ms; a skeleton matches the final layout.
- Popovers start at their trigger, modals at the centre; no entrance from `scale(0)`.
- Each moving element has a role; there is one lead per group, and decoration only fades.
- Stagger steps vary by role and the group lands within its cap; none on frequent surfaces.
- Interrupting an animation midway (double click, quick close) leaves a clean state.
- Nothing blocks a click while it plays; repeat actions skip the intro.
- Only `transform` and `opacity` run per frame; no layout properties; `will-change` is rare.
- No per-frame layout reads right after writes; no hand-run loop for what CSS can do.
- Checked at 4x CPU slowdown or on a phone, and in slow motion for the first 300ms.
- Touch: hover effects only on fine pointers, targets 44px, no action reachable by hover only.
- Dragging follows the finger, dismisses on distance or speed, and has friction at its edges.
- A hold-to-confirm or other long press has a keyboard route and a cancel on release.
- Animated lists and panels were tried with worst-case data (`slop-check.md`, Finish tier).
- Variant switchers on the review page are instant.
