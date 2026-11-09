import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accountDir, addAccount, signedIn, renameAccount, linkKaizen, readAccounts, removeAccount, resolveAccount, setDefaultAccount } from "./accounts.ts";
import { claudeUsageAt } from "./usage.ts";

let t: string;
beforeEach(() => { t = mkdtempSync(join(tmpdir(), "kz-acct-")); process.env.KAIZEN_ACCOUNTS_HOME = t; });
afterEach(() => { delete process.env.KAIZEN_ACCOUNTS_HOME; rmSync(t, { recursive: true, force: true }); });
const add = (tool = "claude", name = "Work") => (addAccount(tool, name) as { id: string }).id;

test("no accounts: normal login, no env", () => {
  expect(resolveAccount("claude", undefined, false)).toEqual({});
  expect(resolveAccount("gemini", undefined, false)).toEqual({});
});
test("default, pick and normal login resolve; modes are private", () => {
  const id = add();
  setDefaultAccount("claude", "");
  if (process.platform !== "win32") { // no POSIX modes there
    expect(statSync(accountDir(id)).mode & 0o777).toBe(0o700);
    expect(statSync(join(t, "accounts.json")).mode & 0o777).toBe(0o600);
  }
  expect(resolveAccount("claude", undefined, false)).toEqual({});
  setDefaultAccount("claude", id);
  expect(resolveAccount("claude", undefined, false)).toMatchObject({ dir: accountDir(id), envVar: "CLAUDE_CONFIG_DIR" });
  expect(resolveAccount("claude", "", false)).toEqual({});
  expect(resolveAccount("codex", undefined, false)).toEqual({});
});
test("missing, unknown, wrong-tool or Windows accounts refuse, with no fallback", () => {
  const id = add();
  setDefaultAccount("claude", id);
  rmSync(accountDir(id), { recursive: true });
  expect(resolveAccount("claude", undefined, false).error).toMatch(/missing/);
  expect(resolveAccount("claude", "abcdefgh1234", false).error).toMatch(/no longer/);
  expect(resolveAccount("codex", id, false).error).toMatch(/no longer/);
  mkdirSync(accountDir(id));
  expect(resolveAccount("claude", id, true).error).toMatch(/Windows/);
});
test("remove keeps the folder unless asked; ids can't leave the folder", () => {
  const id = add();
  setDefaultAccount("claude", id);
  expect(removeAccount(id)).toBeNull();
  expect(existsSync(accountDir(id))).toBe(true);
  expect(readAccounts().default.claude).toBeUndefined();
  const b = add("codex", "B");
  expect(removeAccount(b, true)).toBeNull();
  expect(existsSync(accountDir(b))).toBe(false);
  for (const bad of ["../x", "..", "a/b", ""]) expect(removeAccount(bad, true)).toBe("unknown account");
  expect(existsSync(t)).toBe(true);
});
test("names are validated", () => {
  expect("error" in addAccount("gemini", "x")).toBe(true);
  add();
  expect("error" in addAccount("claude", "Work")).toBe(true);
});
test("kaizen's links follow into an account folder", () => {
  const from = join(t, "from"), target = join(t, "skill-src");
  mkdirSync(join(from, "skills"), { recursive: true });
  mkdirSync(target);
  symlinkSync(target, join(from, "skills", "kaizen"));
  symlinkSync(target, join(from, "skills", "other"));
  linkKaizen(join(t, "acct"), "claude", from);
  expect(readlinkSync(join(t, "acct/skills/kaizen"))).toBe(realpathSync(target));
  expect(existsSync(join(t, "acct/skills/other"))).toBe(false);
});
test("usage reads the account folder; a 401 says sign in, with no token in the answer", async () => {
  const dir = join(t, "c");
  mkdirSync(dir);
  await Bun.write(join(dir, ".credentials.json"), JSON.stringify({ claudeAiOauth: { accessToken: "tok-secret" } }));
  let header = "";
  const r = await claudeUsageAt(dir, (async (_: string, o: any) => { header = o.headers.authorization; return new Response("", { status: 401 }); }) as any);
  expect(header).toContain("tok-secret");
  expect(r).toMatchObject({ expired: true });
  expect(JSON.stringify(r)).not.toContain("tok-secret");
  expect(await claudeUsageAt(join(t, "none"))).toBeNull();
});

test.skipIf(process.platform === "win32")("a run resumes on its own account and finds its conversation there, in a child with a fake claude", async () => {
  const dir = join(t, "proj"), id = add();
  mkdirSync(join(dir, ".kaizen", "runs", "r1"), { recursive: true });
  writeFileSync(join(dir, ".kaizen", "runs", "r1", "state.json"), "{}");
  mkdirSync(join(t, "bin"));
  writeFileSync(join(t, "bin", "claude"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const go = (pick: string) => {
    const script = `const { launchRun } = await import(${JSON.stringify(join(import.meta.dir, "state.ts"))});
      const r = launchRun({ severity: null, where: null, text: "x", raw: "x" }, ${JSON.stringify(dir)}, "r1", { agent: "claude", cwd: ${JSON.stringify(dir)}, card: true, ...${pick} });
      console.log(JSON.stringify(r)); process.exit(0);`;
    return JSON.parse(Bun.spawnSync([process.execPath, "-e", script], { env: { ...process.env, PATH: `${join(t, "bin")}:${process.env.PATH}` } }).stdout.toString());
  };
  const first = go(`{ account: ${JSON.stringify(id)} }`);
  if (!first.ok) return; // no pseudo-terminal here
  const sid = first.cmd[first.cmd.indexOf("--session-id") + 1];
  // macOS's temp path has two spellings; the launch keeps the one it was given.
  for (const d of [dir, realpathSync(dir)]) {
    const convo = join(accountDir(id), "projects", d.replace(/[^A-Za-z0-9]/g, "-"));
    mkdirSync(convo, { recursive: true });
    writeFileSync(join(convo, `${sid}.jsonl`), "{}\n");
  }
  // Every caller of firstSession, the board's Resume among them, with no env set here.
  const { firstSession, manualCommand } = await import("./state.ts");
  expect(firstSession(join(dir, ".kaizen"), "r1", "claude", realpathSync(dir))?.sessionId).toBe(sid);
  expect(manualCommand("/p", "claude", "", [], "CLAUDE_CONFIG_DIR='/a b'")).toBe("cd '/p' && CLAUDE_CONFIG_DIR='/a b' claude");
  const again = go("{}");
  expect(again.cmd).toContain("--resume");
  expect(again.cmd).toContain(sid);
  rmSync(accountDir(id), { recursive: true });
  expect(go("{}").why).toMatch(/missing/);
}, 20000);

test("no name: the tool's, numbered; rename after", () => {
  addAccount("claude", "");
  const b = (addAccount("claude", "") as { id: string }).id;
  expect(readAccounts().accounts.map((x) => x.name)).toEqual(["Claude", "Claude 2"]);
  expect(renameAccount(b, "Work")).toBeNull();
  expect(renameAccount(b, "Claude")).toMatch(/taken/);
  expect(renameAccount(b, "")).toBeTruthy();
  expect(renameAccount("nope", "x")).toBe("unknown account");
});

test("signed in follows the tool's login file", () => {
  const id = add("codex", "C");
  expect(signedIn(accountDir(id), "codex")).toBe(false);
  writeFileSync(join(accountDir(id), "auth.json"), "{}");
  expect(signedIn(accountDir(id), "codex")).toBe(true);
});

// Who is signed in comes from the tool's own status command, pointed at the account folder or
// the normal login; kaizen never opens the login files for it.
test("loginStatus asks the tool, per folder; hangs and missing tools fall back to the file check", async () => {
  const { loginStatus } = await import("./accounts.ts");
  const root = mkdtempSync(join(tmpdir(), "kz-login-")), bin = join(root, "bin"), home = join(root, "home");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(home, ".claude"), { recursive: true });
  // claude: signed in for the normal login, signed out when CLAUDE_CONFIG_DIR names an account.
  writeFileSync(join(bin, "claude"), `#!/bin/sh
echo "$*" >> "${join(root, "claude.args")}"
if [ -n "$CLAUDE_CONFIG_DIR" ]; then echo '{"loggedIn":false}'; else echo '{"loggedIn":true,"email":"me@example.com","subscriptionType":"max","authMethod":"claude.ai"}'; fi
`, { mode: 0o755 });
  writeFileSync(join(bin, "codex"), `#!/bin/sh
if [ -n "$CODEX_HOME" ]; then echo "Not logged in" >&2; exit 1; fi
echo "Logged in using an API key - sk-proj-abc***xyz"
`, { mode: 0o755 });
  const env = { PATH: `${bin}:/usr/bin:/bin`, HOME: home };
  expect(await loginStatus("claude", undefined, env)).toEqual({ signedIn: true, who: "me@example.com", plan: "max", via: "claude.ai", checked: "cli" });
  expect(await loginStatus("claude", join(root, "acct"), env)).toEqual({ signedIn: false, who: undefined, plan: undefined, via: undefined, checked: "cli" });
  expect(readFileSync(join(root, "claude.args"), "utf8").trim().split("\n")).toEqual(["auth status --json", "auth status --json"]);
  const codex = await loginStatus("codex", undefined, env);
  expect(codex).toEqual({ signedIn: true, via: "an API key", checked: "cli" });
  expect(JSON.stringify(codex)).not.toContain("sk-");
  expect(await loginStatus("codex", join(root, "acct2"), env)).toEqual({ signedIn: false, checked: "cli" });
  // A tool that hangs is cut off and the file check answers.
  writeFileSync(join(bin, "claude"), "#!/bin/sh\nsleep 30\n", { mode: 0o755 });
  const t0 = Date.now();
  expect(await loginStatus("claude", undefined, env, 300)).toEqual({ signedIn: false, checked: "file" });
  expect(Date.now() - t0).toBeLessThan(3000);
  // No tool on PATH: the file check.
  writeFileSync(join(home, ".claude", ".credentials.json"), "{}");
  expect(await loginStatus("claude", undefined, { PATH: "/nonexistent", HOME: home })).toEqual({ signedIn: true, checked: "file" });
});
