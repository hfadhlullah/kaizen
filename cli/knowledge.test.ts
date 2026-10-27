// Global knowledge, driven through the real CLI entry with a scratch HOME. Every
// spawn gets an env built from nothing but PATH, so no test can reach the real
// ~/.kaizen/knowledge or ~/.claude/settings.json.
import { test, expect, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir, homedir } from "node:os";
import { secretReason, addSessionHook, removeSessionHook, SESSION_HEADER } from "./knowledge.ts";

const script = join(dirname(import.meta.path), "install.ts");
const realKnowledge = join(homedir(), ".kaizen", "knowledge");
const realMtime = existsSync(realKnowledge) ? statSync(realKnowledge).mtimeMs : -1;
const roots: string[] = [];
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

const scratch = () => {
  const root = mkdtempSync(join(tmpdir(), "kz-knowledge-"));
  roots.push(root);
  const home = join(root, "home");
  mkdirSync(home);
  const project = (name: string, files: Record<string, string> = {}) => {
    const d = join(root, name);
    mkdirSync(join(d, ".kaizen"), { recursive: true });
    for (const [f, t] of Object.entries(files)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), t); }
    return d;
  };
  const kz = (cwd: string, ...a: string[]) => {
    const p = Bun.spawnSync([process.execPath, script, ...a], { cwd, env: { PATH: process.env.PATH ?? "", HOME: home, USERPROFILE: home, TMPDIR: root } });
    return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
  };
  const file = (track: string) => { try { return readFileSync(join(home, ".kaizen", "knowledge", `${track}.md`), "utf8"); } catch { return ""; } };
  return { root, home, project, kz, file };
};
const lesson = (...extra: string[]) => ["remember", "--track", "code", "--tags", "bun,testing", "--applies", "bun>=1.1; not node", "--run", "r1", ...extra];

test("secret check rejects keys, credentials, emails, IPs and private hosts", () => {
  for (const t of ["use sk-abcdefghijklmnop", "ghp_abcdefghijklmnopqrst", "-----BEGIN RSA PRIVATE KEY", "set password=hunter22", "mail ops@example.com",
    "server at 10.1.2.3", "db.acme.internal is slow", "token: abcdefABCDEF0123456789abcdefABCDEF01"]) expect(secretReason(t)).not.toBe("");
  for (const t of ["bun test --bail stops at the first failing file", "127.0.0.1 binds loopback only", "see https://bun.sh/docs/cli/test"]) expect(secretReason(t)).toBe("");
});

test("a rejected lesson leaves the file unchanged and says why", () => {
  const s = scratch(), a = s.project("a");
  const r = s.kz(a, ...lesson("connect to 192.168.1.20 first"));
  expect(r.code).toBe(1);
  expect(r.out).toContain("rejected (secret check)");
  expect(s.file("code")).toBe("");
});

test("applies, tags, source and the track are required; preferences are not writable", () => {
  const s = scratch(), a = s.project("a");
  expect(s.kz(a, "remember", "--track", "code", "--tags", "bun", "--run", "r1", "x").out).toContain("--applies is required");
  expect(s.kz(a, "remember", "--track", "code", "--applies", "y", "--run", "r1", "x").out).toContain("--tags is required");
  expect(s.kz(a, "remember", "--track", "code", "--tags", "bun", "--applies", "y", "x").out).toContain("--source");
  expect(s.kz(a, "remember", "--track", "preferences", "--tags", "tone", "--applies", "y", "--run", "r1", "x").out).toContain("written by hand");
  expect(s.file("preferences")).toBe("");
});

test("appends a same-tag lesson instead of merging, and lists the existing one", () => {
  const s = scratch(), a = s.project("a");
  expect(s.kz(a, ...lesson("spawnSync throws when the binary is not on PATH")).code).toBe(0);
  const r = s.kz(a, ...lesson("Bun.spawnSync raises if the executable is missing"));
  expect(r.code).toBe(0);
  expect(r.out).toContain("Same-tag lessons");
  expect(r.out).toContain("spawnSync throws when the binary");
  const body = s.file("code");
  expect(body).toContain("spawnSync throws when the binary");
  expect(body).toContain("Bun.spawnSync raises");
  expect(body).toMatch(/\(applies: bun>=1\.1; not node\) — \d{4}-\d{2}-\d{2} · a\/r1/);
});

test("run from a subfolder, remember uses the project's opt-out and name", () => {
  const s = scratch();
  const off = s.project("client", { ".kaizen/config.yml": "knowledge:\n  global: false\n" });
  mkdirSync(join(off, ".kaizen", "runs", "r1"), { recursive: true });
  expect(s.kz(join(off, ".kaizen", "runs", "r1"), ...lesson("from the run dir")).code).toBe(1);
  expect(s.file("code")).toBe("");
  const a = s.project("project-a");
  mkdirSync(join(a, "src", "deep"), { recursive: true });
  expect(s.kz(join(a, "src", "deep"), ...lesson("from a subfolder")).code).toBe(0);
  expect(s.file("code")).toContain("· project-a/r1");
});

test("multi-line --applies stays one line, bad tags and limits are refused", () => {
  const s = scratch(), a = s.project("a");
  expect(s.kz(a, "remember", "--track", "code", "--tags", "bun", "--applies", "bun>=1.1\nlinux", "--run", "r1", "one line please").code).toBe(0);
  expect(s.kz(a, "recall", "--tags", "bun").out).toContain("(applies: bun>=1.1 linux)");
  expect(s.kz(a, "remember", "--track", "code", "--tags", "bun]x", "--applies", "y", "--run", "r1", "x").out).toContain('tag "bun]x"');
  expect(s.kz(a, "recall", "--tags", "bun", "--limit", "abc").code).toBe(1);
  const before = s.file("code");
  expect(s.kz(a, "remember", "--track", "code", "--tags", "bun", "--applies", "y", "--source", "p/r1\nstray", "x").code).toBe(1);
  expect(s.file("code")).toBe(before);
  const spaced = s.project("my app");
  expect(s.kz(spaced, "remember", "--track", "code", "--tags", "bun", "--applies", "y", "--run", "r1", "spaced folder").code).toBe(0);
  expect(s.file("code")).toContain("· my-app/r1");
});

test("--replace rewrites only the named line", () => {
  const s = scratch(), a = s.project("a");
  s.kz(a, ...lesson("first lesson about bun tests"));
  s.kz(a, "remember", "--track", "code", "--tags", "go", "--applies", "go>=1.21", "--run", "r1", "second lesson about go");
  const n = s.file("code").split("\n").findIndex((l) => l.includes("first lesson")) + 1;
  expect(s.kz(a, ...lesson("--replace", String(n), "rewritten bun lesson")).code).toBe(0);
  const body = s.file("code");
  expect(body).not.toContain("first lesson");
  expect(body).toContain("rewritten bun lesson");
  expect(body).toContain("second lesson about go");
  expect(s.kz(a, ...lesson("--replace", "1", "x")).out).toContain("not a lesson");
});

test("versions in tags keep lessons apart, recall matches text words and honours the limit", () => {
  const s = scratch(), a = s.project("a");
  s.kz(a, "remember", "--track", "code", "--tags", "bun@1.1", "--applies", "bun 1.1 only", "--run", "r1", "lockfile is binary bun.lockb");
  s.kz(a, "remember", "--track", "code", "--tags", "bun@1.2", "--applies", "bun>=1.2", "--run", "r1", "lockfile is text bun.lock");
  const body = s.file("code");
  expect(body).toContain("binary bun.lockb");
  expect(body).toContain("text bun.lock");
  expect(s.kz(a, "recall", "--tags", "bun@1.2").out.split("\n")[0]).toContain("bun@1.2");
  s.kz(a, "remember", "--track", "code", "--tags", "ci", "--applies", "any runner", "--run", "r1", "flaky snapshot diffs come from locale-dependent dates");
  expect(s.kz(a, "recall", "--query", "why are snapshot tests flaky").out).toContain("locale-dependent");
  expect(s.kz(a, "recall", "--tags", "bun", "--limit", "1").out.trim().split("\n")).toHaveLength(1);
  expect(s.kz(a, "recall", "--tags", "elixir").out.trim()).toBe("Recalled: none");
});

test("session hook merge keeps other hooks, is idempotent, leaves invalid JSON alone, removes only ours", () => {
  const s = scratch(), f = join(s.home, ".claude", "settings.json");
  mkdirSync(dirname(f), { recursive: true });
  const theirs = { model: "x", hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }] } };
  writeFileSync(f, JSON.stringify(theirs));
  expect(addSessionHook(f)).toBe("added");
  const once = readFileSync(f, "utf8");
  expect(addSessionHook(f)).toBe("");
  expect(readFileSync(f, "utf8")).toBe(once);
  const j = JSON.parse(once);
  expect(j.model).toBe("x");
  expect(JSON.stringify(j)).toContain("echo hi");
  expect(JSON.stringify(j)).toContain("recall --session");
  expect(removeSessionHook(f)).toBe(true);
  expect(JSON.parse(readFileSync(f, "utf8"))).toEqual(theirs);
  writeFileSync(f, "{ not json");
  expect(addSessionHook(f)).toContain("not valid JSON");
  expect(readFileSync(f, "utf8")).toBe("{ not json");
});

test("acceptance: saved in A, recalled and injected in B, opt-out A' writes nothing", () => {
  const s = scratch();
  const a = s.project("project-a");
  const saved = s.kz(a, "remember", "--track", "code", "--tags", "bun,testing", "--applies", "bun>=1.1", "--run", "2026-10-27-x",
    "bun test --bail stops at the first failing file, not the first failing test");
  expect(saved.code).toBe(0);
  expect(saved.out).toContain("Remembered (global):");

  const b = s.project("project-b", { "package.json": JSON.stringify({ devDependencies: { typescript: "5" } }), "bun.lock": "" });
  const found = s.kz(b, "recall", "--track", "code", "--tags", "bun", "--query", "make tests stop early");
  expect(found.out).toContain("--bail stops at the first failing file");
  expect(found.out).toContain("project-a/2026-10-27-x");
  const hook = s.kz(b, "recall", "--session");
  expect(hook.out.startsWith(SESSION_HEADER)).toBe(true);
  expect(hook.out).toContain("--bail");
  // A project with no matching stack gets nothing injected, not a fallback.
  const py = s.project("project-py", { "requirements.txt": "flask\n" });
  expect(s.kz(py, "recall", "--session").out).toBe("");

  const before = s.file("code");
  const secret = s.project("project-a2", { ".kaizen/config.yml": "knowledge:\n  # client work\n  global: false\n" });
  const refused = s.kz(secret, "remember", "--track", "code", "--tags", "bun", "--applies", "bun", "--run", "r9", "a lesson from client work");
  expect(refused.code).toBe(1);
  expect(refused.out).toContain("knowledge.global is false");
  expect(s.file("code")).toBe(before);
  expect(s.kz(secret, "recall", "--tags", "bun").out).toContain("--bail");

  // The global switch turns it off everywhere; a project can switch it back on.
  writeFileSync(join(s.home, ".kaizen", "config.yml"), "knowledge:\n  global: false\n");
  expect(s.kz(a, "remember", "--track", "code", "--tags", "bun", "--applies", "bun", "--run", "r2", "global off").code).toBe(1);
  const on = s.project("project-on", { ".kaizen/config.yml": "knowledge:\n  global: true\n" });
  expect(s.kz(on, "remember", "--track", "code", "--tags", "bun", "--applies", "bun", "--run", "r3", "project overrides global").code).toBe(0);

  expect(existsSync(realKnowledge) ? statSync(realKnowledge).mtimeMs : -1).toBe(realMtime);
});
