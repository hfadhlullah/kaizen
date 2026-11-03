# UI/UX rules for clickable concept prototypes

Legend: [V] = read from the cited page this session. [P] = proposed heuristic by the researcher, not stated by a source (treat as unverified). "unverified" = could not confirm from a source.
Fetch notes: Apple HIG pages are client-rendered; text was read from Apple's own JSON endpoint `https://developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json` (same content as the HIG page). m3.material.io is a client-rendered SPA and returned no body; Material facts below come from Google's own `material-components-android` docs and developer.android.com, which implement M3. Fluent 2 desktop facts come from learn.microsoft.com (Windows app design) because fluent2.microsoft.design has no desktop-window page.

---
## 1. Universal rules (all platforms)

| # | Rule (checkable) | Number | Source |
|---|---|---|---|
| U1 | Body text contrast >= 4.5:1; large text (>=18pt or >=14pt bold, ~24px / ~18.5px bold) >= 3:1. Check light and dark separately. | 4.5:1 / 3:1 | WCAG 1.4.3 https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html ; Apple HIG accessibility (same 4.5:1, check both appearances) https://developer.apple.com/design/human-interface-guidelines/accessibility [V] |
| U2 | Icons, input borders, control states needed to identify a control: >= 3:1 against adjacent colour (disabled exempt). | 3:1 | WCAG 1.4.11 https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html [V] |
| U3 | Pointer targets >= 24x24 CSS px (AA floor); design to 44 (iOS/web touch) / 48 (Android). Smaller visuals get a padded hit area. | 24 / 44 / 48 | WCAG 2.5.8 https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html ; Apple HIG accessibility (iOS default 44x44pt, min 28x28; macOS default 28x28, min 20x20) ; Fluent spacing page (44 iOS/web, 48 Android) https://fluent2.microsoft.design/layout [V]; Android 48dp + 8dp spacing (Google accessibility help via search summary) https://support.google.com/accessibility/android/answer/7101858 (summary only, page not opened) |
| U4 | Every focusable control has a visible focus state; a sticky header/bar must not fully cover the focused element. | AA | WCAG 2.4.11 Focus Not Obscured (Min) AA https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html [V]. 2.4.13 Focus Appearance is AAA, not required https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html [V] |
| U5 | Never convey state by colour alone (add icon, text, shape). | - | Android a11y principles https://developer.android.com/guide/topics/ui/accessibility/principles ; NN/g errors https://www.nngroup.com/articles/error-message-guidelines/ [V] |
| U6 | Respect `prefers-reduced-motion`; essential-only motion when set. (2.3.3 is AAA; Apple also requires Reduce Motion support.) | AAA | https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html [V]; https://developer.apple.com/design/human-interface-guidelines/accessibility [V] |
| U7 | Auto-moving content > 5 s next to other content needs pause/stop/hide. | 5 s | Vercel Web Interface Guidelines https://vercel.com/design/guidelines [V] (WCAG 2.2.2 is the underlying criterion; not fetched) |
| U8 | Feedback to any action <= 0.1 s feels instant; show a busy indicator for > 1 s; > 10 s needs percent-done + cancel. | 0.1 / 1 / 10 s | NN/g https://www.nngroup.com/articles/response-times-3-important-limits/ [V] |
| U9 | System response within 400 ms (Doherty threshold). | 400 ms | https://lawsofux.com/doherty-threshold/ [V] |
| U10 | Limit options at a decision point; highlight the recommended one; split big tasks into steps (Hick). Do not use "7" to justify arbitrary limits (Miller). | - | https://lawsofux.com/hicks-law/ ; https://lawsofux.com/millers-law/ [V] |
| U11 | Big, near targets for frequent actions; space between targets (Fitts). Primary action reachable near where attention already is. | - | https://lawsofux.com/fittss-law/ [V] |
| U12 | Use platform/industry conventions; users spend most time in other products (Jakob). Do not reinvent nav, forms, tab bars. | - | https://lawsofux.com/jakobs-law/ [V] |
| U13 | Design the peak moment and the ending (success screen, first result), and handle negative moments deliberately (Peak-End). | - | https://lawsofux.com/peak-end-rule/ [V] |
| U14 | Show system status, offer undo/exit, prevent errors, recognition over recall, minimal content, plain-language errors (the 10 heuristics). | - | https://www.nngroup.com/articles/ten-usability-heuristics/ [V] |
| U15 | One primary action per screen/view; secondary and tertiary visibly weaker. | - | Refactoring UI (review summary only) https://dev.to/updivision/book-review-refactoring-ui-by-adam-wathan-steve-schoger-2f7m (secondary; unverified against the book) ; Apple HIG buttons: full-width/prominent primary https://developer.apple.com/design/human-interface-guidelines/buttons [V partially] |
| U16 | Progressive disclosure: at most 2 disclosure levels; frequent needs on first display; one obvious path to the advanced stuff. | 2 levels | https://www.nngroup.com/articles/progressive-disclosure/ [V] |
| U17 | Icon-only controls carry an accessible name (aria-label / accessibilityLabel). | - | Android a11y principles above; Vercel guidelines [V] |
| U18 | Inputs have visible persistent labels; placeholder is a hint, not the label. | - | https://www.nngroup.com/articles/form-design-placeholders/ [V] |
| U19 | Spacing/size from one scale (4 px base, 8 for grouping gaps); icons on the same grid. | 4 px base | Fluent global spacing ramp https://fluent2.microsoft.design/layout [V]; Windows spacing (8 epx between buttons, 12 control-to-label/content areas, 16 surface-to-edge text) https://learn.microsoft.com/en-us/windows/apps/design/basics/content-basics [V] |
| U20 | Use <= 1-2 typefaces and a defined type scale; avoid Thin/Light weights at small sizes. | - | Apple HIG typography https://developer.apple.com/design/human-interface-guidelines/typography [V] |

---
## 2. Per platform

### 2a. Mobile app (iOS vs Android)

| # | Rule | Number | Source |
|---|---|---|---|
| M1 | iOS: default body 17pt, minimum 11pt. Android/web: base 16px; inputs >= 16px to avoid iOS Safari zoom. | 17/11pt; 16px | Apple typography [V]; Vercel guidelines [V]; Rauno https://interfaces.rauno.me/ [V] |
| M2 | iOS type scale at Large (Large Title 34, Title1 28, Title2 22, Title3 20, Body/Headline 17, Callout 16, Subhead 15, Footnote 13, Caption 12/11). | see left | Apple typography JSON page lists default/min only; the style table is **unverified** (model memory) |
| M3 | Tab bar / nav bar: top-level sections only, never actions; keep visible on all top-level screens (hide only under a modal). | - | iOS https://developer.apple.com/design/human-interface-guidelines/tab-bars [V] |
| M4 | Destination count: Material nav bar = 3-5 (impl. max 5). Apple gives **no number**, only "fewer is easier", avoid overflow "More" tab; customised lists aim for <= 5. NN/g: > 5 cramps targets, <= 4 top-level links show visibly. Use 3-5, prefer 4. | 3-5 | https://raw.githubusercontent.com/material-components/material-components-android/master/docs/components/BottomNavigation.md [V]; Apple tab-bars [V]; https://www.nngroup.com/articles/mobile-navigation-patterns/ [V]; https://www.nngroup.com/articles/hamburger-menus/ [V] |
| M5 | Tab labels: single words; one line; every tab has an icon + label (Material auto: labels on all when <= 3, selected-only when >= 4). Prefer filled icons on iOS. Don't disable/hide a tab when empty: explain why it is empty. | 1 word | Apple tab-bars [V]; Material doc above [V] |
| M6 | Badges: red oval, only for critical/new info; never decorative or non-notification numbers. | - | Apple tab-bars + notifications https://developer.apple.com/design/human-interface-guidelines/notifications [V] |
| M7 | Hamburger/hidden nav loses: mobile hidden-nav use 57% vs 86% combo; desktop tasks 39% slower. Keep primary nav visible on mobile. | 57% vs 86% | https://www.nngroup.com/articles/hamburger-menus/ [V] |
| M8 | Safe areas: nothing tappable under status bar, Dynamic Island, home indicator; fixed bars inset; background may bleed behind. | - | https://developer.apple.com/design/human-interface-guidelines/layout [V] |
| M9 | Modals/sheets: only when clear benefit; short single task; obvious dismiss; confirm only when data would be lost; one sheet at a time. iOS sheet: grabber if resizable, Cancel leading + Done trailing, swipe-down dismiss, Back must not dismiss; medium detent ~half height. | 2 detents | https://developer.apple.com/design/human-interface-guidelines/modality ; https://developer.apple.com/design/human-interface-guidelines/sheets [V] |
| M10 | Android bottom sheets: standard (no scrim, coexists) vs modal (scrim, blocks, tap-outside or drag dismisses); drag handle min 48dp. | 48dp | https://raw.githubusercontent.com/material-components/material-components-android/master/docs/components/BottomSheet.md [V] |
| M11 | Android FAB = the single primary/most common action on the screen; sits over content. Size: medium for compact/medium windows. (No max count stated by the doc.) | - | https://raw.githubusercontent.com/material-components/material-components-android/master/docs/components/FloatingActionButton.md [V] |
| M12 | Snackbar (Android) = brief message, may carry Undo/Retry, one at a time, never interrupts. iOS has no snackbar: use inline change, undo, or a banner; reserve alerts for actionable decisions. | 1 at a time | Snackbar doc https://raw.githubusercontent.com/material-components/material-components-android/master/docs/components/Snackbar.md [V]; https://developer.apple.com/design/human-interface-guidelines/alerts [V] |
| M13 | Alerts (iOS): title + optional message + up to 3 buttons; titles say what happened; buttons 1-2 words, verbs, not "OK" unless informational; destructive gets Cancel; no alert on launch; no alert for undoable actions or mere information. | <= 3 buttons | https://developer.apple.com/design/human-interface-guidelines/alerts [V] |
| M14 | Notifications: concise, no duplicates, no instructions to do tasks in-app, no sensitive data, no app name in body, sentence case, action buttons 1-2 words Title Case, not just "open app". | - | https://developer.apple.com/design/human-interface-guidelines/notifications [V] |
| M15 | Permission requests: in onboarding only if the app cannot function without it (and explain benefit), otherwise at first use of the feature. Ratings/purchase asks only after engagement. | - | https://developer.apple.com/design/human-interface-guidelines/onboarding [V]; NN/g https://www.nngroup.com/articles/mobile-app-onboarding/ [V] |
| M16 | Gestures never the only path (swipe-to-delete etc. needs a visible alternative). Destructive actions fire on gesture end, not mid-gesture. | - | Android a11y principles [V]; Rauno https://rauno.me/craft/interaction-design [V] |
| M17 | Show something immediately on load (skeleton/placeholder), let user do other things while loading. | - | https://developer.apple.com/design/human-interface-guidelines/loading [V] |
| M18 | Back is predictable and preserves state (ui-ux-pro-max Critical rule; no primary source fetched: unverified as a source claim). | - | local CSV, see section 7 |
| M19 | Phone frame in a prototype: 375-393 px wide viewport, status bar + home indicator drawn in safe areas. | 375-393 | **unverified** (common device widths; not from a source) |

### 2b. Web app (SaaS, dashboard, tool)

| # | Rule | Number | Source |
|---|---|---|---|
| W1 | Show top-level nav visibly (top or left); avoid hidden nav on desktop (27% use hidden vs 48% visible; tasks >= 39% slower). | 39% | https://www.nngroup.com/articles/hamburger-menus/ [V] |
| W2 | Support reflow to 320 px, 400% zoom without horizontal scroll, 200% text zoom without clipping. | 320 px | https://fluent2.microsoft.design/accessibility [V] |
| W3 | Hit targets >= 24px (44 on touch); expand hit area if the visual is smaller. | 24/44 | Vercel guidelines [V] |
| W4 | Forms: wrap in `<form>`, Enter submits; errors beside the field and focus the first error on submit; keep submit enabled until request starts, then disable + spinner; do not block keystrokes, show validation instead. | - | Vercel guidelines [V]; Rauno https://interfaces.rauno.me/ [V] |
| W5 | Error shown only after real input error, not on leaving an empty field; inline real-time feedback only for error-prone inputs. | - | https://www.nngroup.com/articles/error-message-guidelines/ [V] |
| W6 | Loading spinner/skeleton appears after ~150-300 ms and stays >= ~300-500 ms (avoid flash). | 150-500 ms | Vercel guidelines [V] |
| W7 | Mutations feel < 500 ms; update optimistically, roll back on error. | 500 ms | Vercel guidelines; Rauno [V] |
| W8 | Toggles apply immediately, no confirm. Success feedback inline near its trigger (e.g. checkmark), not a notification. | - | Rauno https://interfaces.rauno.me/ [V] |
| W9 | Hover styles only under `@media (hover: hover)`; do not change font weight on hover/select (layout shift). | - | Rauno [V] |
| W10 | Keyboard: arrow-key navigation in sequential lists, Cmd/Ctrl+Enter submit in textareas, skip link, visible focus ring. | - | Rauno; Vercel [V] |
| W11 | Dense tool UI: reduce visual noise, raise hierarchy and density of navigation, align labels/icons both axes, use darker text for contrast. | - | Linear https://linear.app/now/how-we-redesigned-the-linear-ui [V] |

### 2c. Marketing website

| # | Rule | Number | Source |
|---|---|---|---|
| S1 | LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1 at the 75th percentile (a static prototype should be built so these pass: explicit image dimensions, no layout shift). | 2.5s / 200ms / 0.1 | https://web.dev/articles/vitals [V]; images dims/preload/lazy: Vercel guidelines [V] |
| S2 | Put the most compelling content at the top; content just above the fold gets ~102% more views than just below; users treat above/below fold differently by 84%. Show a hint of content below (no "false floor"). | 84% / 102% | https://www.nngroup.com/articles/page-fold-manifesto/ [V] |
| S3 | Skimmed reading: users read ~20% of words; read half only on pages <= 111 words. Front-load key info; lead subheads/bullets with meaningful words. | 20% / 111 words | https://www.nngroup.com/articles/how-little-do-users-read/ ; https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content-discovered/ [V] |
| S4 | Place CTA/price where attention lands (F-pattern: top bar, shorter second bar, left stem; heavy attention upper right on product pages). The Z-pattern: **unverified**, no NN/g page read; do not cite as evidence. | - | F pattern page above [V] |
| S5 | Hero: static single hero beats carousel. If a carousel: <= 5 frames, no auto-rotate on mobile, key info repeated elsewhere, controls inside, ~3 words/s timing. | <= 5 frames | https://www.nngroup.com/articles/designing-effective-carousels/ [V] |
| S6 | Headline states what the product does, specific CTA label that names the outcome (not "Learn more"/"Get started"); link text specific. | - | https://www.nngroup.com/articles/ux-writing-study-guide/ [V] |
| S7 | Animation on marketing pages may be richer than app UI, but still honour reduced motion. | - | Emil Kowalski (marketing exception) https://emilkowal.ski/ui/you-dont-need-animations [V] |
| S8 | Heading sentence case on marketing (Vercel's own preference, not universal). | - | Vercel guidelines [V, brand-specific] |
| S9 | Breakpoints to verify: 320, 480, 640, 1024, 1366, 1920. | - | Fluent layout [V] (page has conflicting thresholds; verify) |

### 2d. Desktop app

| # | Rule | Number | Source |
|---|---|---|---|
| D1 | Windows title bar 32 px (48 px if search box or avatar is added); empty title-bar area is draggable; double-click toggles maximise; caption buttons (min/max/close) at right, always fully visible. | 32 / 48 px | https://learn.microsoft.com/en-us/windows/apps/design/basics/titlebar-design [V] |
| D2 | Commands: put constantly-needed commands on canvas near the content they affect; others in command bar, menu bar (when too complex for a command bar), or context menu. Too many on canvas overwhelms. Prefer direct manipulation (drag) over up/down buttons. | - | https://learn.microsoft.com/en-us/windows/apps/design/basics/commanding-basics [V] |
| D3 | Responsive window techniques: reposition, resize, reflow (1 col to 2), show/hide metadata, re-architect (list + detail on wide windows). 12-column grid, gutters multiple of base unit. | 12 col | https://fluent2.microsoft.design/layout [V] |
| D4 | Keyboard: focus order follows left-to-right/top-to-bottom, document it; focus is not lost when a dialog closes. Provide shortcuts for frequent commands; context menu on right-click. | - | https://fluent2.microsoft.design/accessibility [V]; commanding-basics [V] |
| D5 | macOS default text 13pt, min 10pt; macOS control default 28x28pt, min 20x20. Windows default control/touch size: **unverified** (40x40 epx from memory). | 13/10pt | Apple typography + accessibility [V] |
| D6 | Dialogs are disruptive: confirm only irreversible/major actions; use undo for deletes, edits, renames. | - | commanding-basics [V] |
| D7 | Spacing: 8 epx between buttons/flyouts/control-header, 12 control-label and between content areas, 16 surface edge to text; list icons 32 epx; Body + Caption in multi-line lists. | 8/12/16 | https://learn.microsoft.com/en-us/windows/apps/design/basics/content-basics [V] |
| D8 | Window title and text must scale with text-scaling; title bar may grow. | - | titlebar page [V] |
| D9 | Prototype frame: draw a window with title bar and caption controls, minimum size state, resizable behaviour for 2 widths. | - | [P] derived from D1/D3 |

---
## 3. States and flows

| # | Rule | Source |
|---|---|---|
| F1 | Empty state: (1) say whether loading/none/unavailable, (2) say what will appear and how to fill it, (3) give a direct action (button/link). Do not show "No records" while loading. Never blank. | NN/g https://www.nngroup.com/articles/empty-state-interface-design/ [V]; Apple tab-bars ("if a section is empty, explain why") [V]; Refactoring UI "don't overlook empty states" https://www.refactoringui.com/ [V] |
| F2 | Loading: show structure (skeleton/placeholder) right away; spinner only after ~150-300 ms, keep >= 300-500 ms; progress bar with % beyond ~10 s; 2-10 s use busy cursor + small counter; unknown total: name items as processed. | Apple loading https://developer.apple.com/design/human-interface-guidelines/loading ; NN/g response times ; Vercel [V] |
| F3 | Error: near the source, text not colour only, plain language, say what and how to fix, keep user input, positive tone (avoid "invalid/incorrect"), severity matches component (modal only for serious), no humour. | NN/g https://www.nngroup.com/articles/error-message-guidelines/ [V]; WCAG 3.3.1 (Level A: error identified in text) https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html [V] |
| F4 | Error title never "Error"/"Error 329347"; describe what happened, context, why. | Apple alerts [V] |
| F5 | Success: confirm inline near trigger or a brief snackbar/toast with Undo; peak-end: make the final screen of the main flow count (what happened + next step). | Rauno [V]; Snackbar doc [V]; Laws of UX peak-end [V] |
| F6 | Undo vs confirm: reversible = act + Undo (snackbar/toast); irreversible/major = confirm dialog naming the action ("Delete project"), Cancel as safe option; do not confirm routine actions (people click through). Undo is the stronger safeguard. | NN/g https://www.nngroup.com/articles/confirmation-dialog/ [V]; MS commanding-basics [V]; Apple alerts ("avoid alerts for common undoable actions") [V] |
| F7 | Onboarding: prefer none; test the app without it. If needed: short, optional/skippable, interactive, one concept per card, contextual tips at point of use, not shown again after skip but findable in settings, no licence text, postpone non-essential setup with sensible defaults. Justified only if app needs user data to start, depends on context, or a feature is unfamiliar. | Apple onboarding [V]; NN/g https://www.nngroup.com/articles/mobile-app-onboarding/ [V] |
| F8 | Feedback timing: < 100 ms press/hover feedback; < 400 ms response; > 1 s show activity. Press state 80-150 ms (ui-ux-pro-max pro-rules, local). | NN/g [V]; Doherty [V]; local CSV |
| F9 | Modal task flows: single path, no hierarchy of nested modals, always clear exit, confirm only if data would be lost. | Apple modality [V] |
| F10 | Prototype must show for the key flow: default (populated), empty, loading, error, success. At least one non-happy-path reachable by click. | [P], supported by F1-F5 |
| F11 | Disabled tab/nav items are an anti-pattern; keep them enabled with an explaining empty state. | Apple tab-bars [V] |
| F12 | Double-submit protection: disable button after submit, show spinner. | Rauno / Vercel [V] |

---
## 4. Copy and microcopy

| # | Rule | Evidence | Source |
|---|---|---|---|
| C1 | Assume skimming; users read ~20% of words, 25 s base + 4.4 s per extra 100 words; half read only on pages <= 111 words. So every extra sentence is mostly unread. | Quantified | https://www.nngroup.com/articles/how-little-do-users-read/ [V] |
| C2 | Front-load: first two words of headings/bullets carry meaning; key info in first two paragraphs. | Eye-tracking | https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content-discovered/ [V] |
| C3 | Microcontent stands alone, plain language, no puns/"cute"; page titles 40-60 chars. | NN/g | https://www.nngroup.com/articles/microcontent-how-to-write-headlines-page-titles-and-subject-lines/ [V] |
| C4 | Button/command labels state the outcome ("Delete project", "Save changes"), not "Submit", "OK", "Yes/No", "Get started", "Learn more". | NN/g + Apple | https://www.nngroup.com/articles/ux-writing-study-guide/ [V]; Apple alerts ("Avoid OK as default unless informational", 1-2 word verb titles) [V] |
| C5 | Alert/dialog button: 1-2 words, verbs; do not explain what buttons do. | Apple | https://developer.apple.com/design/human-interface-guidelines/alerts [V] |
| C6 | Tab labels: single words where possible. Notification action: short Title Case phrase. Notification: complete sentences, sentence case. | Apple | tab-bars, notifications [V] |
| C7 | Headings say where you are; command labels say what happens next. | NN/g | UX writing study guide [V] |
| C8 | Links: specific, sincere, substantial, succinct; a link is a promise. | NN/g | UX writing study guide [V] |
| C9 | Errors: specific, constructive, no jargon/codes, no blame words, no jokes. | NN/g | error-message-guidelines [V] |
| C10 | Placeholders end with "..." and show an example value; never the only label (7 usability problems listed). | NN/g, Vercel | form-design-placeholders [V]; Vercel [V] |
| C11 | Use numerals for counts ("8 deployments"), single ellipsis char, curly quotes, non-breaking spaces between number and unit; consistent decimals. (Vercel brand house style; partly preference.) | - | Vercel guidelines [V] |
| C12 | Realistic sample data (real-looking names, numbers, dates), never lorem ipsum. | local data | ui-ux-pro-max `ux-guidelines.csv` #87 (local) |
| C13 | Numeric copy budgets: heading <= 8 words, supporting line <= 20 words, button 1-3 words, helper/empty-state text <= 2 sentences, any block > 40 words needs justification. | **[P], unverified**; derived from C1/C4/C5 |  |
| C14 | One tone, constant across the product; test how copy makes users feel. | NN/g | UX writing study guide [V] |

---
## 5. Craft details (crafted vs generic AI output)

| # | Detail | Source |
|---|---|---|
| K1 | Commit to a distinctive, cohesive aesthetic: dominant colours + sharp accent beat timid evenly spread palettes; CSS variables; vary light/dark and fonts between projects; model "still converges on Space Grotesk". | Anthropic cookbook https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics [V] (note: community criticised the before/after examples; treat as a direction, not proof) |
| K2 | One orchestrated page-load moment with staggered reveals beats scattered micro-interactions. | Anthropic cookbook [V] |
| K3 | Atmosphere: layered gradients/patterns/contextual backgrounds instead of flat default fill. | Anthropic cookbook [V] |
| K4 | Hierarchy via weight, colour and spacing, not just size; de-emphasise secondary; avoid grey text on coloured backgrounds; labels last resort; one primary action. | Refactoring UI tips list https://www.refactoringui.com/ [V] |
| K5 | Fewer borders: use shadow, contrasting background, or spacing. Shadows: >= 2 layers; consistent light source; shadows convey elevation. | Refactoring UI [V]; Vercel guidelines (>= 2 layers) [V] |
| K6 | Define spacing and sizing system and a type scale up front; keep line length in check; line-height proportional to size; letter-spacing deliberate; "start with a feature, not a layout"; "don't design too much". | Refactoring UI [V] |
| K7 | Colour: more shades than you think, defined up front, greys may be tinted, do not rely on colour alone. | Refactoring UI [V] |
| K8 | Alignment precision users "feel after a few minutes"; perceptually uniform colour (LCH) so equal lightness looks equal; neutral timeless palette; content stands out because chrome is reduced. | Linear https://linear.app/now/how-we-redesigned-the-linear-ui [V] |
| K9 | Optical alignment: nudge +/-1px where geometry looks off; child radius <= parent radius (concentric). | Vercel guidelines [V] |
| K10 | Animate transform/opacity only; never `transition: all`; list properties. | Vercel guidelines [V] |
| K11 | Interaction animation <= 200 ms (Rauno) / UI < 300 ms (Emil); dialogs scale from ~0.8-0.96 not 0; button press scale ~0.96-0.97 on :active, 150 ms. | Rauno https://interfaces.rauno.me/ ; Emil https://emilkowal.ski/ui/you-dont-need-animations ; Easing blueprint https://animations.dev/learn/animation-theory/the-easing-blueprint [V] |
| K12 | Easing: ease-out for user-initiated enter/exit; ease-in-out for on-screen moves; avoid ease-in; linear only for constant motion; ease for colour/opacity hover. Built-ins are weak, prefer custom cubic-bezier. | animations.dev [V] |
| K13 | No animation for frequent/low-novelty actions (context menus, add/delete list item, keyboard-triggered, hover on trivial buttons). Delight belongs to rare moments. | Emil [V]; Rauno [V] |
| K14 | Tooltips: delay the first, show peers instantly without animation. | Emil; Vercel [V] |
| K15 | Interruptible and gesture-following motion (apply delta immediately, keep momentum); destructive action fires on release. | Rauno craft https://rauno.me/craft/interaction-design [V] |
| K16 | Hit areas: no gaps between list items (padding instead), label click focuses input, decorative glows do not capture pointer events, focus ring via box-shadow to follow radius. | Rauno interfaces [V] |
| K17 | Do not change font-weight on hover/selection (layout shift); pressed states must not shift layout. | Rauno [V]; local pro-rules |
| K18 | Theme: `color-scheme` + matching `theme-color`; no transitions when switching theme; states contrast more than rest. | Vercel; Rauno [V] |
| K19 | Specific details: loupe above finger for small controls, hover-only on devices that support hover, optimistic update. | Rauno craft [V] |
| K20 | Consistent icon family, one stroke width, one fill/outline style per level; no emoji as structural icons. | local ui-ux-pro-max pro-rules; no external primary source fetched (partly [P]) |

---
## 6. Anti-patterns / AI slop (with why)

| # | Anti-pattern | Why | Source |
|---|---|---|---|
| A1 | Inter/Roboto/Arial/system font everywhere; "Space Grotesk" as the new default. | Model converges on on-distribution fonts; no character. | Anthropic cookbook [V] |
| A2 | Purple/indigo gradient on white; evenly distributed timid palette. | Named cliché; no dominant colour. | Anthropic cookbook [V] |
| A3 | Predictable layout: centred hero + CTA + three icon cards. | "Predictable layouts and component patterns"; the three-box detail is a third-party description (prg.sh), **partly unverified**. | Anthropic cookbook [V]; https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website (snippet only) |
| A4 | Over-texted screens: paragraphs, feature lists on every card. | Users read ~20% of words; minimalist heuristic #8. | NN/g how-little-do-users-read; 10 heuristics [V] |
| A5 | Generic CTAs: "Get started", "Learn more", "Submit", "OK". | Do not say what will happen. | NN/g UX writing; Apple alerts [V] |
| A6 | Lorem ipsum / "John Doe" / round numbers. | Hides real layout and copy problems. | local `ux-guidelines.csv` #87 |
| A7 | Emoji as icons; mixed icon styles/stroke widths. | Inconsistent across fonts; breaks token control. | local `pro-rules.md` (no external primary) |
| A8 | Blank empty areas / "No data" with no action. | NN/g empty state failure. | NN/g empty states [V] |
| A9 | Carousel hero with auto-rotate, dots only. | Ignored, misleading, weak controls. | NN/g carousels [V] |
| A10 | Borders around everything; every card same weight/shadow. | Busy, flat hierarchy. | Refactoring UI [V] |
| A11 | Everything animates; same duration/easing for all; ease-in; `transition: all`; animating width/height. | Sluggish and noisy; animation on frequent actions slows the product. | Emil; animations.dev; Vercel; Rauno [V] |
| A12 | Placeholder as label; errors only at top; "Invalid input". | 7 NN/g problems; errors must be near source and constructive. | NN/g placeholders, errors [V] |
| A13 | Hamburger on desktop / mobile primary nav hidden; > 5 tabs; disabled tabs; actions in tab bar. | Discoverability and task time cost. | NN/g hamburger [V]; Apple tab-bars [V]; Material [V] |
| A14 | Confirmation dialog on every delete; alert for plain information. | Trains click-through; interrupts. | NN/g confirmation [V]; Apple alerts [V] |
| A15 | Stacked/nested modals; modal "app within app"; no obvious close. | Users lose their path. | Apple modality, sheets [V] |
| A16 | Tiny targets (< 24 px, icon-only without padding); hover-only affordances on touch. | WCAG 2.5.8; Fitts. | [V] |
| A17 | Grey text on coloured backgrounds; low contrast "muted" text < 4.5:1. | Legibility. | Refactoring UI; WCAG [V] |
| A18 | Fake social proof, invented logos/testimonials/metrics presented as real. | Misleading (mark clearly as concept placeholder). | [P] no source fetched; trust principle |
| A19 | Only a happy path (no empty/loading/error). | Prototype hides the hardest design. | [P] from F1-F5 |
| A20 | Onboarding carousel of 4 "welcome" slides before the product. | Tutorials did not improve task performance; Apple: experience first. | NN/g mobile-app-onboarding; Apple onboarding [V] |

---
## 7. ui-ux-pro-max as an audit step

Location: find the installed directory named `ui-ux-pro-max` (for example under `~/.claude/plugins/cache/`); it is written `<ui-ux-pro-max skill dir>` below (skill version 2.15.0; plugin root also has `src/ui-ux-pro-max/` with the same data). `SKILL.md` frontmatter says 119 UX guidelines, 192 palettes, 74 font pairings, 22 stacks.

Files (in `data/`): `ux-guidelines.csv` (119 rows; cols No, Category, Issue, Platform, Description, Do, Don't, Code Example Good, Code Example Bad, Severity), `app-interface.csv` (32 rows, iOS/Android/RN native rules), `landing.csv` (34 landing patterns), `motion.csv` (17), `products.csv`, `styles.csv`, `colors.csv`, `typography.csv`, `google-fonts.csv`, `icons.csv`, `charts.csv`, `ui-reasoning.csv` (192 product reasoning rules), `react-performance.csv`, `stacks/*.csv` (22 stacks incl. html-tailwind). Prose files: `references/quick-reference.md` (256 lines, all rules by priority 1-10) and `references/pro-rules.md` (117 lines, "canonical Pre-Delivery Checklist", scoped to native/mobile app UI).

Exact commands (read-only; pure python, no install, no writes unless `--persist`):
```
S=<ui-ux-pro-max skill dir>/scripts/search.py
python3 -I "$S" "empty state" --domain ux -n 3
python3 -I "$S" "tab bar navigation items" --domain web -n 3     # domain "web" = app-interface.csv
python3 -I "$S" "hero social-proof" --domain landing
python3 -I "$S" "<dashboard saas>" --design-system               # prints pattern/style/colors/fonts/anti-patterns; no write without --persist
```
Cheapest audit with no script: read `references/quick-reference.md` + `references/pro-rules.md` in the prompt. Or `cut -d, -f2,3,4,6,7 data/ux-guidelines.csv` for a compact table. The skill's SKILL.md references `${CLAUDE_PLUGIN_ROOT}`; when called from another skill use the absolute path above (and check it exists, since the version folder `2.15.0` changes on update).

Tested behaviour:
- Keyword (BM25-like) search, not semantic. "empty state onboarding" returned Empty States + Onboarding/User Freedom + Active State (good). "bottom navigation" under `--domain ux` returned Sticky Navigation and Keyboard Navigation (miss); the same idea under `--domain web` ("tab bar navigation items") returned Bottom Tabs (3-5) and Back Behavior (hit). "landing hero cta" returned 0 results (needs `hero social-proof` etc.). So: always pass `--domain`, use 2-5 noun terms, retry once.
- Domain autodetect can misroute; the SKILL.md itself says so.

Covers (local data, severity-tagged): accessibility (20 rows: contrast, alt, keyboard, labels), forms (11+), animation (10), layout/responsive, performance (CLS), touch targets, feedback (loading, empty, success, confirmation), navigation basics, placeholder content, AI-interaction disclaimers, onboarding (1 row: allow skip), app tab bar <= 5.

Gaps relative to this research:
1. No quantified response-time, copy-length, or word-budget rules; Content category is 7 rows only; no microcopy/button-label/error-copy rules beyond a few lines.
2. No desktop-app guidance (Fluent/macOS: title bar, command bar, menus, shortcuts, density). Only generic web keyboard-nav row; stacks list includes wpf/winui/avalonia/javafx but those are code-stack tips, not UX.
3. Onboarding = 1 row; undo-vs-confirm only "confirm before destructive" (opposite of NN/g/Apple for reversible actions). Do not rely on it for F6.
4. No marketing-page above-the-fold / carousel / CWV LCP-INP rules (only CLS < 0.1 in the summary); `landing.csv` is section-pattern oriented.
5. No "AI slop" detector or distinctiveness check; its style/palette/font recommendations can themselves push toward repeated choices, so run with variance dial and keep the prototype concept-specific.
6. Not a verifier: it returns advice, not pass/fail on an HTML file. The agent still must check its own output (contrast calc, target size, states present).
7. pro-rules.md Pre-Delivery Checklist is explicitly native/mobile scoped; not for web/desktop.
8. Provenance of rules in the CSVs is not cited per row (`data-provenance.json` exists but no per-rule source URL read): treat as secondary.

Recommended use inside the concept skill: (a) before building: `--design-system "<product type keywords>"` once per concept to seed palette/type/style, but override fonts if they land on Inter/Roboto/Space Grotesk; (b) after building: 3-5 targeted `--domain ux`/`web` queries (empty state, loading, form errors, tab bar, touch target) as a sanity net; (c) final: read `references/pro-rules.md` for mobile concepts only. Make it optional and tolerate a missing install.

---
## 8. Proposed pre-show checklist (<= 30, ordered by impact)

Each item is checkable by inspecting the HTML or a screenshot.

1. **Core flow clickable end to end**: the user can complete the product's main task via real clicks, no dead primary buttons. [P; Jakob/Hick]
2. **One primary action per screen**, visually dominant; secondary clearly weaker. (U15)
3. **Platform-correct nav**: mobile = visible bottom bar 3-5 items (single-word labels, icon + label, none disabled); web app = visible top/left nav; desktop = window chrome + command bar/menu; marketing = top nav of few links. (M3-M5, W1, D1-D2, A13)
4. **Text contrast**: body >= 4.5:1, large >= 3:1, icons/borders >= 3:1, in both themes if both are shown. Compute it, do not eyeball. (U1-U2)
5. **Target size**: every tappable/clickable >= 44px (touch) / 48dp Android / >= 24px pointer minimum; icon buttons have padded hit areas. (U3)
6. **Copy budget**: heading <= 8 words, supporting text <= 20 words, buttons 1-3 words naming the outcome, no block > 40 words without reason. (C1, C4, C13 [P])
7. **No banned generic copy**: no "Get started", "Learn more", "Submit", "OK", "Welcome to ...", no lorem ipsum, no marketing filler. (C4, A5, A6)
8. **Realistic content**: real-looking names, amounts, dates, with varied lengths; fake brand/logo/testimonial/metric marked as concept placeholder. (C12, A18)
9. **States present**: for the main list/screen show default, empty (message + how to fill + action), loading (skeleton, not spinner-only), error (near source, plain, with fix, input kept), success (inline/toast with Undo). (F1-F5, F10)
10. **Undo vs confirm**: reversible actions use Undo toast; confirm dialog only for irreversible ones, with a named verb button and Cancel. (F6)
11. **Typographic system**: <= 2 typefaces, one defined scale, body >= 16px (17pt iOS, 13pt macOS), no weights < 400 on small text, line length ~ readable. Font is not Inter/Roboto/Arial/system/Space Grotesk unless the concept justifies it. (U20, M1, K1, A1)
12. **Spacing system**: all gaps from a 4/8 scale; groups closer than separators; consistent page margins (16 mobile). (U19, K6)
13. **Colour system**: CSS variables; one dominant colour + one sharp accent + tinted neutrals; no purple-on-white gradient default; semantic colours for status plus icon/text. (K1, K7, A2, U5)
14. **Distinctive concept identity**: a reviewer can name what is specific to this product (layout idea, illustration style, metaphor) in one sentence; not the centred hero + 3 cards template. (K1, A3)
15. **Hierarchy test**: squint/greyscale view still shows what matters first; secondary text de-emphasised; fewer borders, shadows >= 2 layers, consistent elevation. (K4-K5, A10)
16. **Safe areas and frame**: mobile mock shows status bar and home indicator, fixed bars inset; desktop mock has title bar 32px with caption controls. (M8, D1)
17. **Forms**: visible labels (placeholder not the label), inline error beside field, correct input types, submit shows busy state, no double submit. (U18, W4, F12, C10)
18. **Interactive feedback**: every control has hover (hover-capable only), pressed (scale ~0.96-0.97 or colour, <= 150 ms), focus-visible and disabled states; pressed states do not shift layout. (U4, F8, K11, K17)
19. **Motion discipline**: transform/opacity only, durations <= 200-300 ms, ease-out for enter/exit, no `transition: all`, no animation on frequent actions, `prefers-reduced-motion` handled; at most one orchestrated entrance. (K2, K10-K13, U6)
20. **Modality**: one level of modal/sheet, obvious close, sheets have grabber + Cancel/Done on mobile, no alert for plain information, no modal on launch. (M9, M13, A15)
21. **Onboarding**: none, or <= 3 skippable steps that teach by doing; permissions asked at the moment of use with the reason. (F7, M15, A20)
22. **Progressive disclosure**: <= 2 levels; advanced options behind one obvious entry. (U16)
23. **Marketing only: above the fold** shows what it is, for whom, one specific CTA, and a hint of content below; no auto-rotating carousel; images have fixed dimensions (CLS <= 0.1); page is skimmable (headings front-loaded). (S1-S6)
24. **Icon set consistency**: one family, one stroke/fill style, no emoji icons, labelled icon-only buttons. (U17, K20, A7)
25. **Responsive/zoom**: works at 320 px (web) and with 200% text; no horizontal scroll; no content under fixed bars. (W2, M8)
26. **Keyboard (web/desktop)**: tab order matches visual order, focus ring visible, Esc closes overlays, Enter submits, focus returns after dialog close. (U4, D4, W10)
27. **Not colour-only**: every status/active/error has icon or text. (U5)
28. **Peak and end**: the final screen of the main flow and the first-use result are designed (clear outcome + next step), not a generic "Success!" screen. (U13, F5)
29. **Alignment polish**: optical alignment of icons/text, concentric radii, consistent corner radius scale, text baseline alignment in rows. (K8-K9)
30. **Optional audit pass**: run 3-5 `ui-ux-pro-max` `--domain ux|web` queries (empty state, loading, touch, nav) and fix any High/Critical hit; skip silently if the skill is not installed. (section 7)

---
## Unverified / caveats summary
- Apple tab bar item count: HIG gives no fixed number (verified); "5 on iPhone" is the Material/industry norm only.
- iOS Dynamic Type point table (M2), Windows touch target size (D5), phone viewport widths (M19), Z-pattern (S4), NN/g "3-click" style claims: not read from a source.
- m3.material.io pages themselves (nav bar, FAB, sheets) unreadable (SPA); used Google's component docs. Material 48dp touch target taken from search summaries of developer.android.com / Compose docs; page not opened.
- Refactoring UI: only the tips list on refactoringui.com read, not the book; "limit your choices" and "labels last resort" are listed titles, no body text read.
- Numeric copy budgets (C13) and pre-show thresholds beyond what sources state are proposals [P].
- The Vercel guidelines page is a brand house style; hit-target (24/44), 150-300 ms spinner delay, and ~500 ms mutation numbers are Vercel's own recommendations, not a standard.
- Rauno interaction numbers (200 ms, scale 0.96) and Emil (300 ms) differ; use <= 200 ms for micro-interactions and <= 300 ms for entrances as a compromise [P].
