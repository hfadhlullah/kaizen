// Worked example: a story deck for a fictional product ("Ledgerly", bookkeeping for small cafés).
// No photos needed — it uses the image-free helpers. Copy into ~/.kaizen/decks/<slug>/ next to kit.js
// and run: node build-example.js  (then ./qa.sh build-example.js to check it).
// In a real deck most beats are photo stories: d.story("bg01", {...}) after prep_images.py made bg/bg01.jpg.
const { makeDeck } = require("./kit");

const d = makeDeck("Ledgerly — The Closing Hour", {
  GOLD: "D9A441", GOLD_BG: "D9A441", // brand accent; colours are hex without '#'
});

d.pause("Every café closes at ten.", "The owner's real work starts after that.",
  "Open on a feeling, not the product. Pause for two seconds.");
d.cards("Act II — The pieces", "Three notebooks, one business.", [
  ["Morning", "Supplier invoices", "Paid from the owner's phone, noted somewhere."],
  ["Afternoon", "Cash drawer", "Counted twice, written on the back of a receipt."],
  ["Night", "Spreadsheet", "Retyped from both, after closing."],
], "Speaker note: numbers only with a source on the slide.", "Each piece is true. None of them talk to each other.");
d.question("What if the books closed themselves?", "The turn. Say it slowly.");
d.reveal("Ledgerly", "Bookkeeping that closes with the café.", "Invoices · Cash · Reports",
  "First time the product is named.");
d.cta(null, {
  kick: "Next step", label: "Book a demo",
  title: "See your own numbers in 20 minutes.",
  sub: "A demo with a sample of your last month's receipts.",
  facts: "Web and mobile · English and Bahasa Indonesia",
  contact: "[Name] · [WhatsApp] · [Email]", site: "[website]",
  notes: "Fill the contact placeholders before presenting.",
});
d.pres.writeFile({ fileName: "Ledgerly-example.pptx" }).then((f) => console.log(f));
