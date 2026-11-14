import { expect, test } from "bun:test";
import {
  MAX_CHUNK,
  MIN_VOICED,
  SAMPLE_RATE,
  SILENCE,
  insertAt,
  makeChunker,
  makeOrdered,
  meter,
  modelFor,
  rms,
} from "./chunks.ts";
import { IDLE, idleMic, markMic, micOf } from "./dictation-store.ts";

const block = (n: number, v: number) => new Float32Array(n).fill(v);

test("the level meter is the block's loudness, capped at 1", () => {
  expect(rms(block(128, 0.5))).toBeCloseTo(0.5);
  expect(meter(0)).toBe("0.00");
  expect(meter(0.05)).toBe("0.40");
  expect(meter(0.5)).toBe("1.00");
});

test("a chunk is cut after speech and a pause, and its audio is kept in order", () => {
  const c = makeChunker();
  expect(c.push(block(MIN_VOICED, 0.1)).ready).toBe(false); // speech, no pause yet
  expect(c.push(block(SILENCE - 1, 0)).ready).toBe(false);
  expect(c.push(block(1, 0)).ready).toBe(true);
  const a = c.take()!;
  expect(a.length).toBe(MIN_VOICED + SILENCE);
  expect(a[0]).toBeCloseTo(0.1);
  expect(c.take()).toBeNull(); // taken: the next chunk starts empty
});

test("a long run of speech is cut at the maximum, and quiet or short audio is dropped", () => {
  const c = makeChunker();
  expect(c.push(block(MAX_CHUNK, 0.1)).ready).toBe(true);
  expect(c.take()!.length).toBe(MAX_CHUNK);
  c.push(block(SAMPLE_RATE / 2, 0.1)); // half a second of speech
  c.push(block(SILENCE, 0));
  expect(c.take()).toBeNull();
  c.push(block(SAMPLE_RATE * 3, 0));
  expect(c.take()).toBeNull();
});

test("transcripts are written in the order the chunks were cut", () => {
  const o = makeOrdered(),
    out: string[] = [];
  o.reserve(0);
  o.reserve(1);
  o.reserve(2);
  o.set(1, "two");
  expect(o.drain((t) => out.push(t))).toBe(false); // chunk 0 has not come back
  expect(out).toEqual([]);
  o.set(0, "one");
  expect(o.drain((t) => out.push(t))).toBe(false);
  expect(out).toEqual(["one", "two"]);
  o.set(2, "");
  expect(o.drain((t) => out.push(t))).toBe(true); // a failed chunk counts as empty text
  expect(out).toEqual(["one", "two", ""]);
  expect(o.waiting).toBe(0);
});

test("text lands at the caret with a space between words, clamped to the field", () => {
  expect(insertAt("", 0, "hello")).toEqual({ value: "hello", at: 5 });
  expect(insertAt("hello", 5, "world")).toEqual({ value: "hello world", at: 11 });
  expect(insertAt("hello ", 6, "world")).toEqual({ value: "hello world", at: 11 });
  expect(insertAt("a c", 1, "b")).toEqual({ value: "a b c", at: 3 });
  expect(insertAt("ab", 99, "c")).toEqual({ value: "ab c", at: 4 });
});

test("an unknown or missing model setting means small", () => {
  expect(modelFor("tiny")).toBe("tiny");
  expect(modelFor("large-v3-turbo")).toBe("large-v3-turbo");
  expect(modelFor("huge")).toBe("small");
  expect(modelFor(undefined)).toBe("small");
});

test("a button's state is its own and is dropped when it goes idle", () => {
  expect(micOf("a")).toEqual(IDLE);
  markMic("a", { loading: true, busy: true });
  markMic("a", { pct: 40 });
  expect(micOf("a")).toEqual({ loading: true, pct: 40, on: false, busy: true });
  expect(micOf("b")).toEqual(IDLE);
  markMic("a", { loading: false, pct: null, on: true, busy: false });
  expect(micOf("a").on).toBe(true);
  idleMic("a");
  expect(micOf("a")).toEqual(IDLE);
});
