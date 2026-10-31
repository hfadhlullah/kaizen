import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentEnabled, argsOf, commandOf, prefersBypass, publicPref, readPrefs, savePrefs, withEnv } from "./agent-prefs.ts";
import { awakeHolder, inhibitArgv, wantAwake } from "./keep-awake.ts";
import { agentChoices, detectDefaultAgent, launchPreview, launchRun, keepAwake } from "./state.ts";

let dir: string, file: string;
const known = ["claude", "codex", "cursor"];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kz-prefs-"));
  file = join(dir, "agents.json");
  process.env.KAIZEN_AGENT_PREFS = file;
});
afterEach(() => {
  delete process.env.KAIZEN_AGENT_PREFS;
  rmSync(dir, { recursive: true, force: true });
});

test("no file: defaults, and launch parts stay as they were", () => {
  const p = readPrefs(file);
  expect(agentEnabled("claude", p)).toBe(true);
  expect(commandOf("claude", p)).toBe("claude");
  expect(argsOf("claude", p)).toEqual([]);
  expect(prefersBypass("claude", p)).toBe(false);
  expect(withEnv(["claude", "x"], "claude", p, false)).toEqual(["claude", "x"]);
  expect(launchPreview(dir, "claude", p)).toBe("claude");
});

test("the file is private, and env values never reach the page's view", () => {
  expect(savePrefs({ agent: "claude", envName: "TOKEN", envValue: "s3cret" }, known, file)).toEqual({ ok: true });
  expect(statSync(file).mode & 0o777).toBe(0o600);
  expect(JSON.stringify(publicPref("claude", readPrefs(file)))).not.toContain("s3cret");
  expect(publicPref("claude", readPrefs(file)).env).toEqual(["TOKEN"]);
  expect(launchPreview(dir, "claude", readPrefs(file))).not.toContain("s3cret");
  expect(withEnv(["claude"], "claude", readPrefs(file), false)).toEqual(["env", "TOKEN=s3cret", "claude"]);
  expect(savePrefs({ agent: "claude", envRemove: "TOKEN" }, known, file)).toEqual({ ok: true });
  expect(publicPref("claude", readPrefs(file)).env).toEqual([]);
});

test("shell characters and dangerous names are refused, on save and on a hand-edited file", () => {
  for (const command of ["claude; rm -rf /", "$(x)", "a b", "`x`", "-x"]) expect("error" in savePrefs({ agent: "claude", command }, known, file)).toBe(true);
  for (const args of ["a;b", "$(x)", "'q'", "a|b"]) expect("error" in savePrefs({ agent: "claude", args }, known, file)).toBe(true);
  for (const n of ["PATH", "LD_PRELOAD", "DYLD_X", "a b", "1A", "NODE_OPTIONS"]) expect("error" in savePrefs({ agent: "claude", envName: n, envValue: "1" }, known, file)).toBe(true);
  expect("error" in savePrefs({ agent: "claude", envName: "A", envValue: "x\ny" }, known, file)).toBe(true);
  expect("error" in savePrefs({ agent: "nope", enabled: false }, known, file)).toBe(true);
  writeFileSync(file, JSON.stringify({ agents: { claude: { command: "x;y", args: ["$(z)", "--ok"], env: { PATH: "/x", OK: "1" } } } }));
  const p = readPrefs(file);
  expect(commandOf("claude", p)).toBe("claude");
  expect(argsOf("claude", p)).toEqual(["--ok"]);
  expect(Object.keys(p.agents.claude!.env!)).toEqual(["OK"]);
});

test("a metacharacter in an env value stays one argv entry", () => {
  savePrefs({ agent: "claude", envName: "A", envValue: "$(touch x); `y` 'z'" }, known, file);
  expect(withEnv(["claude"], "claude", readPrefs(file), false)[1]).toBe("A=$(touch x); `y` 'z'");
});

test("bypass comes only from the setting; one agent can differ", () => {
  savePrefs({ permissions: "bypass" }, known, file);
  expect(prefersBypass("codex", readPrefs(file))).toBe(true);
  savePrefs({ agent: "codex", agentPermissions: "own" }, known, file);
  expect(prefersBypass("codex", readPrefs(file))).toBe(false);
  expect(launchPreview(dir, "claude", readPrefs(file))).toContain("--dangerously-skip-permissions");
});

test("a disabled agent is not offered, not picked, and refused when named", () => {
  for (const a of known) savePrefs({ agent: a, enabled: false }, known, file);
  const all = ["agy", "opencode", "gemini"];
  for (const a of all) savePrefs({ agent: a, enabled: false }, [...known, ...all], file);
  expect(agentChoices(dir).agents).toEqual([]);
  expect(detectDefaultAgent(dir, "claude").note ?? "").toMatch(/turned off/);
  const r = launchRun({ severity: null, where: null, text: "x", raw: "x" }, dir, undefined, { agent: "claude", cwd: dir });
  expect(r.ok).toBe(false);
  expect(r.why).toMatch(/turned off/);
});

test("keep awake: the holder follows the wanted state and stops", () => {
  let kills = 0, starts = 0;
  const h = awakeHolder(() => (starts++, { kill: () => kills++ }), ["x"]);
  h.sync(wantAwake("auto", true)); h.sync(true);
  expect([starts, h.held()]).toEqual([1, true]);
  h.sync(wantAwake("auto", false));
  expect([kills, h.held()]).toEqual([1, false]);
  h.sync(wantAwake("on", false)); h.stop();
  expect([kills, h.held()]).toEqual([2, false]);
  h.sync(wantAwake("off", true));
  expect(h.held()).toBe(false);
  expect(inhibitArgv("linux", 7)).toContain("--pid=7");
  expect(inhibitArgv("darwin", 7)).toEqual(["caffeinate", "-i", "-w", "7"]);
  expect(inhibitArgv("win32")).toBeNull();
  expect(keepAwake("agent:\n  keep_awake: auto\n")).toBe("auto");
  expect(keepAwake("")).toBe("off");
});

test("launch: nothing set keeps the line; bypass and overrides reach it and the session record", () => {
  // A child with a fake claude: a real terminal in this process breaks the suite's other tests.
  mkdirSync(join(dir, ".kaizen"));
  mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "bin", "claude"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const script = `const { launchRun } = await import(${JSON.stringify(join(import.meta.dir, "state.ts"))});
    const r = launchRun({ severity: null, where: null, text: "x", raw: "x" }, ${JSON.stringify(dir)}, undefined, { agent: "claude", cwd: ${JSON.stringify(dir)}, card: true });
    console.log(JSON.stringify(r)); process.exit(0);`;
  const go = () => JSON.parse(Bun.spawnSync([process.execPath, "-e", script], { env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}` } }).stdout.toString());
  const plain = go();
  if (!plain.ok) return; // no pseudo-terminal here
  expect(plain.cmd).not.toContain("--dangerously-skip-permissions");
  expect(plain.cmd[0]).toEndWith("claude");
  savePrefs({ permissions: "bypass" }, known, file);
  savePrefs({ agent: "claude", args: "--verbose", envName: "A", envValue: "secret" }, known, file);
  const r = go();
  expect(r.cmd).toContain("--dangerously-skip-permissions");
  expect(r.cmd).toContain("--verbose");
  expect(JSON.stringify(r)).not.toContain("secret");
  const recs = readdirSync(join(dir, ".kaizen", "sessions")).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(dir, ".kaizen", "sessions", f), "utf8")));
  expect(recs.filter((x) => x.yolo).length).toBe(1);
}, 15000);

test("a blank value keeps a saved one; bypass flags are refused as arguments", () => {
  savePrefs({ agent: "claude", envName: "A", envValue: "1" }, known, file);
  savePrefs({ agent: "claude", envName: "A", envValue: "" }, known, file);
  expect(readPrefs(file).agents.claude!.env).toEqual({ A: "1" });
  for (const args of ["--dangerously-skip-permissions", "--yolo", "-y", "--auto"]) expect("error" in savePrefs({ agent: "claude", args }, known, file)).toBe(true);
  writeFileSync(file, JSON.stringify({ agents: { claude: { args: ["--yolo", "--ok"] } } }));
  expect(argsOf("claude", readPrefs(file))).toEqual(["--ok"]);
});
