// Copy the files the npm package ships (root package.json "files") into
// build/kaizen, which electron-builder adds to the app as resources/kaizen.
import { cpSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

const root = join(import.meta.dir, "..", "..");
const out = join(import.meta.dir, "..", "build", "kaizen");
const pkg = await Bun.file(join(root, "package.json")).json();

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const skip = (p: string) => basename(p) === "__pycache__" || p.endsWith(".test.ts") || basename(p) === "node_modules";
for (const entry of [...pkg.files.filter((f: string) => !f.startsWith("!")), "package.json"]) {
  const from = join(root, entry);
  if (!existsSync(from)) throw new Error(`missing ${entry}`);
  cpSync(from, join(out, entry), { recursive: true, dereference: true, filter: (p) => !skip(p) });
}
console.log(`staged kaizen ${pkg.version} into ${out}`);
