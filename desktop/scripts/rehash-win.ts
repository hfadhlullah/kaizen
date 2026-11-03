// After SignPath signs the Windows installer its bytes change, so latest.yml's
// sha512 and size would make electron-updater reject the update. Rewrite them from
// the signed file, and drop the blockmap (built from the unsigned bytes): without
// it electron-updater downloads the whole installer instead of a diff.
import { createHash } from "node:crypto";
import { readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? join(import.meta.dir, "..", "release");
const yml = join(dir, "latest.yml");
let text = readFileSync(yml, "utf8");
const file = text.match(/^path: (.+)$/m)?.[1].trim();
if (!file) throw new Error(`no path: in ${yml}`);
const bytes = readFileSync(join(dir, file));
const sha = createHash("sha512").update(bytes).digest("base64");
const size = statSync(join(dir, file)).size;
text = text.replace(/sha512: .+/g, `sha512: ${sha}`).replace(/size: \d+/g, `size: ${size}`).replace(/\n\s*blockMapSize: \d+/, "");
writeFileSync(yml, text);
rmSync(join(dir, `${file}.blockmap`), { force: true });
console.log(`latest.yml now matches the signed ${file} (${size} bytes)`);
