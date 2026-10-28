import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { wikilinks, boardLink, resolve as resolveNote } from "../web/notes-lib.ts";

const git = (root: string, args: string[]) => {
  const p = Bun.spawnSync(["git", ...args], { cwd: root });
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

export function lintDocs(root: string): string[] {
  const vault = join(root, ".kaizen", "notes", "Project");
  if (!existsSync(join(vault, "Index.md"))) return ["missing Project/Index.md (run /kaizen docs first)"];
  const errors: string[] = [];
  const names = walk(vault).filter((p) => p.endsWith(".md")).map((p) => p.slice(0, -3));
  const index = readFileSync(join(vault, "Index.md"), "utf8");
  if (index.split(/\r?\n/).length - Number(index.endsWith("\n")) >= 60) errors.push("Project/Index.md: must be under 60 lines");
  const listed = new Set(wikilinks(index).filter((w) => !boardLink(w)).map((w) => resolveNote(w.name, names)).filter(Boolean));
  const covered: { path: string; directory: boolean }[] = [];
  const inGit = !!Bun.which("git") && git(root, ["rev-parse", "--show-toplevel"]) !== null;
  for (const name of names) {
    const file = join(vault, `${name}.md`);
    const text = readFileSync(file, "utf8");
    const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1] ?? "";
    const field = (key: string) => new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(front)?.[1]?.trim();
    for (const w of wikilinks(text)) if (!boardLink(w) && !resolveNote(w.name, names)) errors.push(`Project/${name}.md: broken link [[${w.target}]]`);
    if (name.startsWith("Archive/")) continue;
    if (name !== "Index" && name !== "Log" && !listed.has(name)) errors.push(`Project/${name}.md: not listed in Index.md`);
    for (const key of ["description", "tags", "updated", ...((name === "Index" || name === "Log") ? [] : ["sources"])])
      if (!field(key)) errors.push(`Project/${name}.md: missing ${key}`);
    if (name === "Index" || name === "Log") continue;
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
