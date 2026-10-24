// `bun run release [patch|minor|major] [summary]`: bump, commit, test, publish, push.
// With no level, the commits since the last tag decide it: a `feat` makes a new minor
// (1.43.3 -> 1.44.0), anything else a patch; "BREAKING" anywhere makes a major.
// The summary defaults to those commits' subjects, prefixes dropped. A bump commit
// already made but never published (HEAD is "Release <version>:" with no tag) is reused.
import { readFileSync, writeFileSync } from "node:fs";

const sh = (cmd: string[]) => {
  const r = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "inherit" });
  if (r.exitCode !== 0) throw new Error(`${cmd.join(" ")} failed`);
  return r.stdout.toString().trim();
};
const run = (cmd: string[]) => {
  if (Bun.spawnSync(cmd, { stdio: ["inherit", "inherit", "inherit"] }).exitCode !== 0) process.exit(1);
};

export function nextVersion(v: string, level: string) {
  const [a, b, c] = v.split(".").map(Number);
  return level === "major" ? `${a + 1}.0.0` : level === "minor" ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
}
export function levelOf(log: string) {
  if (/BREAKING/.test(log)) return "major";
  return /^feat(\(.*?\))?!?:/m.test(log) ? "minor" : "patch";
}
export function summaryOf(subjects: string[]) {
  return subjects
    .filter((s) => /^(feat|fix|perf)(\(.*?\))?!?:/.test(s))
    .map((s) => s.replace(/^\w+(\(.*?\))?!?:\s*/, ""))
    .join("; ");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const forced = ["patch", "minor", "major"].includes(args[0]) ? args.shift() : null;
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const tagged = (v: string) => sh(["git", "tag", "-l", `v${v}`]) !== "";
  const head = sh(["git", "log", "-1", "--format=%s"]);
  if (sh(["git", "status", "--porcelain", "--untracked-files=no"])) {
    console.error("release: commit or drop your changes first");
    process.exit(1);
  }
  if (head.startsWith(`Release ${pkg.version}:`) && !tagged(pkg.version) && !forced) {
    console.log(`release: reusing the unpublished bump commit for ${pkg.version}`);
  } else {
    const last = sh(["git", "describe", "--tags", "--abbrev=0"]);
    const log = sh(["git", "log", "--format=%s%n%b", `${last}..HEAD`]);
    if (!log) {
      console.error(`release: nothing since ${last}`);
      process.exit(1);
    }
    const level = forced ?? levelOf(log);
    const v = nextVersion(pkg.version, level);
    const summary = args.join(" ") || summaryOf(sh(["git", "log", "--reverse", "--format=%s", `${last}..HEAD`]).split("\n")) || "maintenance";
    writeFileSync("package.json", readFileSync("package.json", "utf8").replace(`"version": "${pkg.version}"`, `"version": "${v}"`));
    const note = ".kaizen/notes/Project/Release and testing.md";
    try {
      writeFileSync(note, readFileSync(note, "utf8").replace(`version ${pkg.version} in this checkout`, `version ${v} in this checkout`));
    } catch {}
    sh(["git", "add", "package.json", note]);
    sh(["git", "commit", "-q", "-m", `Release ${v}: ${summary}`]);
    console.log(`release: ${pkg.version} -> ${v} (${level})`);
  }
  // Tests run in prepublishOnly; a failure stops here with the commit unpushed.
  run(["bun", "publish"]);
  run(["git", "push", "origin", "HEAD"]);
  run(["bun", "run", "publish:gh"]);
}
