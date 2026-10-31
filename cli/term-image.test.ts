import { expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { imageExt, MAX_IMAGE, saveImage } from "./term-image.ts";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

test("the type comes from the bytes", () => {
  expect(imageExt(png)).toBe("png");
  expect(imageExt(new TextEncoder().encode("RIFF0000WEBP"))).toBe("webp");
  expect(imageExt(new TextEncoder().encode("<svg onload=x>"))).toBeNull();
});

test("saves an image and refuses the rest", () => {
  const dir = mkdtempSync(join(tmpdir(), "kz-img-"));
  const f = saveImage(png, dir)!;
  expect(f.endsWith(".png") && existsSync(f)).toBe(true);
  expect(saveImage(new Uint8Array(4), dir)).toBeNull();
  const big = new Uint8Array(MAX_IMAGE + 1);
  big.set(png);
  expect(saveImage(big, dir)).toBeNull();
});
