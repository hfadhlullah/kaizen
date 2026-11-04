import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setPreview } from "./preview.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "kz-preview-"));

test("a localhost url is recorded for the board, not opened", () => {
  const s = tmp();
  expect(setPreview(s, "http://localhost:3000/x", s)).toBeNull();
  const p = JSON.parse(readFileSync(join(s, "preview.json"), "utf8"));
  expect(p.url).toBe("http://localhost:3000/x");
  expect(p.ws).toBe(s);
});

test("an outside address is refused", () => {
  const s = tmp();
  expect(setPreview(s, "https://example.com", s)).toContain("localhost");
  expect(existsSync(join(s, "preview.json"))).toBe(false);
});

test("a screenshot is copied under attachments/", () => {
  const s = tmp();
  writeFileSync(join(s, "a.png"), "x");
  expect(setPreview(s, "a.png", s)).toBeNull();
  const p = JSON.parse(readFileSync(join(s, "preview.json"), "utf8"));
  expect(existsSync(join(s, p.image))).toBe(true);
  expect(setPreview(s, "nope.png", s)).not.toBeNull();
});
