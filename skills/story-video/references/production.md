# What makes a video publish-grade

Learned by comparing deck-to-video renders against richer productions . The examples are from an Indonesian school product; apply the principles to any product.

## Layers, in order of impact
1. **Sound design**: room tone under every beat (`ambience`), one-shots on story moments (`pings` for
   "140 pesan", `keyboard`, `bell`), soft whoosh/tick on cuts, a hit on the reveal, a riser into the
   question. Music ducks under speech and only lifts at the reveal — never a dramatic swell unless
   the preset is drama.
2. **Captions**: always. Projectors and phones are often muted. Subtitle bar for 16:9, kinetic
   2–3-word captions for 9:16. Captions come from `words.json`, so they follow the voice exactly.
3. **Staged builds inside a beat**: numbers count up, list items arrive one by one with the voice,
   triptych panels arrive in turn. A whole slide appearing at once reads as a slideshow.
4. **Directed voice**: emotion tag per line, low and slow through the problem, lift at the question,
   warm and bright after the reveal. Fix mispronounced words by rewording, not by hoping.
5. **Rhythm**: vary beat length; hold on silence (`black` with `hold`); pace by preset.
6. **Real product**: actual screenshots / screen recordings for product beats. Stock photos of code
   or generic laptops are a last resort.
7. **Brand**: real logo reveal, consistent palette and type, the same end card every time.
8. **Texture**: grain + vignette for drama, light leaks for fun; consistent grade on every photo.
9. **Format-native**: 9:16 has its own script (hook in the first 2 s, ≤ 30 s), not a crop of 16:9.
10. **Delivery**: master loudness (−14 LUFS social, −16 presentation), SRT, thumbnail, credits.

## QA before delivering
- Stills from every film at 3–4 points: no text overlap, captions inside safe area, CTA not covered.
- Length matches the brief (tell the user when the story needs more).
- `master.sh` printed the final duration and LUFS.
- Credits file present; licence status stated (see licensing.md).
- Ask the user to listen once for pronunciation and the mix — the agent cannot hear.
