import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brings, inspectPlugin, installedSha, installPlugin, installPluginArgv, pluginRecord, readMarket, readSource, searchPlugins, uninstallPlugin, uninstallPluginArgv } from "./plugin-store.ts";
import { inspectSkill } from "./skills-store.ts";

const tmpHome = () => realpathSync(mkdtempSync(join(tmpdir(), "kz-plug-")));
// Entry shapes from Anthropic's marketplace.json on 2026-11-20.
const MARKET = { plugins: [
  { name: "code-review", description: "Review code.", author: { name: "Anthropic" }, category: "development", source: "./plugins/code-review" },
  { name: "42crunch", description: "API security.", author: { name: "42Crunch" }, category: "security", source: { source: "git-subdir", url: "https://github.com/42Crunch-AI/claude-plugins.git", path: "plugins/api-security-testing", ref: "v1.5.5", sha: "faf5305385de8afed9468904e8639be737aff39e" } },
  { name: "adlc", description: "Agentforce.", author: null, category: "development", source: { source: "url", url: "https://github.com/SalesforceAIResearch/agentforce-adlc.git", sha: "09bf1539d41f9ff355ba3eb5d05d4a75813423bb" } },
  { name: "escape", description: "x", source: "../../etc" },
  { name: "evil-url", description: "x", source: { source: "url", url: "file:///etc" } },
  { name: "npm-thing", description: "x", source: { source: "npm", package: "x" } },
  { name: "-flag", description: "x", source: "./plugins/x" },
] };

test("marketplace entries: only GitHub repos and safe folders are kept, pinned to their sha", () => {
  const list = readMarket(MARKET);
  expect(list.map((p) => p.name)).toEqual(["code-review", "42crunch", "adlc"]);
  expect(list[0]!.source).toEqual({ url: "https://github.com/anthropics/claude-plugins-official.git", path: "plugins/code-review", rev: "" });
  expect(list[1]!.source!.rev).toBe("faf5305385de8afed9468904e8639be737aff39e");
  expect(list[1]!.author).toBe("42Crunch");
  expect(readSource("./plugins/../../x")).toBeNull();
  expect(readSource({ source: "git-subdir", url: "https://github.com/a/b.git", path: "../x" })).toBeNull();
  expect(readSource({ source: "url", url: "https://evil.example/a/b.git" })).toBeNull();
});

test("search filters the list by every word; installed ones are marked", async () => {
  const home = tmpHome();
  mkdirSync(join(home, ".kaizen"));
  writeFileSync(join(home, ".kaizen", "plugins-store.json"), JSON.stringify({ "code-review": { at: 1 } }));
  const f = (async () => new Response(JSON.stringify(MARKET))) as any;
  const { forgetMarket } = await import("./plugin-store.ts");
  forgetMarket();
  const r = await searchPlugins("security api", home, f);
  expect(r.hits.map((h: any) => h.name)).toEqual(["42crunch"]);
  expect((r.hits[0] as any).source).toBeUndefined(); // the page never gets the download source
  expect((await searchPlugins("", home, f)).hits.find((h: any) => h.name === "code-review")!.installed).toBe(true);
});

const fixture = (dir: string) => {
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "p", mcpServers: { extra: { url: "https://mcp.example/x" } } }));
  mkdirSync(join(dir, "hooks"));
  writeFileSync(join(dir, "hooks", "hooks.json"), JSON.stringify({ hooks: { PreToolUse: [], SessionStart: [] } }));
  writeFileSync(join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { db: { command: "npx", args: ["-y", "db-mcp"] } } }));
  mkdirSync(join(dir, "commands"));
  writeFileSync(join(dir, "commands", "go.md"), "x");
  mkdirSync(join(dir, "skills", "helper"), { recursive: true });
  writeFileSync(join(dir, "skills", "helper", "SKILL.md"), "---\nname: helper\n---\n");
};

test("brings lists hooks, MCP servers (with what they run), commands and skills from the files", () => {
  const dir = tmpHome();
  fixture(dir);
  const b = brings(dir);
  expect(b.hooks).toEqual(["PreToolUse", "SessionStart"]);
  expect(b.mcp).toEqual(["db (runs npx -y db-mcp)", "extra (https://mcp.example/x)"]);
  expect(b.commands).toEqual(["go"]);
  expect(b.skills).toEqual(["helper"]);
  expect(b.skillDirs).toEqual([join(dir, "skills", "helper")]);
  expect(b.read).toBe(true);
});

test("brings follows a manifest's path-valued hooks and mcpServers, and says so when a declared file can't be read (review finding 1)", () => {
  const dir = tmpHome();
  mkdirSync(join(dir, ".claude-plugin"));
  mkdirSync(join(dir, "config"));
  writeFileSync(join(dir, "config", "hooks.json"), JSON.stringify({ hooks: { PostToolUse: [{ hooks: [{ type: "command", command: "sh x.sh" }] }] } }));
  writeFileSync(join(dir, "config", "mcp.json"), JSON.stringify({ mcpServers: { tool: { command: "npx", args: ["-y", "some-mcp"] } } }));
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ hooks: "./config/hooks.json", mcpServers: ["${CLAUDE_PLUGIN_ROOT}/config/mcp.json"] }));
  const b = brings(dir);
  expect(b.hooks).toEqual(["PostToolUse"]);
  expect(b.mcp).toEqual(["tool (runs npx -y some-mcp)"]);
  expect(b.read).toBe(true);
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ hooks: "./config/missing.json" }));
  expect(brings(dir).read).toBe(false); // the dialog then says it may run hooks or MCP servers
});

test("commands, agents and skills the manifest puts in other folders are listed, and their skills scanned", () => {
  const dir = tmpHome();
  mkdirSync(join(dir, ".claude-plugin"));
  mkdirSync(join(dir, "extra", "cmds"), { recursive: true });
  writeFileSync(join(dir, "extra", "cmds", "deploy.md"), "x");
  writeFileSync(join(dir, "extra", "reviewer.md"), "x");
  mkdirSync(join(dir, "more-skills", "lint"), { recursive: true });
  writeFileSync(join(dir, "more-skills", "lint", "SKILL.md"), "x");
  mkdirSync(join(dir, "more-skills", "not-a-skill"), { recursive: true });
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ commands: "./extra/cmds", agents: ["./extra/reviewer.md"], skills: "${CLAUDE_PLUGIN_ROOT}/more-skills" }));
  const b = brings(dir);
  expect(b.commands).toEqual(["deploy"]);
  expect(b.agents).toEqual(["reviewer"]);
  expect(b.skills).toEqual(["lint"]);
  expect(b.skillDirs).toEqual([join(dir, "more-skills", "lint")]);
  expect(b.read).toBe(true);
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ commands: "../outside" }));
  expect(brings(dir).read).toBe(false);
});

test("a failed rollback after a commit mismatch keeps the plugin recorded and says it is still installed", async () => {
  const home = tmpHome(), list = readMarket(MARKET);
  mkdirSync(join(home, ".claude", "plugins"), { recursive: true });
  const sh = async (argv: string[]) => {
    if (argv.includes("install")) writeFileSync(join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ plugins: { "42crunch@claude-plugins-official": [{ gitCommitSha: "1".repeat(40) }] } }));
    return { ok: !argv.includes("uninstall"), out: "{}" };
  };
  const r = await installPlugin(home, "42crunch", list, sh);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.why).toContain("still installed");
  expect(Object.keys(pluginRecord(home))).toEqual(["42crunch"]);
});

test("a link inside the plugin pointing outside it is not read (review finding 2)", () => {
  const outside = tmpHome(), dir = tmpHome();
  writeFileSync(join(outside, "hooks.json"), JSON.stringify({ hooks: { SessionStart: [] } }));
  mkdirSync(join(dir, "hooks"));
  try { symlinkSync(join(outside, "hooks.json"), join(dir, "hooks", "hooks.json")); } catch { return; } // Windows without the right to make links
  const b = brings(dir);
  expect(b.hooks).toEqual([]);
  expect(b.read).toBe(false);
});

test("an install whose commit differs from the one inspected is taken out again (review finding 3)", async () => {
  const home = tmpHome(), list = readMarket(MARKET), ran: string[][] = [];
  mkdirSync(join(home, ".claude", "plugins"), { recursive: true });
  const reg = (sha: string) => writeFileSync(join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "42crunch@claude-plugins-official": [{ installPath: "/x", gitCommitSha: sha }] } }));
  const sh = async (argv: string[]) => { ran.push(argv); if (argv.includes("install")) reg("0".repeat(40)); return { ok: true, out: "{}" }; };
  const r = await installPlugin(home, "42crunch", list, sh);
  expect(r.ok).toBe(false);
  expect(ran.map((a) => a[2])).toEqual(["install", "uninstall"]);
  expect(Object.keys(pluginRecord(home))).toEqual([]);
  const same = async (argv: string[]) => { if (argv.includes("install")) reg("faf5305385de8afed9468904e8639be737aff39e"); return { ok: true, out: "{}" }; };
  expect((await installPlugin(home, "42crunch", list, same)).ok).toBe(true);
  expect(installedSha(home, "42crunch")).toBe("faf5305385de8afed9468904e8639be737aff39e");
});

test("inspect downloads at the pinned revision into a temp folder, scans its skills, and removes the folder", async () => {
  const list = readMarket(MARKET);
  let cwd = "", argvs: string[][] = [], scanned: string[] = [];
  const spawn = async (argv: string[], o: { cwd: string }) => {
    cwd = o.cwd; argvs.push(argv);
    if (argv.includes("checkout")) fixture(join(o.cwd, "plugins", "api-security-testing"));
    return { ok: true, out: "" };
  };
  const r = await inspectPlugin("42crunch", { list, spawn, scan: async (d) => { scanned = d; return { ran: true, worst: "SAFE", careful: false, findings: [], count: 0 }; } });
  expect("error" in r).toBe(false);
  if ("error" in r) return;
  expect(argvs.map((a) => a.slice(0, 2).join(" "))).toEqual(["git init", "git remote", "git fetch", "git -c"]);
  expect(argvs[2]).toContain("faf5305385de8afed9468904e8639be737aff39e");
  expect(r.brings.hooks).toContain("PreToolUse");
  expect(scanned.length).toBe(1);
  expect(existsSync(cwd)).toBe(false); // temp folder gone
  // A failed download says so and is careful; still cleaned up.
  const r2 = await inspectPlugin("adlc", { list, spawn: async (_a, o) => { cwd = o.cwd; return { ok: false, out: "fatal" }; } });
  expect("error" in r2 ? null : r2.scan.careful).toBe(true);
  expect(existsSync(cwd)).toBe(false);
  expect("error" in (await inspectPlugin("not-there", { list }))).toBe(true);
});

test("plugin install never accepts a declared command for the user; uninstall only a plugin installed for the user", async () => {
  expect(installPluginArgv("github", true).slice(1)).toEqual(["plugin", "install", "github@claude-plugins-official", "--scope", "user", "--json"]);
  expect(installPluginArgv("github", false)).toContain("--marketplace");
  for (const a of [installPluginArgv("x", true), uninstallPluginArgv("x")]) { expect(a).not.toContain("-y"); expect(a).not.toContain("--accept-command"); }
  const home = tmpHome(), list = readMarket(MARKET), ran: string[][] = [];
  const sh = async (argv: string[]) => { ran.push(argv); return { ok: true, out: "{}" }; };
  expect((await installPlugin(home, "not-listed", list, sh)).ok).toBe(false);
  expect((await uninstallPlugin(home, "code-review", "claude-plugins-official", sh)).ok).toBe(false); // not installed
  for (const n of ["constructor", "__proto__"]) expect((await uninstallPlugin(home, n, "claude-plugins-official", sh)).ok).toBe(false);
  expect(ran).toEqual([]);
  expect((await installPlugin(home, "code-review", list, sh)).ok).toBe(true);
  expect(Object.keys(pluginRecord(home))).toEqual(["code-review"]);
  // What Claude Code lists: kaizen's install, one from another marketplace, and one installed for a project only.
  mkdirSync(join(home, ".claude", "plugins"), { recursive: true });
  writeFileSync(join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ plugins: {
    "code-review@claude-plugins-official": [{ scope: "user", installPath: "/x" }],
    "caveman@caveman": [{ scope: "user", installPath: "/y" }],
    "lsp@claude-plugins-official": [{ scope: "project", projectPath: "/p", installPath: "/z" }],
  } }));
  ran.length = 0;
  expect((await uninstallPlugin(home, "lsp", "claude-plugins-official", sh)).ok).toBe(false); // project scope
  expect((await uninstallPlugin(home, "caveman", "caveman;rm", sh)).ok).toBe(false);
  expect((await uninstallPlugin(home, "-y", "claude-plugins-official", sh)).ok).toBe(false);
  expect(ran).toEqual([]);
  expect((await uninstallPlugin(home, "code-review", "claude-plugins-official", sh)).ok).toBe(true);
  expect(Object.keys(pluginRecord(home))).toEqual([]);
  expect((await uninstallPlugin(home, "caveman", "caveman", sh)).ok).toBe(true); // not kaizen's, still the user's to remove
  expect(ran.map((a) => a.slice(1, 4))).toEqual([["plugin", "uninstall", "code-review@claude-plugins-official"], ["plugin", "uninstall", "caveman@caveman"]]);
  expect((await installPlugin(home, "code-review", list, async () => ({ ok: false, out: "needs a command" }))).ok).toBe(false);
  expect(Object.keys(pluginRecord(home))).toEqual([]);
});

test("inspecting a skills.sh skill works in a temp folder with HOME pointed there, and removes it after", async () => {
  let seen: { cwd: string; home?: string } = { cwd: "" };
  const spawn = async (_argv: string[], o: { cwd: string; env: Record<string, string | undefined> }) => {
    seen = { cwd: o.cwd, home: o.env.HOME };
    mkdirSync(join(o.cwd, ".claude", "skills", "pdf"), { recursive: true });
    writeFileSync(join(o.cwd, ".claude", "skills", "pdf", "SKILL.md"), "x");
    return { ok: true, out: "" };
  };
  const r = await inspectSkill("anthropics/skills", "pdf", { spawn, scan: async () => ({ ran: true, worst: "SAFE", careful: false, findings: [], count: 0 }) });
  expect(r).toMatchObject({ ran: true, careful: false });
  expect(seen.home).toBe(seen.cwd);
  expect(existsSync(seen.cwd)).toBe(false);
  expect(await inspectSkill("../x", "pdf", { spawn })).toMatchObject({ careful: true });
  expect(await inspectSkill("a/b", "pdf", { spawn: async (_a, o) => { seen.cwd = o.cwd; return { ok: false, out: "" }; } })).toMatchObject({ ran: false, careful: true });
  expect(existsSync(seen.cwd)).toBe(false);
});
