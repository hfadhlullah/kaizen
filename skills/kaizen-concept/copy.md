# Copy

Read at step 5 (the fact sheet and voice card go on the concept cards) and at step 6 (before any user-facing text is written). Rules are tagged `[app]` for app screens, `[landing]` for landing and marketing pages, and `[all]` for both. The banned words and the word budget in `SKILL.md` ("No AI slop") and the Words tier of `slop-check.md` always win over anything here. Words the user fixed (a headline, a button label, a product name) are kept exactly. A problem with them goes to the user as a suggestion, never as a quiet rewrite.

## 1. Facts before words

`[all]` Write the fact sheet before any sentence. It has one line per fact, and each fact has a source: the brief, a file the user gave, or a link.

- What the product is, in the plain word its users would use.
- Who uses it, and who pays, when those are different people.
- The one main action.
- The real names: product, features, plans, places, people.
- Real numbers with units: prices, durations, counts, dates, and where each came from.
- What it replaces, and what the user does today.
- One honest limit: something it does not do, or does only partly.
- Proof that exists: a customer the user named, a measured result, a certificate.

Rules for the sheet:

- Nothing is invented. If a number, a customer, or a quote is not in the material, it is not on the page.
- An empty fact stays empty. The section that needed it gets shorter or leaves, and the gap is listed in the report as something the user must supply. A prototype may use sample data (below), but the sheet marks it as sample.
- Sameness is cured with facts and decisions, never with synonyms. If two concepts say the same thing in different words, the fact sheet was thin.
- When a fact is assumed, mark it `(assumed)`. The report lists every assumed fact.

`[all]` Sample data is allowed in a prototype because a concept needs content to be judged. It is labelled as sample outside the app frame, on the review page, as `SKILL.md` step 8 says. It is never presented as real: no fake customer logos, no fake star ratings, no "10,000 teams" line, no polished testimonial with a stock name.

## 2. The voice card

`[all]` Each concept has one voice card, written once and used for every string. A card has five lines.

1. **Register:** one of the registers in section 3.
2. **Person:** who speaks. "We" for a small team, "I" for a solo maker, the product's name for a tool, nobody for an app screen.
3. **Reader:** who reads, in what moment. "A shop owner at the till, between customers."
4. **Words we use:** six to ten terms the users really say, in their language. "Tagihan", not "billing statement", for a school admin in Indonesia.
5. **Words we never use:** the banned list, plus any term the users would find stiff or foreign.

Voice holds and tone moves. The voice is the same everywhere: the same words for the same things, the same level of formality. The tone shifts with the moment. A celebration is lighter than an error. A price line, a form, a payment failure and a delete confirmation go plain and exact, in the same voice with the jokes removed.

## 3. Registers

`[all]` Pick one register per product. Pick the one the product's users would expect least from a competitor, so the set of concepts does not sound like one writer. Two concepts in the same set take different registers.

| Register | Sounds like | Fits | Risk |
|---|---|---|---|
| Plain-spoken | Short facts, ordinary words, no flourish | Tools, finance, admin, health | Can read cold; add one human detail |
| Warm neighbour | First names, small talk, everyday words | Local shops, community, food | Drifts into cute; keep every line useful |
| Dry and exact | Numbers, units, understatement | Developer tools, logistics, engineering | Can read as bored; let the facts carry interest |
| Coach | Direct, a little pushy, always about the next step | Fitness, habit, learning | Becomes nagging; never shame |
| Editorial | Longer rhythm, concrete images, a point of view | Media, culture, premium | Slips into pretty and vague |
| Playful | Light jokes, rhythm, surprise | Kids, games, casual consumer | Tires fast; one joke a screen at most |
| Formal | Complete sentences, full titles, no slang | Law, government, banks | Wordiness; keep sentences short anyway |

Formal does not mean long, and warm does not mean chatty. Read the register line aloud as the user's own customer would hear it.

## 4. Headings

- `[landing]` The main heading names what the product is and for whom, in plain words, and carries one hard fact on the first screen. Aim for 2 to 8 words. "Tata usaha kirim 28 tagihan sekaligus." is the model: an actor, an action and a number.
- `[landing]` Every heading contains a noun. A heading is not a mood.
- `[landing]` Section headings say what the section proves, not what it is called. "Features", "Our story", "Why us" and "Solutions" are labels, and labels are cut.
- `[landing]` Read only the headings and the hero. They should tell the story in order. If they do not, the page is a list of sections.
- `[app]` Screen headings are 1 to 3 words and name the thing on the screen: "Tagihan", "Jadwal hari ini". No subtitle under them.
- `[all]` No single word in a heading picked out by colour, italic or underline.
- `[all]` Where two things look alike, define the difference once, at the place they appear.

## 5. Buttons and links

- `[all]` A button is a verb and an object, as short as the platform's budget allows: 1 to 2 words on an app screen, 1 to 5 on a landing page. "Jadwalkan demo", "Add person", "Kirim tagihan".
- `[all]` The main action has one wording, and it is the same on every screen that offers it. On a landing page it shows at most twice on one screen.
- `[all]` Never alone: "Submit", "OK", "Learn more", "Get started", "Discover", "Explore".
- `[all]` The second action on a landing page is a different action, not a softer version of the first.
- `[all]` A destructive button names what goes: "Delete 3 invoices", not "Delete" and not "Yes".
- `[all]` A link says where it goes. No arrow glued after every link.

## 6. Microcopy by moment

### Errors

- `[app]` An error says what happened, why if it is known, and what to do next. Three short parts at most, and on a tight screen only the first and the last.
- `[app]` It names the field and the real value. "Nomor telepon harus 10 sampai 13 angka" beats "Invalid input".
- `[app]` No blame, no "Oops", no "Something went wrong". If the cause is unknown, say so and give the one step that can help.
- `[app]` The message replaces the helper line in the same reserved place, so the layout does not jump.
- `[app]` Show an error after the user leaves the field, not on the first keystroke.

### Empty states

- `[app]` An empty state names the one action that fills it, and the action is a button. "Belum ada tagihan" plus "Buat tagihan".
- `[app]` For a search with no result, say what was searched and offer the next step: clear the filter, widen the date, or add the item.
- `[app]` No cute character, no paragraph about the benefits of the feature. An empty state is a doorway, not a pitch.
- `[app]` An empty state that waits on another person names them, as the waiting-status rule in `SKILL.md` says.

### Notifications and toasts

- `[app]` At most 6 words. Say what changed, with the number: "3 tagihan terkirim".
- `[app]` No toast for a result already visible on the screen. A silent update is the success message.
- `[app]` A toast for a failure carries the retry action in the toast itself, and stays long enough to read and to click.
- `[app]` A reminder says what is due and when. "Bayar listrik, besok."
- `[app]` Never a notification whose only job is to bring the user back.

### Confirmations

- `[app]` Ask only when the action cannot be undone. Name the thing and the count. Offer an undo instead of a confirm when the action can be reversed for a few seconds.
- `[app]` The two buttons are verbs that differ from each other: "Hapus 3 tagihan" and "Batal". Not "Yes" and "No".

### Loading and progress

- `[app]` Say what is loading only if it takes long enough to matter. A progress line carries its number: "72%, 43 days left".
- `[app]` No "Please wait" and no "Almost there!" when it is not almost there.

### Forms

- `[app]` Labels sit above fields and say what goes in. Placeholder text shows an example format, never replaces the label.
- `[app]` Mark the rare optional field, not the common required one.
- `[app]` A form's end button says what it does for the user, with the object.

## 7. Onboarding text

- `[app]` Onboarding teaches by doing. Each step is one screen with one action and at most a few words. The result of the step is visible before the next begins.
- `[app]` Ask only what the product uses in the next minute. Defer the rest, and say when it will be asked.
- `[app]` The first screen after onboarding is the real working screen with the user's first result, not a tour.
- `[app]` Skip is always visible and says what it skips.
- `[app]` For a habit app, the day-1 text sets a small first target with a number. Day 7 text names the streak without scolding a miss.
- `[landing]` A landing page's "how it works" is three or fewer steps, each a verb phrase with the real thing: "Foto struk. Cek total. Kirim ke akuntan." Step numbers appear only when the order matters.

## 8. Apps versus landing pages

The two surfaces use different amounts of language, and a mix-up shows at once.

| | `[app]` | `[landing]` |
|---|---|---|
| Prose per screen | About 10 words (`SKILL.md` word budget) | Room for a story, but each section says one thing |
| Heading | 1 to 3 words, names the thing | 2 to 8 words, a result with an actor |
| Button | 1 to 2 words | 1 to 5 words |
| Notification | At most 6 words | Not applicable |
| Explaining | An icon, a number, a label, or the image | One sentence, then the picture |
| Proof | The user's own data | Real customers and figures the user supplied |
| Tone | Neutral and quick; the interface mostly does not talk | Carries the voice |

Count app prose before reporting and list every remaining prose string per screen. The numbers, units, names, food or item names, form controls and navigation are not counted. Cut until each screen fits.

## 9. The device budget

`[landing]` A rhetorical device is a move that can be used once and stops working when repeated. A page has a budget for each. Count them in the draft. Over budget means rewrite those lines as plain facts.

| Device | What it is | Per page |
|---|---|---|
| Two-fragment heading | "Fast. Reliable." | 1 |
| Number-pair heading | "Four plans, four prices" | 0 to 1 |
| Negation run | "No setup. No fees. No waiting." | 1 |
| Contrast frame | "Not X but Y", "rather than", "instead of" | 2 in total |
| Dry closing line | A one-line quip that ends a paragraph | 2 |
| Pun | A word that plays on two meanings | 1, never in the main heading |
| Eyebrow label | Small text before a heading | 1 or 2 |
| Footer sign-off | A cute closing line in the footer | 0 |
| Virtue word about the product | honest, thoughtful, simply, genuinely, truly, carefully | 0 |
| Colon reveal | "The result: faster work" | 1 |
| Question and answer | A line that asks then answers itself | 1 |
| Exclamation mark | "!" | 0 |

`slop-check.md` already limits the negation run and the contrast frame to one per page. Where the two differ, the stricter one holds. `[app]` screens use none of these devices. An app is not performing.

Over-use is the tell. A page that stays under budget on each device but uses the same cadence in every paragraph still reads machine-made. Vary sentence length, and let some paragraphs be one plain sentence.

## 10. Specific beats polished

`[all]` These moves replace adjectives and keep the page honest.

- **Facts where adjectives go.** "Sends 28 invoices in one tap" replaces "powerful bulk sending".
- **Proper nouns over categories.** "Bank BCA and Mandiri" beats "major banks".
- **Numbers with units, inside sentences.** "Takes about 4 minutes" beats a stat tile.
- **Repeat the product's name.** A pronoun that points back three lines is a place a reader gets lost.
- **One admission.** A single line on what the product does not do, or does only partly, makes the rest believable. Not more, or the page apologises.
- **The user's trade vocabulary.** A baker says "adonan", a developer says "diff". Using their word is proof you know them.
- **Plain verbs.** "Is" and "has" are not tells. Perfect grammar is not a tell. A true list of three is not a tell.

## 11. Tests

Run these on every concept's text before step 7. The first three are for you. The fourth is for a fresh subagent.

1. **Read it aloud as the owner.** Say each heading and each button as the person who runs the product. Cut what they would not say about themselves.
2. **The rival test.** Put the nearest competitor's name on the main heading. Then try the same trade in another town. If it still reads true, it says nothing about this product. Rewrite it with a fact only this product has. (This is the copy line of `slop-check.md`'s Reflex section, and the fixed-words rule applies.)
3. **The squint on words.** Cover everything except headings and buttons. A reader should still know what this is and what to do.
4. **A fresh reader.** Give a fresh subagent only the page text, with no design and no brief. Ask it six questions and read its answers as data:
   - What is this?
   - Who is it for?
   - Why this over the alternative?
   - What does it cost, or take?
   - What would make me hesitate?
   - Which three lines sound like any website?

   Fix what the answers expose. Never loop on a detector score. Rewriting to beat an "AI text detector" is the wrong target. The target is a reader who knows the answers.

## 12. Over-correction traps

Fixing one tell breeds the next. When a rewrite removes a banned pattern, check that it did not grow its cousin.

- Banning em dashes breeds comma splices and long chains of clauses. Write two sentences.
- Banning "not X but Y" breeds "rather than" and "instead of". Count both against the contrast budget.
- Banning hype words breeds the quiet version: "quietly", "steady", "honest", "calm". Say a fact.
- Cutting adjectives breeds a list of nouns with no verbs. Keep one concrete verb per line.
- Shortening everything breeds a page of fragments. The two-fragment heading budget still applies, and fragments as body text read as a pose.
- Banning stock lines breeds a bespoke slogan that is just as empty. Run the rival test on it.
- Adding a joke to cure dryness breeds the house voice: the same dry wink in every client's text. One joke at most, and only in a register that allows it.
- Writing for a persona the user did not describe. Cut it.

## 13. Residue and process talk

`[all]` Delete before shipping: "Certainly!", "I hope this helps", `[Company Name]`, lorem ipsum, `{{tokens}}`, Markdown symbols on the page, and notes to the reader such as "This section shows" or "Below you'll find". Check the footer for a stale copyright year, and for a pile of sign-offs.

Placeholder names and brand names are drawn from the market, not from a default cast. For an Indonesian product, names such as Sari, Budi, Wulan, Agus and Dewi, and product names that sound like the market. For a product in another place, names from there. Never Priya, Marcus, Elara, Nimbus, Apex or Zenith.

Testimonials come from the user. If they gave none, there are none. If they gave one, there is one, in their words, uncorrected. Three polished quotes in a row is a tell.

Pricing pages do not mark the middle plan "Most popular" without a source.

## 14. Writing in the product's language

`[all]` The text is written in the language of the market, from the start. It is not written in English and then translated.

- Ask for the voice in that language. For Indonesian, settle the pronoun first: "kamu" for casual and young, "Anda" for formal and older, "Bapak/Ibu" in schools and services, or no pronoun at all in most app strings. Never mix them on one screen.
- Use the words people use, not textbook words. "Kirim" more often than "mengirimkan". "Tagihan" for a bill a school sends, "invoice" for freelancers who already say it in English. Mixed Indonesian and English is correct where users really mix them, and wrong where they do not. Check the reader.
- Keep the same rules in every language. Buttons are verb plus object ("Buat tagihan", "Kirim ke wali murid"), errors say what to do next ("Isi nomor telepon 10 sampai 13 angka"), empty states name one action ("Belum ada murid. Tambah murid").
- Plan for length. Indonesian is often about a quarter longer than English. Test every button and heading at its longest string and at 390px.
- Format the local way: dates "19 November 2026", thousands with a dot, "Rp 1.250.000", 24-hour time.
- Check the banned-word list in translation. "Seamless" becomes "mulus" and "tanpa hambatan", and both are as empty as the original. "Pintar", "canggih", "revolusioner" and "solusi terpadu" are the same family.
- Honorific and politeness differences are copy decisions. State them on the voice card so every string follows one choice.
- If the user wrote the words, keep them. A concept never retranslates a fixed headline into something tidier.

## 15. Where this fits in the steps

- Step 5: the card lists the register, the person, and the fact sheet gaps in one line each.
- Step 6: first-screen first. Write the first screen's text from the fact sheet and the voice card, run tests 1 to 3, then build.
- Step 7: the reviewer reads this file with `slop-check.md`. Test 4, the fresh reader, is the independent check, run on the final text of each concept before the review page.
- Report: list assumed facts, empty facts the user must supply, every remaining `[app]` prose string over the word budget, and any line that was kept because the user fixed it.
