import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { wikilinks, boardLink, resolve as resolveNote } from "../web/notes-lib.ts";

const git = (root: string, args: string[]) => {
  const p = Bun.spawnSync(["git", ...args], { cwd: root, windowsHide: true });
  return p.exitCode === 0 ? p.stdout.toString() : null;
};

const walk = (dir: string, prefix = ""): string[] => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const name = prefix ? `${prefix}/${e.name}` : e.name;
    return e.isDirectory() ? walk(join(dir, e.name), name) : e.isFile() ? [name] : [];
  });
};

const sourceFile = (root: string, path: string) => {
  if (path.startsWith(".kaizen/") || /(^|\/)(node_modules|vendor|dist|build|coverage|\.next|public\/quran)(\/|$)/.test(path)) return false;
  if (/(^|\/)(bun\.lock|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock)$/.test(path)) return false;
  if (/\.(png|jpe?g|gif|webp|ico|svg|mp[34]|ogg|wav|pdf|woff2?|ttf|otf|zip|gz|exe|dll|so|db|sqlite|map)$/i.test(path)) return false;
  if (/\.js$/.test(path) && (existsSync(join(root, path.replace(/\.js$/, ".ts"))) || existsSync(join(root, path.slice(0, -3))))) return false;
  return true;
};

const BUDGET = 16 * 1024;
const PATHLIKE = /^[A-Za-z0-9_.@-]+(\/[A-Za-z0-9_.@-]+)+\.[A-Za-z0-9]{1,5}$/;
const split = (text: string) => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  return { front: m?.[1] ?? "", body: m ? text.slice(m[0].length) : text };
};
const inside = (root: string, path: string) => {
  const f = resolve(root, path);
  return f.startsWith(resolve(root) + sep) ? f : null;
};
// `## In plain words` up to the next `## ` heading, or null when the note has none.
const plainWords = (body: string) => {
  const m = /^## In plain words[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body);
  return m ? m[1] : null;
};

// What the vault costs an agent: the Index is loaded into every session, a note when opened.
export function docsCost(root: string) {
  const vault = join(root, ".kaizen", "notes", "Project");
  const tokens = (file: string) => Math.round(Buffer.byteLength(readFileSync(file, "utf8")) / 4);
  const index = existsSync(join(vault, "Index.md")) ? tokens(join(vault, "Index.md")) : 0;
  let largest = { name: "", tokens: 0 };
  for (const p of walk(vault).filter((p) => p.endsWith(".md") && !p.startsWith("Archive/") && p !== "Index.md" && p !== "Log.md")) {
    const t = tokens(join(vault, p));
    if (t > largest.tokens) largest = { name: p.slice(0, -3), tokens: t };
  }
  return { index, largest };
}

export function lintDocs(root: string): string[] {
  const vault = join(root, ".kaizen", "notes", "Project");
  if (!existsSync(join(vault, "Index.md"))) return ["missing Project/Index.md (run /kaizen docs first)"];
  const errors: string[] = [];
  const names = walk(vault).filter((p) => p.endsWith(".md")).map((p) => p.slice(0, -3));
  const index = readFileSync(join(vault, "Index.md"), "utf8");
  if (index.split(/\r?\n/).length - Number(index.endsWith("\n")) >= 60) errors.push("Project/Index.md: must be under 60 lines");
  const linksOf = (text: string) => wikilinks(text).filter((w) => !boardLink(w)).map((w) => resolveNote(w.name, names)).filter(Boolean);
  const listed = new Set(linksOf(index));
  // A sub-note `A/B` is listed by its hub `A` as well as by the Index.
  const listedBy = (name: string) => {
    const hub = name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : null;
    return listed.has(name) || (!!hub && names.includes(hub) && linksOf(readFileSync(join(vault, `${hub}.md`), "utf8")).includes(name));
  };
  const covered: { path: string; directory: boolean }[] = [];
  const inGit = !!Bun.which("git") && git(root, ["rev-parse", "--show-toplevel"]) !== null;
  for (const name of names) {
    const file = join(vault, `${name}.md`);
    const text = readFileSync(file, "utf8");
    const { front, body } = split(text);
    const field = (key: string) => new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(front)?.[1]?.trim();
    for (const w of wikilinks(text)) {
      if (boardLink(w)) continue;
      const to = resolveNote(w.name, names);
      if (!to) errors.push(`Project/${name}.md: broken link [[${w.target}]]`);
      // The board resolves a bare name into a folder; an agent reading raw files cannot.
      else if (name !== "Log" && !w.name.includes("/") && to.includes("/") && !name.startsWith("Archive/")) errors.push(`Project/${name}.md: link [[${w.target}]] is in a folder: write [[${to}]]`);
    }
    if (name.startsWith("Archive/")) continue;
    if (name !== "Index" && name !== "Log" && !listedBy(name)) errors.push(`Project/${name}.md: not listed in Index.md${name.includes("/") ? " or its hub" : ""}`);
    if (name !== "Log") for (const m of body.matchAll(/`([^`\n]+)`/g)) {
      const p = m[1]!;
      if (!PATHLIKE.test(p)) continue;
      const top = inside(root, p.split("/")[0]!);
      if (!top || !existsSync(top) || !statSync(top).isDirectory()) continue;
      const f = inside(root, p);
      if (f && !existsSync(f)) errors.push(`Project/${name}.md: dead path ${p}`);
    }
    for (const key of ["description", "tags", "updated", ...((name === "Index" || name === "Log") ? [] : ["sources"])])
      if (!field(key)) errors.push(`Project/${name}.md: missing ${key}`);
    if (name === "Index" || name === "Log") continue;
    const size = Buffer.byteLength(body);
    if (size > BUDGET) errors.push(`Project/${name}.md: over budget (${Math.round(size / 1024)} KB > 16 KB): split into a hub and sub-notes`);
    const plain = plainWords(body);
    if (plain === null) errors.push(`Project/${name}.md: In plain words missing`);
    else if (plain.split(/\r?\n/).filter((l) => l.trim()).length > 8) errors.push(`Project/${name}.md: In plain words too long (over 8 lines)`);
    else if ((plain.match(/`[^`\n]+`/g) ?? []).length > 2) errors.push(`Project/${name}.md: In plain words not plain (over 2 code spans)`);
    const date = field("updated");
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push(`Project/${name}.md: invalid updated date`);
    const raw = field("sources");
    if (!raw) continue;
    if (!/^\[.*\]$/.test(raw)) { errors.push(`Project/${name}.md: sources must be a list`); continue; }
    const sources = raw.slice(1, -1).split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
    if (!sources.length) errors.push(`Project/${name}.md: empty sources`);
    for (const path of sources) {
      const absolute = resolve(root, path);
      if (!absolute.startsWith(resolve(root) + sep) || !existsSync(absolute) || !realpathSync(absolute).startsWith(realpathSync(root) + sep)) { errors.push(`Project/${name}.md: missing source ${path}`); continue; }
      covered.push({ path: relative(root, absolute).replaceAll("\\", "/"), directory: statSync(absolute).isDirectory() });
    }
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && sources.length) {
      const paths = sources.filter((p) => { const f = resolve(root, p); return f.startsWith(resolve(root) + sep) && existsSync(f) && realpathSync(f).startsWith(realpathSync(root) + sep); });
      const later = `${date} 23:59:59`;
      let stale = false;
      if (inGit) {
        const history = git(root, ["log", `--after=${later}`, "--format=", "--name-only", "--", ...paths.map((p) => `:(literal)${p}`)]);
        const dirty = git(root, ["ls-files", "-m", "-d", "-o", "--exclude-standard", "-z", "--", ...paths.map((p) => `:(literal)${p}`)]);
        if (history === null || dirty === null) errors.push(`Project/${name}.md: git history check failed`);
        stale = !!history?.trim();
        stale ||= (dirty ?? "").split("\0").some((p) => p && (existsSync(join(root, p)) ? statSync(join(root, p)).mtimeMs : Date.now()) > new Date(`${date}T23:59:59`).getTime());
      } else stale = paths.some((p) => {
        const f = resolve(root, p);
        return (statSync(f).isDirectory() ? walk(f).map((x) => join(f, x)) : [f]).some((x) => statSync(x).mtimeMs > new Date(`${date}T23:59:59`).getTime());
      });
      if (stale) errors.push(`Project/${name}.md: stale (sources changed after ${date})`);
    }
  }
  const tracked = inGit ? git(root, ["ls-files", "-z"]) : null;
  if (inGit && tracked === null) errors.push("git source listing failed");
  const files = inGit ? (tracked ?? "").split("\0").filter(Boolean) : walk(root);
  for (const path of files) {
    if (!sourceFile(root, path) || covered.some((c) => path === c.path || (c.directory && path.startsWith(c.path + "/")))) continue;
    errors.push(`uncovered: ${path}`);
  }
  return errors.sort();
}
