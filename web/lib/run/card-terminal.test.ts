import { expect, test } from "bun:test";
import { setServer } from "@lib/server";
import { pruneTerms, showTerm, termStop } from "./card-terminal.ts";
import { getPanel, setPanel } from "./panel-store.ts";

const cards = (...keys: string[]) =>
  setServer({ state: { cards: keys.map((k) => ({ pty: { key: k, all: [k] } })) } as never });

test("a card's terminal is kept mounted when another body shows, and again when it comes back", () => {
  cards("a", "b");
  showTerm({ pty: { key: "a" } });
  expect(getPanel().body).toBe("term");
  expect(getPanel().terms.map((t) => t.key)).toEqual(["a"]);
  // another card's terminal: the first stays in the list (hidden by the panel), the second is added
  showTerm({ pty: { key: "b" } });
  expect(getPanel().term?.key).toBe("b");
  expect(getPanel().terms.map((t) => t.key)).toEqual(["a", "b"]);
  // a document tab replaces the body: nothing is unmounted
  termStop();
  setPanel({ body: "doc" });
  expect(getPanel().terms.map((t) => t.key)).toEqual(["a", "b"]);
  // the same terminal shown again is the same entry, not a second one
  showTerm({ pty: { key: "a" } });
  expect(getPanel().terms.map((t) => t.key)).toEqual(["a", "b"]);
});

test("a terminal goes when its session is no card's any more", () => {
  cards("a", "b");
  showTerm({ pty: { key: "a" } });
  showTerm({ pty: { key: "b" } });
  cards("b");
  pruneTerms();
  expect(getPanel().terms.map((t) => t.key)).toEqual(["b"]);
});
