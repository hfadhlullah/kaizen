# Content: cases from real rules

Learning and event games live or die on content that the client's expert accepts. Write sample cases yourself, from sources,
so the client reviews something concrete instead of starting from a blank sheet.

## Sources
1. Know the client's sector and their own rules first (see the brief).
2. Find their **published** documents: guidelines, codes of conduct, policies, the regulator's rules for their sector.
   Download each into its own folder and extract the text (`pdftotext -layout`), then read the parts you cite.
3. A rule cited in a case needs a document you read. Cite an article, chapter or paragraph number only when it is in the text you read. Otherwise cite the document title alone.
   Quote thresholds, deadlines and channels exactly as written (for example "within 10 working days to the unit, 30 to the regulator", "exempt up to Rp1,000,000").
4. Where no source exists (an internal SOP you could not find), use a general standard (for example ISO 27001) and flag the case for confirmation.
   Example domains used in phishing cases must be visibly made up, or lookalikes of the client's real domain.

## Writing cases
- Each case is a real situation from the players' work, in their words: their customers, partners and documents.
  Don't use other sectors' terms (for example "nasabah" for an insurer's claimants).
- `prompt`: what the player sees in the game, short enough for a label or a sign.
- `action`: the correct thing to do. `reason`: one line a player understands. `source`: the document (and article if verified).
- Order: obvious first, subtle last. Keep the totals the GDD fixes, so times stay comparable.
- Mark everything as a sample that needs the client's check, in the UI and in the data.
- Check the fit on screen: word lengths in letter tiles and grids, and long sentences in cards and buttons.

## The review file (`docs/CONTENT-REVIEW.md`)
- One table per game: id, situation, correct action, reason, source, and **"needs confirmation"** (empty, or what exactly is uncertain).
- Generate it from the game data with a small script (import the modules and read `CASES`), so it never drifts from what players see. Rerun it after every content edit.
- Offer it as a download on the landing page next to the GDD, and list the open points in GDD section 14.

## After a rewrite
- `grep` the whole site for terms that must be gone (old sector words, wrong laws, wrong domains). The result must be empty.
- Spot-check three or four key facts back in the extracted source text, with line numbers.
- Replay each changed round at 390 px for overflow.
