# The interview: before a word of the book is written

A new book starts with an interview, never with a draft. The answers become `book/brief.md`,
which the author approves before the outline is drafted. Skip only the questions the author has already answered
in their request, and say which ones you took from it.

## How to ask

- One round at a time, with AskUserQuestion, at most 4 questions per round, 2–4 concrete options
  each. Free text is always available, so never add an "other" option.
- Put the recommended or most common choice first. Fill options from what is already known: a
  romance author is offered romance tropes, not hard-sci-fi subgenres.
- Ask in the author's language. If they wrote in Indonesian, every question and option is in Indonesian.
- Four rounds is normal, and six is the limit. Once the brief is good enough to outline from, stop asking and write it.
- An answer that changes the shape of the book (fiction to memoir, novel to short-story collection)
  restarts the round it belongs to, not the whole interview.

## Round 1 — what kind of book

| Question | Typical options |
|---|---|
| What kind of book? | Novel / novella · short-story collection · memoir or biography · non-fiction (history, essays, religious, self-help, how-to) · children's book |
| Genre (fiction) | science fiction · romance · fantasy · mystery/thriller · horror · literary · historical · young adult |
| Subject (non-fiction) | Ask for the subject in one line, then: argument · narrative history · practical guide · collected essays/articles |
| Who reads it? | Age band (children 6–9 · middle grade · young adult · adult), and general readers or specialists |

## Round 2 — size and voice

| Question | Typical options |
|---|---|
| Language | The author's language first; bilingual front matter if asked |
| Length | Short (~15k words, 6–10 chapters) · novella (~30k, 10–15) · novel (~70k, 20–30) · long (100k+, consider volumes) |
| Point of view (fiction) | first person · close third, one character · third, several characters · omniscient |
| Tense (fiction) | past · present |
| Tone | Offer 3–4 tones that fit the genre: romance → warm & witty / slow-burn & aching / steamy / sweet & clean; thriller → cold & clipped / paranoid / procedural |
| Voice reference | "Like which book or author?" Use the answer for voice only, and never imitate the text itself |

## Round 3 — the story or the argument

Fiction:
- Premise in one or two sentences: who wants what, what stands in the way, and what is at stake.
- The protagonist: name, age, the flaw, and what they want versus what they need.
- Two to four other main characters, each with their role in one line.
- Setting: place, time, and the one rule of this world that matters (magic system, tech, social order).
- Ending: happy / bittersweet / tragic / open. For a romance, HEA (happily ever after) or HFN (happy for now) is a genre promise; ask, don't assume.
- Content limits: violence, sex, language. What is on the page, implied, or off limits.

Non-fiction:
- Thesis or promise: what the reader knows or can do after the last page.
- Sources the author has: notes, articles, interviews, earlier writing. Existing text is the author's
  material and is used as it is; it is never rewritten without asking.
- Structure: chronological · thematic · problem→solution · collected pieces grouped into parts.
- Facts and citations: footnotes or endnotes · a bibliography · none.

## Round 4 — the object

| Question | Options |
|---|---|
| Look (`style` in book.json) | classic · romance · scifi · fantasy · thriller · literary · children. Name the one that matches the genre first, with its one-line note from `assets/styles.json` |
| Cover | Typeset cover in the style's colours (default) · their own image (ask for the file; 2:3 portrait, at least 1200×1800) |
| Parts and volumes | One volume · parts (`#` headings) · several printed volumes (very long books) |
| Front matter | Dedication · copyright line · preface or foreword (who writes it) |
| Where it goes | Just the files · a website with link previews (ask for the domain) · print only |

## The brief

Write `book/brief.md`. The author approves it, and it is the scope for everything after:

```markdown
# Brief — <working title>
- Kind / genre: …            - Readers: …
- Language: …                - Length: … words, … chapters
- POV / tense: …             - Tone: …   (voice like: …)
- Premise / thesis: …
- Characters / sources: …
- Setting / structure: …
- Ending / promise: …
- Content limits: …
- Look: style `…`, cover: …, parts: …, volumes: …
- Front matter: …
- Delivery: …
```

Then create `book/book.json` from it (title, author, lang, style, and so on) and move on to the outline in
[`writing.md`](writing.md).
