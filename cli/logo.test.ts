import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { projectLogo } from "./logo.ts";

test("projectLogo finds a fixed-name logo and nothing else", () => {
  const root = mkdtempSync(join(tmpdir(), "kz-logo-"));
  mkdirSync(join(root, ".kaizen"));
  expect(projectLogo(join(root, ".kaizen"))).toBeNull();
  writeFileSync(join(root, "brand.png"), "x");
  expect(projectLogo(join(root, ".kaizen"))).toBeNull();
  mkdirSync(join(root, "public"));
  writeFileSync(join(root, "public", "favicon.svg"), "<svg/>");
  expect(projectLogo(join(root, ".kaizen"))).toBe(join(root, "public", "favicon.svg"));
  writeFileSync(join(root, "logo.png"), "x");
  expect(projectLogo(join(root, ".kaizen"))).toBe(join(root, "logo.png"));
});
