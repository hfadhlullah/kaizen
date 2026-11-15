import { expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { imageExt, MAX_IMAGE, MAX_FILE, saveImage, saveFile, safeFileName } from "./term-image.ts";

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

test("an attached file keeps a clean name in a folder of its own", () => {
  expect(safeFileName("../../etc/passwd")).toBe("passwd");
  expect(safeFileName("C:\\Users\\me\\report final (1).pdf")).toBe("report final (1).pdf");
  expect(safeFileName(".hidden")).toBe("hidden");
  expect(safeFileName("a<b>:c?.txt")).toBe("a_b_c_.txt");
  expect(safeFileName("")).toBe("file");
  const dir = mkdtempSync(join(tmpdir(), "kz-files-"));
  const a = saveFile(new Uint8Array([1, 2, 3]), "notes.md", dir)!, b = saveFile(new Uint8Array([1]), "notes.md", dir)!;
  expect(basename(a) === "notes.md" && basename(b) === "notes.md" && a !== b).toBe(true);
  expect(a.startsWith(dir)).toBe(true);
  expect(saveFile(new Uint8Array(), "empty.txt", dir)).toBeNull();
  expect(saveFile(new Uint8Array(MAX_FILE + 1), "big.bin", dir)).toBeNull();
});
