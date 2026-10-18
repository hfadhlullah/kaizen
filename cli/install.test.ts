// `kaizen uninstall` against throwaway folders only. Every path it may delete comes
// from the env built here (HOME, KAIZEN_HOME, TMPDIR all scratch), never from the
// real environment: on 2026-10-01 an uninstall pointed at a checkout deleted it.
// Skipped on Windows: there uninstall also walks every drive (searchRoots) and
// strips kaizen links from real projects, whatever HOME says.
import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, symlinkSync, cpSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

const script = join(dirname(import.meta.path), "install.ts");
const it = test.skipIf(process.platform === "win32");
const REPO = "https://github.com/hfadhlullah/kaizen.git";

// `custom` sets KAIZEN_HOME to a folder outside HOME; otherwise it is unset and the
// install is the scratch home's own ~/kaizen.
const uninstall = (make: (k: string) => void, custom = false) => {
  const root = mkdtempSync(join(tmpdir(), "kz-uninstall-"));
  const home = join(root, "home"), k = custom ? join(root, "kaizen") : join(home, "kaizen");
  mkdirSync(home);
  make(k);
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: home, USERPROFILE: home, TMPDIR: root };
  if (custom) env.KAIZEN_HOME = k;
  const p = Bun.spawnSync([process.execPath, script, "uninstall", "--yes"], { cwd: home, env });
  const left = existsSync(k), out = p.stdout.toString();
  rmSync(root, { recursive: true, force: true });
  if (p.exitCode !== 0) throw new Error(p.stderr.toString());
  return { left, out };
};
const kaizenFiles = (k: string) => { mkdirSync(join(k, "cli"), { recursive: true }); writeFileSync(join(k, "cli", "install.ts"), ""); };
// A clone without the network: an empty repository whose origin is `url`.
const clone = (url: string, dirty = false, more?: (k: string) => void) => (k: string) => {
  mkdirSync(k, { recursive: true });
  Bun.spawnSync(["git", "init", "-q", k]);
  Bun.spawnSync(["git", "-C", k, "remote", "add", "origin", url]);
  if (dirty) writeFileSync(join(k, "mine.txt"), "uncommitted");
  more?.(k);
};
// The clone used as a project: its .kaizen/ is ignored, so `status --porcelain` alone reads clean.
const runs = (k: string) => {
  writeFileSync(join(k, ".git", "info", "exclude"), ".kaizen/\n");
  mkdirSync(join(k, ".kaizen", "runs", "r1"), { recursive: true });
  writeFileSync(join(k, ".kaizen", "runs", "r1", "state.json"), "{}");
};
const commit = (k: string) => {
  Bun.spawnSync(["git", "-C", k, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "mine"]);
};

it("uninstall leaves a KAIZEN_HOME other than ~/kaizen, git checkout or not", () => {
  const r = uninstall((k) => { kaizenFiles(k); mkdirSync(join(k, ".git")); }, true);
  expect(r.left).toBe(true);
  expect(r.out).toContain("KAIZEN_HOME is not ~/kaizen");
  expect(uninstall(kaizenFiles, true).left).toBe(true);
  // ~/kaizen is a link to the checkout KAIZEN_HOME names: same realpath, still refused.
  const linked = uninstall((k) => { kaizenFiles(k); mkdirSync(join(k, ".git")); symlinkSync(k, join(dirname(k), "home", "kaizen")); }, true);
  expect(linked.left).toBe(true);
  expect(linked.out).toContain("KAIZEN_HOME is not ~/kaizen");
});

it("uninstall leaves a ~/kaizen that is not a kaizen install", () => {
  const r = uninstall((k) => { mkdirSync(k); writeFileSync(join(k, "notes.txt"), "mine"); });
  expect(r.left).toBe(true);
  expect(r.out).toContain("not a kaizen install");
});

it("uninstall still removes the copy kaizen made without git", () => {
  expect(uninstall(kaizenFiles).left).toBe(false);
});

it.skipIf(!Bun.which("git"))("uninstall removes a clean clone of kaizen and keeps any other", () => {
  expect(uninstall(clone(REPO)).left).toBe(false);
  expect(uninstall(clone(REPO.replace(/\.git$/, ""))).left).toBe(false);
  const dirty = uninstall(clone(REPO, true));
  expect(dirty.left).toBe(true);
  expect(dirty.out).toContain("local changes");
  const other = uninstall(clone("https://example.com/someone/else.git"));
  expect(other.left).toBe(true);
  expect(other.out).toContain("another repository");
  const used = uninstall(clone(REPO, false, runs));
  expect(used.left).toBe(true);
  expect(used.out).toContain("ignored files");
  const unpushed = uninstall(clone(REPO, false, commit));
  expect(unpushed.left).toBe(true);
  expect(unpushed.out).toContain("commits not pushed");
});

// An npm package of this checkout, at a version no real release has: no .git, so its
// installer runs as `bunx kaizen-agent` would. Scratch HOME only; ~/kaizen is a fake.
const fromPackage = (make: (k: string) => void, custom = false) => {
  const root = mkdtempSync(join(tmpdir(), "kz-replace-"));
  const home = join(root, "home"), pkg = join(root, "pkg");
  const k = custom ? join(root, "kaizen") : join(home, "kaizen");
  mkdirSync(join(home, ".claude"), { recursive: true });   // an agent: the installer stops on a box with none
  const src = dirname(dirname(import.meta.path));
  for (const d of ["cli", "skills", "agents", "commands", "web", "package.json"]) {
    cpSync(join(src, d), join(pkg, d), { recursive: true, filter: (p) => !p.includes("node_modules") });
  }
  const pj = join(pkg, "package.json");
  writeFileSync(pj, readFileSync(pj, "utf8").replace(/"version": "[^"]*"/, '"version": "9.9.9"'));
  make(k);
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: home, USERPROFILE: home, TMPDIR: root };
  if (custom) env.KAIZEN_HOME = k;
  const p = Bun.spawnSync([process.execPath, join(pkg, "cli", "install.ts"), "--yes", "--global"], { cwd: home, env });
  const r = {
    out: p.stdout.toString(),
    version: existsSync(join(k, "package.json")) ? JSON.parse(readFileSync(join(k, "package.json"), "utf8")).version : null,
    oldKept: existsSync(join(`${k}.old`, "mine.txt")),
    mineInPlace: existsSync(join(k, "mine.txt")),
  };
  rmSync(root, { recursive: true, force: true });
  return r;
};

it.skipIf(!Bun.which("git"))("an npm package replaces a ~/kaizen clone with local edits, keeping it as .old", () => {
  const r = fromPackage(clone(REPO, true));
  expect(r.version).toBe("9.9.9");
  expect(r.mineInPlace).toBe(false);
  expect(r.oldKept).toBe(true);
  expect(r.out).toContain("replaced");
});

it.skipIf(!Bun.which("git"))("an npm package never replaces a development checkout", () => {
  expect(fromPackage(clone(REPO, true), true).mineInPlace).toBe(true);
  const unpushed = fromPackage(clone(REPO, true, commit));
  expect(unpushed.mineInPlace).toBe(true);
  expect(unpushed.out).toContain("commits not pushed");
});

it("upgrade with npm unreachable says not upgraded, never up to date", () => {
  const root = mkdtempSync(join(tmpdir(), "kz-offline-"));
  const home = join(root, "home");
  mkdirSync(join(home, ".claude"), { recursive: true });   // an agent: the installer stops on a box with none
  kaizenFiles(join(home, "kaizen"));
  const env = { PATH: process.env.PATH ?? "", HOME: home, TMPDIR: root, HTTPS_PROXY: "http://127.0.0.1:9", https_proxy: "http://127.0.0.1:9" };
  const p = Bun.spawnSync([process.execPath, script, "upgrade"], { cwd: home, env });
  rmSync(root, { recursive: true, force: true });
  expect(p.exitCode).not.toBe(0);
  expect(p.stdout.toString()).toContain("Not upgraded");
  expect(p.stdout.toString()).not.toContain("Up to date");
});

// initProject() runs only at the end of a full install, so its gitignore rules are read
// from the source and handed to git: what git ignores is the only answer that counts.
it("init's gitignore keeps run state and personal notes out, the docs vault in", () => {
  const src = readFileSync(script, "utf8");
  const rules = JSON.parse(src.match(/const rules = (".kaizen\/\*[^"]*");/)![1]!);
  const proj = mkdtempSync(join(tmpdir(), "kz-ignore-"));
  Bun.spawnSync(["git", "init", "-q", proj]);
  writeFileSync(join(proj, ".gitignore"), rules);
  const ignored = (p: string) => Bun.spawnSync(["git", "-C", proj, "check-ignore", "-q", p]).exitCode === 0;
  try {
    expect(ignored(".kaizen/runs/x/state.json")).toBe(true);
    expect(ignored(".kaizen/memory.md")).toBe(true);
    expect(ignored(".kaizen/notes/Standup.md")).toBe(true);
    expect(ignored(".kaizen/notes/Work/Standup.md")).toBe(true);
    expect(ignored(".kaizen/spec.md")).toBe(false);
    expect(ignored(".kaizen/config.yml")).toBe(false);
    expect(ignored(".kaizen/notes/Project/Index.md")).toBe(false);
    expect(ignored(".kaizen/notes/Project/Archive/Old.md")).toBe(false);
  } finally { rmSync(proj, { recursive: true, force: true }); }
});

// A box with no agent: the picker installs the chosen one with its official command and
// the kaizen install carries on in the same run. `curl` is a fake that hands back a
// script dropping a stub `claude` in ~/.local/bin, as the real installer does; nothing
// reaches the network.
const noAgentBox = () => {
  const root = mkdtempSync(join(tmpdir(), "kz-noagent-"));
  const home = join(root, "home"), pkg = join(root, "pkg"), bin = join(root, "bin");
  mkdirSync(home); mkdirSync(bin);
  const src = dirname(dirname(import.meta.path));
  for (const d of ["cli", "skills", "agents", "commands", "web", "package.json"]) {
    cpSync(join(src, d), join(pkg, d), { recursive: true, filter: (p) => !p.includes("node_modules") });
  }
  for (const t of ["sh", "bash", "mkdir", "chmod", "cat"]) { const w = Bun.which(t); if (w) symlinkSync(w, join(bin, t)); }
  symlinkSync(process.execPath, join(bin, "bun"));
  writeFileSync(join(bin, "curl"), `#!/bin/sh\necho "curl $*" >> "$HOME/curl.log"\nprintf 'mkdir -p "$HOME/.local/bin"\\nprintf "#!/bin/sh\\\\nexit 0\\\\n" > "$HOME/.local/bin/claude"\\nchmod +x "$HOME/.local/bin/claude"\\n'\n`, { mode: 0o755 });
  const env = { PATH: bin, HOME: home, USERPROFILE: home, TMPDIR: root, TERM: "xterm" };
  return { root, home, pkg, env };
};

it.skipIf(typeof (Bun as any).Terminal !== "function")("no agent: the picked agent is installed after a yes, and the kaizen install goes on", async () => {
  const { root, home, pkg, env } = noAgentBox();
  let out = "";
  const answered = new Set<string>();
  const proc = Bun.spawn([process.execPath, join(pkg, "cli", "install.ts"), "--global"], {
    cwd: home, env,
    terminal: { cols: 160, rows: 40, data: (_t: unknown, d: Uint8Array) => { out += new TextDecoder().decode(d); } },
  } as any);
  const answer = (prompt: string, keys: string) => {
    if (!answered.has(prompt) && out.includes(prompt)) { answered.add(prompt); (proc as any).terminal.write(keys); }
  };
  const until = Date.now() + 30_000;
  try {
    while (Date.now() < until && !out.includes("to install, or")) {
      answer("Which one would you like to install?", "\r");
      answer("Install Claude Code now?", "\r");
      answer("Start Claude Code now to sign in?", "\x1b[B\r");
      await Bun.sleep(100);
    }
    expect(out).toContain("curl -fsSL https://claude.ai/install.sh | bash");
    expect(readFileSync(join(home, "curl.log"), "utf8")).toContain("https://claude.ai/install.sh");
    expect(out).toContain("installed Claude Code");
    expect(existsSync(join(home, ".local", "bin", "claude"))).toBe(true);
    expect(out).toContain("to install, or");   // the kaizen install went on, no rerun
  } finally {
    proc.kill();
    await proc.exited;
    rmSync(root, { recursive: true, force: true });
  }
}, 40_000);

it("no agent, no terminal: the list is printed and nothing is installed", () => {
  const { root, home, pkg, env } = noAgentBox();
  const p = Bun.spawnSync([process.execPath, join(pkg, "cli", "install.ts")], { cwd: home, env });
  const ran = existsSync(join(home, "curl.log"));
  rmSync(root, { recursive: true, force: true });
  expect(p.exitCode).toBe(0);
  expect(p.stdout.toString()).toContain("Install one, then run this again.");
  expect(ran).toBe(false);
});
