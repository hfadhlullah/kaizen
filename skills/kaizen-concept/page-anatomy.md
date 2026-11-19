# Page anatomy

Read this at step 5, when you propose concepts; the card you write from it carries what
step 6 needs. It answers one question: what is this page built around? The answer
comes from the visitor's job, not from a template. A theme dresses the page. A page
shape orders it. Neither replaces the job.

Rules are tagged `[landing]`, `[app]` or `[all]` like `slop-check.md`. A landing rule is
never applied to an app screen. Where a rule here and a Floor item in `slop-check.md`
seem to disagree, the Floor wins.

## 1. Start from the visitor's job

Before choosing a layout, write one line in the visitor's voice: what did they come to
get done? Most landing pages fall into three families: pages that **close a deal**
(buy, book, sign up, try, subscribe, talk to sales), pages that **bring someone to a
place or a date** (visit, attend, join), and pages that **show a body of work** (hire,
listen, read). If a page has two jobs, the one a stranger arrives with leads and the
other becomes a link.

- `[landing]` Name the job in the concept card. A card that says "landing page" and no job is unfinished.
- `[landing]` The main action uses the job's own verb, in the nav and in the first screen: "Pesan meja", "Beli tiket", "Coba gratis", "Hubungi Kami di WhatsApp". Never "Get started" or "Learn more" alone (slop-check, Words).
- `[landing]` The real subject is on the first screen: the room, the cover, the dates, the working product.
- `[landing]` Proof takes the form the category already trusts: an address and a plate for food, a working screen for software, a record for a band, named schools for a school system. A row of three round figures proves nothing in any category.
- `[all]` Facts come from the user or a checkable source, never from you. A section that needs facts nobody gave (prices, a lineup, a client list) becomes a labelled sample the user can swap, or one line plus a gap in the handoff.

## 2. What each family puts where

Treat each row as the least a visitor of that category expects, not as an order of
sections. Pick what the concept's promise needs and say in the card what was left out.

**Pages that close a deal**

| Job | The action, and where it sits | What the category always shows | How it closes |
|---|---|---|---|
| Buy a product | Price and options next to the product, early; a slim sticky price bar on long pages | The product close and in use, how it is made, delivery and returns in plain words, real reviews only | The offer again; the newsletter field belongs in the footer |
| Book (food, class, clinic) | A picker for people, date and time, or the next free slots as buttons; reachable from the nav and beside the menu or timetable | One honest photo of the place, the menu or timetable with prices, hours and address as their own block | Hours, address, the picker once more |
| Sign up (software, API) | A free start in the nav and first screen, its terms in one line; for a developer tool, the install command | The product working, abilities as named moments, a code sample or setup steps, pricing, questions | The first action again in a short band |
| Try (app, game, desktop tool) | Store or download buttons right under the headline, one per platform the user named | The real main screen, features shown in real screens, a before and after | The download buttons beside one last screen; game pages stay short |
| Subscribe (newsletter, podcast) | The email field or the latest episode's play button in the first screen | A real issue or episode as it arrives, who makes it, the archive by date | The only job where an email field may end the page |
| Talk to sales (B2B, Indonesian market) | One contact route the buyer already uses, often WhatsApp or a short demo form, in the nav and after each proof | Who it is for by role, the problem in the buyer's words, how it fits their day, the proof the buyer's peers accept | The contact route with a named person or hours |

**Pages that bring someone to a place or a date**

| Job | The action, and where it sits | What the category always shows | How it closes |
|---|---|---|---|
| Visit (shop, gallery, venue) | Today's hours and the address, high on the page | What is on now as the lead image, what is coming as dated rows, directions | Visit details, or a list for what is next |
| Attend (event, conference, race) | A ticket link from the first view; the date and place are the headline | Lineup or speakers in large names, the schedule by day, ticket tiers, travel | Tickets again and the questions; between editions the page shrinks to date, place and a list |
| Join (club, community) | "Join" or "Come to a first session" in the first screen | A real session shown, times and places, membership choices, what a first visit is like | The first-visit details or a sign-up |

**Pages that show a body of work**

| Job | The action, and where it sits | What the category always shows | How it closes |
|---|---|---|---|
| Hire (studio, freelancer) | A plain contact in the nav and after the work; no form needed | The work itself as projects with client, year and place, one opened in depth; a short list of services | Contact details per office |
| Listen or read (band, film, publication) | The newest release with play, watch or order side by side | The release with its tracks or contents, dates with ticket links, the back catalogue | Dates, more catalogue, or a mailing list; a page with no release leads with the act |

### App screens

An app screen is a place someone works in, not a page someone reads. The job is the
task, and the screen is built to disappear into it.

- `[app]` None of the landing rules in this file apply: no page shape, no first-screen signature, no hero posture, no footer. `ux-rules.md` and the `[app]` items in `slop-check.md` are the rules.
- `[app]` The theme lends colour, type, radius and surfaces. It never lends layout, navigation or ornament.
- `[app]` Colour stays quiet. The accent marks the main action, the current selection and anything live. A second neutral sets sidebars, toolbars and panels apart.
- `[app]` The shell is a top bar until the product has more than about seven destinations. Then a sidebar is earned, and it folds into a menu on a narrow screen. Standard patterns (tabs, breadcrumbs, a command palette) beat invented ones.
- `[app]` Density is the design. Tables come before cards. Rows are tappable as a whole.
- `[app]` Any region that fetches data draws four states: loading (a skeleton shaped like the incoming content), empty (what goes here, plus the single action that fills it), error (what failed, what to try) and full.
- `[app]` A modal is the last answer, after inline editing and disclosure. Filters, tabs and paging live in the address.
- `[app]` The card for an app concept names its screen instead of its shape: "Transactions table with an inline filter row. States: loading, empty, error, full."

## 3. How a page ends

Real sites close in one of five ways. In rough order of how often they fit:

1. The first screen's action again, in a short band.
2. Practical details: hours, address, contacts.
3. More of the catalogue: the archive, new arrivals, more work.
4. A short trust tail: a guarantee, press or awards the user gave.
5. A mailing list, for things that recur: issues, editions, releases, events.

- `[landing]` Finish on the thing the visitor came for, in the shape that job takes: the next open slots, the purchase box, the store buttons, the next date with the address, the newest issue. Or finish on the last strong section and the footer.
- `[landing]` An email sign-up closes the page only when the job is subscribe, join, attend, listen or visit, or the user asked for it. It is one close in five, not the default (slop-check, Layout).
- `[landing]` A page whose action already sits in the first screen or a slim bar need not repeat it at the foot.

## 4. Page shapes

A shape is a way of ordering a page. Treat the list as a vocabulary. Design the page the
job needs, then name the shape you designed, so two concepts in one set can be checked
for sameness. Reaching into the list first and building whatever comes back makes every
page the same three shapes. Two concepts in one set must not share a shape.

**Bento.** One irregular grid of different-sized blocks, each holding a feature, a number, an image or a quote the user provided. Variety in size creates the rhythm, not a row of matching cards. Fits a product with many small true things to show.

**Long document.** A memo or a letter that happens to be a web page. Continuous prose with plain headings inside it. Fits a product explained best by an argument, or a person's own project.

**Marquee.** The first screen is the page: one statement or one image fills it. Below the fold the page turns into something quieter, such as a list or prose. Fits a launch, a film, a single strong object.

**Figure-led.** The opening is one number the user gave, with the line saying what it means. Everything below supports or qualifies it. Only when that number is the real reason to care.

**Workbench.** Real captures of the product in use are the main content, with short captions instead of marketing paragraphs. The page is a guided tour. Fits software that exists and can be screenshotted.

**Interview.** Bold questions and direct answers, like a candid conversation with the product. Each pair may open and close. Fits something people distrust or misunderstand.

**Manifesto.** Large, opinionated type. The page says what to believe before it says what to buy. Fits a cause, a movement, a brand with a position.

**Photographic.** One large photograph owns each screen, and the text is a small caption. The design says look first. Needs the user's own strong pictures. Without them, choose another shape.

**Quote-led.** The opening is a quote the user supplied, with its source. The headline is someone else's voice. Fits a work with real critical praise.

**Specimen.** Large serif type, uneven spans, hairline rules, a text-only action, plenty of space. Only for type, publishing and writing: a foundry, a journal, a press. An editorial mood alone does not earn it.

**Catalogue.** A uniform grid of variations on one thing: typefaces, palettes, products. The page is an index of stock. Fits a shop with many similar items.

**Letter.** First person, written, close. It starts with a greeting and reads like a founder's note. Fits a small maker or an early product.

**Index-first.** The page is a list of links and nothing else. No picture, no story. Navigation is the design. Fits a hub, an archive, a personal home.

**Workflow story.** Numbered stages narrate how the product is used over time, one phase per section. Use it only when the process is real and ordered.

**Split.** A two-sided page. Each major block divides the screen, text on one side and proof on the other, with the proof keeping its side. Rows vary in weight so it never zigzags.

**Pinned stack.** A heading stays fixed on the left while the right side steps through related captures as you scroll, paced like a film. Needs a handful of real captures and a reason to scroll.

**Type as the product.** The typeface itself is the design: a foundry or a design system where a custom face is the proof. Rare.

**Portfolio grid.** Filterable cards of projects. Fits a studio or designer where the work is the product.

**Map or diagram.** One large spatial figure organises the page: a floor plan, a network, a system map. Fits a product whose value is spatial or relational, and only with a real diagram.

**Hub.** Several ways in at once: featured, newest, by topic, by person. Fits a platform whose value is browsing, not a claim.

**Playground.** Interactive blocks that preview a thing and show how to copy it. Fits a component library or an API.

### Matching a shape to the domain

When the brief names no shape, take three that come from different families (grid-led,
document-led, poster-led, product-led), and pick the one that differs most from the
other concepts in the set.

| Domain | Three to choose from |
|---|---|
| Podcast, music, audio | Photographic, Quote-led, Letter |
| Shop, merchandise, commerce | Catalogue, Photographic, Bento |
| Docs, CLI, SDK, open source | Workbench, Long document, Playground |
| Platform, infrastructure, B2B tool | Bento, Workbench, Figure-led |
| Agency, studio, case studies | Portfolio grid, Split, Index-first |
| Personal page, resume | Long document, Letter, Index-first |
| Restaurant, cafe, menu | Photographic, Long document, Catalogue |
| Fashion, beauty, lookbook | Photographic, Catalogue, Marquee |
| Finance, banking, payments | Figure-led, Workbench, Long document |
| Cause, campaign, advocacy | Manifesto, Quote-led, Figure-led |
| Magazine, type, publishing | Specimen, Long document, Type as the product |
| Launch, SaaS marketing | Bento, Workbench, Figure-led |
| Conference, event | Marquee, Manifesto, Photographic |
| No signal at all | Bento, Long document, Manifesto |

Developer docs and developer marketing are different jobs. A walkthrough wants
Workbench. The landing page wants Bento or Figure-led.

### Software pages: deal the sections, do not stack them

For a software product on a Bento, Figure-led, Workbench or Marquee page, choose from
this set of sections instead of copying the usual order. Some can always be built
honestly. Others exist only when the user supplied the material.

Always possible:

- **Spec sheet:** what it is in figures the product itself ships with, such as limits, formats, versions, regions. A table.
- **Worked example:** the product doing one real job, shown as a command and its output, or a capture and its caption.
- **Changelog:** the last three or four entries with real dates. It proves the product is alive.
- **Comparison:** the product beside the current way of doing it, row by row, with no scores.
- **Pricing:** the real price, two or three tiers. A "Contact sales" on every tier tells a buyer the brand does not trust them.
- **Questions:** real objections, answered the way a person would. "Yes, both providers work" beats "integrates with leading providers".
- **Closing band:** the ask, once, one button.
- **Footer.**

Only with the user's material:

- **Product visual:** a real capture. Without one, build the product honestly in the prototype's own logic, or lead with type. Never a drawn stand-in.
- **Logo row:** the user's own customer marks, with permission. Otherwise it does not exist.
- **Three capabilities:** only when each has a capture or a figure to show. Otherwise fold them into the worked example.
- **Testimonials:** quotes the user supplied word for word, with the name, role and company as given. Otherwise they do not exist.

Every deal deviates from the default twice. Drop at least one always-possible section
and name it (the closing band is the usual cut). Then either let a second section take
the first screen's place (a spec sheet as the lead says "the numbers are the pitch", a
worked example says "watch it work") or reorder one neighbouring pair on purpose
(pricing before the example says "the price is the pitch"). Say both moves on the card.
A bakery or a studio does not use this set at all.

## 5. The signature

Each landing concept has one signature: the single real thing a visitor remembers from
the first screen. It is the strongest true material the concept has, shown at its best.
Examples: the photograph that is the place, the product doing its single task, a price set enormous because the price is the offer, a control to try, a record cover with a play button, the next three free tables.
enormous because the price is the offer, a control the visitor can try, the record
cover with a play button, the next three free tables.

- `[landing]` Name the signature on the concept card, in one line, next to the signature mechanic from SKILL.md. The two can be the same thing.
- `[landing]` The signature is visible in the first screen at 1280x800, at a size where it can be read or tried. Not behind a scroll, not a small thumbnail.
- `[landing]` Make it in the concept's own material, so it belongs to the type and the colour already chosen.
- `[landing]` Run the delete-the-picture test: imagine the main image gone. If the screen still says the same thing, the image was decoration, and the signature is somewhere else or missing.
- `[landing]` A number drawn as a row of marks is a device, not a signature. A big figure counts only when it is the reason to come and the user gave it.
- `[landing]` A signature the visitor can act on beats one they can only look at. A booking widget with real times, a command with a copy button, a toggle that flips a price.
- `[all]` If the concept has no real material to show, the signature is the type itself: a line set so large and so well that it carries the screen. Say so on the card.

## 6. The first screen

### Hero budget

- `[landing]` A headline of about seven words, one sentence of about twelve, one or two actions. If the first screen needs more, the idea is not clear yet.
- `[landing]` Headline, sentence, action and visual are all visible at 1280x800. Size the hero in rem, clamp or a fixed ratio, not `vh` alone.
- `[landing]` The content sits in the middle of its screen. The space below it is about the same as the space above, and the last line of content does not float far above the fold.
- `[landing]` The visual is big or absent. Half the width and most of the height, or a tall object on a third of the width, or nothing and a larger headline. A small picture beside a big gap is worse than either.
- `[landing]` The next section starts either clearly in view or clearly out of it, so the fold never cuts a section awkwardly.

### Hero postures

Choose a posture from the job and the material. Text beside a picture is the most common
posture a model produces. Take it only when the image is the strongest asset the concept has. Vary it across the set.

- **Settled.** The text and the visual share the screen as two halves, centred vertically.
- **Stage.** Text on the smaller side, a large visual on the other, possibly bleeding off the outer edge. Reverse it when a poster-sized headline needs the width.
- **Banner.** A short hero, around half the screen, so the first real section shows above the fold. For references, docs and utilities.
- **Ledge.** A tall field, with the headline resting at the bottom of it. On wide screens the headline grows first.
- **Corridor.** One narrow centred column with an oversized headline. For words-only pages.
- **Poster.** A full-bleed photograph or canvas, with the content on its calmest part, low and left or centred, with room around it. Never squeezed into a corner.
- **Counter.** The action itself is the visual: the subscribe field next to the latest issue, the booking times, the buy box with options, the download button beside a screen. The headline gets shorter to make room.
- **Index.** The content is the visual: the lineup, the menu, the issue list, the project list, set as the lead with a small headline above it. For pages whose list is the reason to come.

With no visual at all, either let the headline grow to the largest size the theme allows
across most of the width, or use Banner so real content starts early.

## 7. Navigation and footer

Both are part of the shape. Decide them with the first screen, not afterwards.

### Navigation

`[landing]` One line, roughly 56 to 80px tall, holding only the page's real destinations.
Count them. Two destinations do not need a three-part bar.

- **Edge-aligned.** The wordmark at one edge, one or two links or an action at the other. The quiet default for a short page.
- **Floating pill.** A small rounded bar that hovers over the page. Works over a photograph, hard to read over busy content.
- **Masthead.** A large centred wordmark over a rule, links beneath or beside it. For publications and shops with a voice.
- **Slab.** A heavy full-width bar in the ink or accent. For bold, poster-like concepts.
- **Search-led.** A visible search or command field is the main thing in the bar. For hubs and developer tools.
- **Retracting.** A banner on top that leaves as you scroll, leaving a slim bar. Use it when a notice is real.
- **Three-part.** Wordmark, links, action. Only for four or more real destinations.
- **Side rail.** A fixed column. Only when the page has a sticky object that earns it, such as a table of contents or a cart.

`[landing]` The nav carries the job's action word (see section 1). The wordmark, a row of
links and a filled button on the right, with a hairline below, is the template nav. Keep
it only with a reason that names this concept.

### Footer

`[landing]` 200 to 400px, holding the wordmark or one closing line, the page's real
links, and the legal line.

- **Mast.** The wordmark set large above the links.
- **Statement.** One closing sentence set large, links beneath.
- **Colophon.** Credits, address and hours as one paragraph. Right for a small, personal or document-like page.
- **Mailing list first.** The sign-up form leads. Only for a subscribe page.
- **Letter close.** A sign-off and a date. For the Letter shape.
- **Index columns.** Several columns of links, only for a hub that has a real sitemap.

`[landing]` Four link columns, a row of social icons and a copyright line is the
template footer. A single line under a hairline is a colophon and suits a letter, a
document or a manifesto.

## 8. Pace and variety down the page

- `[landing]` Six to nine sections, first screen and footer included. Five on a thin brief, never fewer. Height follows content.
- `[landing]` Order follows the argument the shape makes. After the first screen, lead with the strongest real thing, and put each fact where it does work.
- `[landing]` Steps, figures and schedules are optional. Show steps only for a process the visitor truly walks through. Show a row of figures only for numbers the user stated, never derived from a hint ("365 mornings" from "every day").
- `[landing]` Never the same composition in neighbouring sections. Mirror a split once at most, and never zigzag. Include at least one full-width visual on a product page, and one or two bands of changed paper.
- `[landing]` Below the first screen, photographs fill roughly a quarter to a third of the page and never lead two sections running. Fill the sections between with the theme's own material: type, figures, rules, the product, a table, a form.
- `[landing]` Pace dense and quiet. A dense section (a grid, a table, an index) is followed by a quiet one (a statement, a single showcase).
- `[landing]` About 450 visible words at most across the page. Read only the headings and the first screen: they should tell the story.
- `[landing]` A paragraph that fills only the left half of the width, with nothing opposite, marks a thin page. Add a visual beside it, divide it in two, or turn it into a single large statement.

## 9. What to leave out

Each concept must leave out some of the usual compositions on purpose. Name two on the
card. The easiest to reach for, and the first to drop, are:

- a row of three or four figures under the first screen
- a three-step "how it works" strip
- a statement band in large type between two sections
- a closing band with one button
- three equal cards with an icon above each heading
- a logo wall, a testimonial wall, a newsletter strip

`[landing]` Any of these may stay only when the job calls for it and the real material
exists. A concept that uses all of them is the template page in slop-check, however it
is coloured.

`[landing]` Also leave out whatever the material cannot support:

- no logos, quotes, counts or ratings the user did not give
- no drawn illustration standing in for a photograph, a product or a person
- no empty picture slot in a colour wash. A labelled gap is honest. A grey box is not.
- no phone, laptop or terminal frame unless the content inside is the real product
- no row of tiny marks standing for a quantity
- no more than a few missing-content slots on a page, each listed in the handoff

## 10. Writing the card

When you propose a landing concept at step 5, add these lines to its card, in this order,
each one short:

1. **Job:** the visitor's job, in their words.
2. **Action:** where the main action lives and what it says.
3. **Shape:** the page shape, from section 4.
4. **First screen:** the posture and what the signature is.
5. **Chrome:** the nav style and the footer style.
6. **Sections:** the sections in order, with the two compositions you chose to leave out.
7. **Close:** how the page ends.

Two cards in one set that share a shape, a posture and a nav are one concept. Change
one and the rest has to follow, or merge them.

For an app concept, the card has two lines instead: the **Screen** and its **States**.
