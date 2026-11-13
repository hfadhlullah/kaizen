// REA's switch (cli/rea.ts, POST /rea): nothing runs until it is turned on, setup applies
// only the plan the page showed, pinned, for the installed agents; off runs REA's uninstall.
// REA itself is never run: a fake runner, or a fake npx/npm on PATH for the board.
import { test, expect } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctorMissing, forgetDoctor, forgetLatest, forgetNodeOld, installNode, nodeFix, nodeState, okVersion, planFiles, reaApply, reaClients, reaPlan, reaRegistered, reaRemove, reaRow, reaSaved, type Run } from "./rea.ts";

const npx = process.platform === "win32" ? "npx.cmd" : "npx", npm = process.platform === "win32" ? "npm.cmd" : "npm";
const homeWith = (...dirs: string[]) => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "kz-rea-")));
  for (const d of dirs) mkdirSync(join(home, d), { recursive: true });
  return home;
};
// Records every argv and answers like REA: setup --dry-run plans, setup --yes applies, doctor reports.
const fake = (answers: Partial<Record<"plan" | "apply" | "uninstall" | "doctor" | "view", { ok?: boolean; out: string }>> = {}) => {
  const log: string[][] = [];
  const sh: Run = async (argv) => {
    log.push(argv);
    const a = argv.join(" ");
    const pick = a.includes(" view ") ? answers.view ?? { out: "6.8.0\n" }
      : a.includes("--dry-run") ? answers.plan ?? { out: JSON.stringify({ status: "planned", changes: [{ client: "claude_code", path: "/h/.claude.json" }, { client: "codex", config_path: "/h/.codex/config.toml" }] }) }
      : a.includes(" setup ") ? answers.apply ?? { out: JSON.stringify({ status: "applied" }) }
      : a.includes(" uninstall") ? answers.uninstall ?? { out: JSON.stringify({ status: "removed" }) }
      : answers.doctor ?? { out: JSON.stringify({ healthy: false, scope_checks: [{ name: "ghidra", status: "fail" }, { name: "java", status: "pass" }] }) };
    return { ok: pick.ok ?? true, out: pick.out };
  };
  return { sh, log };
};

test("G-01 off and never set up: the row runs nothing", () => {
  const home = homeWith(".claude", ".codex"), f = fake();
  forgetDoctor(); forgetLatest();
  const row = reaRow(home, f.sh);
  expect(row.off).toBe(true);
  expect(row.agents.map((a) => a.state)).toEqual(["missing", "missing"]);
  expect(f.log).toEqual([]);
});

test("G-03 the dry run and the setup name the installed agents and one exact version, never latest", async () => {
  const home = homeWith(".claude", ".codex"), f = fake();
  expect(reaClients(home).map((c) => c.client)).toEqual(["claude_code", "codex"]);
  const p = await reaPlan(home, "6.8.0", ["claude_code", "codex"], f.sh);
  expect(p.ok && p.files).toEqual(["/h/.claude.json", "/h/.codex/config.toml"]);
  expect(f.log[0]).toEqual([npx, "-y", "rea-agents@6.8.0", "setup", "--client", "claude_code", "--client", "codex", "--dry-run", "--json"]);
  expect(existsSync(join(home, ".kaizen", "rea.json"))).toBe(false); // a plan saves nothing
  const r = await reaApply(home, "6.8.0", ["claude_code", "codex"], f.sh);
  expect(r.ok).toBe(true);
  expect(f.log[1]).toEqual([npx, "-y", "rea-agents@6.8.0", "setup", "--client", "claude_code", "--client", "codex", "--yes", "--json"]);
  expect(reaSaved(home)).toEqual({ on: true, version: "6.8.0", clients: ["claude_code", "codex"] });
});

test("G-07 a bad version or an agent that is not installed never reaches argv", async () => {
  const home = homeWith(".claude"), f = fake();
  for (const v of ["latest", "6.8", "6.8.0; rm -rf ~", "--yes"]) {
    expect(okVersion(v)).toBe(false);
    expect((await reaPlan(home, v, ["claude_code"], f.sh)).ok).toBe(false);
    expect((await reaApply(home, v, ["claude_code"], f.sh)).ok).toBe(false);
  }
  expect((await reaApply(home, "6.8.0", ["codex"], f.sh)).ok).toBe(false); // no ~/.codex here
  expect((await reaApply(home, "6.8.0", ["--all-detected"], f.sh)).ok).toBe(false);
  expect(f.log).toEqual([]);
});

test("a setup REA did not finish saves nothing and says why", async () => {
  const home = homeWith(".claude");
  for (const out of [JSON.stringify({ status: "needs_confirmation", message: "approve the Claude change" }), JSON.stringify({ status: "x", reason: "conflict" }), "not json"]) {
    const r = await reaApply(home, "6.8.0", ["claude_code"], fake({ apply: { out } }).sh);
    expect(r.ok).toBe(false);
    expect(reaSaved(home)).toBeNull();
  }
  const r = await reaApply(home, "6.8.0", ["claude_code"], fake({ apply: { out: JSON.stringify({ status: "needs_human", message: "approve the Claude change" }) } }).sh);
  expect(!r.ok && r.why).toBe("approve the Claude change");
});

test("G-04 off runs REA's uninstall, also for a REA set up outside kaizen, and clears the switch", async () => {
  // Set up by kaizen.
  const home = homeWith(".claude"), f = fake();
  await reaApply(home, "6.8.0", ["claude_code"], f.sh);
  const r = await reaRemove(home, f.sh);
  expect(r.ok).toBe(true);
  expect(f.log.at(-1)).toEqual([npx, "-y", "rea-agents@6.8.0", "uninstall", "--json"]);
  expect(reaSaved(home)).toBeNull();
  // Set up by hand: Claude's config has REA 6.5.0, kaizen never saved anything.
  const mine = homeWith(".claude"), g = fake();
  writeFileSync(join(mine, ".claude.json"), JSON.stringify({ mcpServers: { rea: { command: "npx", args: ["-y", "rea-agents@6.5.0", "mcp"] } } }));
  expect(reaRegistered(mine)).toEqual([{ client: "claude_code", version: "6.5.0" }]);
  forgetDoctor(); forgetLatest();
  const row = reaRow(mine, g.sh);
  expect(row.off).toBe(false);
  expect(row.rea.outside).toBe(true);
  const r2 = await reaRemove(mine, g.sh);
  expect(g.log.some((a) => a.join(" ") === `${npx} -y rea-agents@6.5.0 uninstall --json`)).toBe(true);
  // The fake uninstall left the hand-made entry: the answer names it and how to remove it.
  expect(r2.ok && r2.left).toEqual(["claude_code"]);
  expect(r2.ok && r2.hint).toBe("claude mcp remove --scope user rea");
});

test("G-05 the row offers an update when a newer REA is out; doctor's missing items show as needs", async () => {
  const home = homeWith(".claude"), f = fake();
  await reaApply(home, "6.5.0", ["claude_code"], f.sh);
  forgetDoctor(); forgetLatest();
  reaRow(home, f.sh); // starts the npm and doctor look-ups, never awaited by the page
  await Bun.sleep(10);
  const row = reaRow(home, f.sh);
  expect(row.rea).toMatchObject({ installed: "6.5.0", latest: "6.8.0", update: true });
  expect(row.note).toContain("6.8.0 available");
  expect(row.needs).toEqual([{ name: "ghidra", found: false }]);
  expect(f.log.filter((a) => a[1] === "view")).toEqual([[npm, "view", "rea-agents", "version"]]);
  // Cached: another look runs nothing new.
  const n = f.log.length;
  reaRow(home, f.sh);
  expect(f.log.length).toBe(n);
});

test("plan files and doctor checks are read from REA's JSON however it nests them", () => {
  expect(planFiles({ status: "planned", plan: { clients: [{ files: ["/a/b.json"], target: "/c/d.toml" }], note: "no/slash/key" } })).toEqual(["/a/b.json", "/c/d.toml"]);
  expect(doctorMissing({ scope_checks: [{ id: "java", ok: false }], providerInspections: { ghidra: { name: "ghidra", status: "missing" } }, informational_checks: [{ name: "node", status: "pass" }] })).toEqual(["java", "ghidra"]);
  expect(doctorMissing(null)).toEqual([]);
});

test("G-02 G-07 the board applies only the plan it showed, with its token, and refuses a foreign origin", async () => {
  if (process.platform === "win32") return; // the fake npx is a shell script
  const home = homeWith(".claude", ".kaizen"), bin = join(home, "bin"), log = join(home, "npx.log");
  mkdirSync(bin);
  writeFileSync(join(bin, "npx"), `#!/bin/sh\necho "$@" >> ${log}\ncase "$*" in *--dry-run*) echo '{"status":"planned","changes":[{"path":"/x/.claude.json"}]}';; *setup*) echo '{"status":"applied"}';; *uninstall*) echo '{"status":"removed"}';; *) echo '{"healthy":true}';; esac\n`);
  writeFileSync(join(bin, "npm"), "#!/bin/sh\necho 6.8.0\n");
  chmodSync(join(bin, "npx"), 0o755); chmodSync(join(bin, "npm"), 0o755);
  const port = 20000 + Math.floor(Math.random() * 20000);
  const p = Bun.spawn([process.execPath, join(import.meta.dir, "install.ts"), "web", "--foreground", "--no-open", "--port", String(port)],
    { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOME: home, USERPROFILE: home, KAIZEN_HOME: join(home, "kz") }, stdout: "ignore", stderr: "ignore" });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/")).ok) break; } catch { /* not up yet */ } await Bun.sleep(100); }
    const post = (body: object, origin = base) => fetch(base + "/rea", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
    const ran = () => (existsSync(log) ? readFileSync(log, "utf8") : "");
    // G-01 at the board: the Skills page with REA off runs nothing.
    const rows = (await (await fetch(base + "/skills")).json()) as { skills: { id: string; off: boolean }[] };
    expect(rows.skills.find((s) => s.id === "rea")?.off).toBe(true);
    expect(ran()).toBe("");
    expect((await post({ step: "plan" }, "https://evil.example")).status).toBe(403);
    expect((await post({ step: "apply", confirm: true, token: "made-up" })).status).toBe(400);
    expect(ran()).not.toContain("--yes");
    const plan = (await (await post({ step: "plan" })).json()) as { token: string; version: string; files: string[] };
    expect(plan).toMatchObject({ version: "6.8.0", files: ["/x/.claude.json"] });
    expect((await post({ step: "apply", token: plan.token })).status).toBe(400); // no confirm: refused, and the plan is spent
    expect((await post({ step: "apply", confirm: true, token: plan.token })).status).toBe(400);
    expect(ran()).not.toContain("--yes");
    const plan2 = (await (await post({ step: "plan" })).json()) as { token: string };
    expect((await post({ step: "apply", confirm: true, token: plan2.token })).status).toBe(200);
    expect(ran()).toContain("-y rea-agents@6.8.0 setup --client claude_code --yes --json");
    expect(JSON.parse(readFileSync(join(home, ".kaizen", "rea.json"), "utf8"))).toMatchObject({ on: true, version: "6.8.0" });
    expect((await post({ step: "off" })).status).toBe(200);
    expect(ran()).toContain("-y rea-agents@6.8.0 uninstall --json");
    expect(existsSync(join(home, ".kaizen", "rea.json"))).toBe(false);
    // Node.js: refused from another origin, without confirm, or without the Skills page's one-time token.
    expect((await post({ step: "node", confirm: true }, "https://evil.example")).status).toBe(403);
    const tok = ((await (await fetch(base + "/skills")).json()) as { token: string }).token;
    expect((await post({ step: "node", token: tok })).status).toBe(400);
    expect(await (await post({ step: "node", confirm: true, token: tok })).json()).toMatchObject({ error: "confirm required" }); // spent above
    const tok2 = ((await (await fetch(base + "/skills")).json()) as { token: string }).token;
    // Only on Linux, which has no installer to run: the answer is the download page. On macOS and
    // Windows a valid request would run the real Homebrew or winget, which a test must never do.
    if (process.platform === "linux") expect(((await (await post({ step: "node", confirm: true, token: tok2 })).json()) as { error: string }).error).toContain("nodejs.org");
  } finally { p.kill(); }
}, 30000);

test("a REA set up through a global install (no pinned version) is still seen as on", () => {
  const home = homeWith(".claude", ".codex");
  writeFileSync(join(home, ".claude.json"), JSON.stringify({ mcpServers: { rea: { command: "rea", args: ["mcp"] } } }));
  writeFileSync(join(home, ".codex", "config.toml"), '[mcp_servers.rea]\ncommand = "rea"\nargs = ["mcp"]\n');
  expect(reaRegistered(home)).toEqual([{ client: "claude_code", version: null }, { client: "codex", version: null }]);
  const mine = homeWith(".claude");
  writeFileSync(join(mine, ".claude.json"), JSON.stringify({ mcpServers: { other: { command: "x" } }, note: "area" }));
  expect(reaRegistered(mine)).toEqual([]);
});

test("a Node.js too old for REA is named with what is needed, in a failed step and on the row", async () => {
  const line = { ok: false, out: "REA requires Node.js 22.x (>=22.23.4), 24.x (>=24.22.1), 26.12.1+; this process runs Node.js 22.14.0. Install a supported release, then retry.\n" };
  const home = homeWith(".claude"), f = fake({ plan: line, doctor: line });
  const p = await reaPlan(home, "6.8.0", ["claude_code"], f.sh);
  expect(!p.ok && p.why).toBe("REA needs Node.js 22.x (>=22.23.4), 24.x (>=24.22.1), 26.12.1+; this PC has Node.js 22.14.0. Use Update Node.js on the REA row in Settings → Skills, or install the current Node.js LTS from nodejs.org, then try again.");
  await reaApply(home, "6.8.0", ["claude_code"], fake().sh);
  forgetDoctor(); forgetLatest();
  reaRow(home, f.sh);
  await Bun.sleep(10);
  expect(reaRow(home, f.sh).needs).toEqual([{ name: "Node.js 22.x (>=22.23.4), 24.x (>=24.22.1), 26.12.1+ (this PC has 22.14.0)", found: false }]);
});

test("REA 6.8's failed node check in doctor's JSON reads the same way", () => {
  expect(doctorMissing({ scope_checks: [{ name: "node", ok: false, detail: "26.9.0", remediation: "Install Node.js 22.x (>=22.23.4), 24.x (>=24.22.1), or 26.12.1+." }] }))
    .toEqual(["Node.js 22.x (>=22.23.4), 24.x (>=24.22.1), 26.12.1+ (this PC has 26.9.0)"]);
});

test("Node.js for REA: winget on Windows, Homebrew on macOS, else the download page; one command installs or upgrades", () => {
  const win = nodeFix("win32", (b) => (b === "winget" ? "C:\\WindowsApps\\winget.exe" : null), () => false, { ProgramFiles: "C:\\Program Files" });
  expect(win).toEqual({ how: "winget", argv: ["C:\\WindowsApps\\winget.exe", "install", "--id", "OpenJS.NodeJS.LTS", "--exact", "--source", "winget", "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity"],
    command: "winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity", bin: "C:\\Program Files\\nodejs" });
  expect(nodeFix("win32", () => null, () => false, {})).toEqual({ how: "link", url: "https://nodejs.org/en/download" });
  // A macOS app started from the Dock has no Homebrew on PATH: the usual places are looked at.
  expect(nodeFix("darwin", () => null, (p) => p === "/opt/homebrew/bin/brew")).toMatchObject({ how: "brew", argv: ["/opt/homebrew/bin/brew", "install", "node"], bin: "/opt/homebrew/bin" });
  expect(nodeFix("darwin", () => null, () => false).how).toBe("link");
  expect(nodeFix("linux", () => "/usr/bin/whatever").how).toBe("link");
});

test("installing Node.js runs only the built command, then puts its folder first on PATH; a failure changes nothing", async () => {
  const fix = { how: "winget" as const, argv: ["winget", "install", "--id", "OpenJS.NodeJS.LTS"], command: "winget install --id OpenJS.NodeJS.LTS", bin: "/opt/nodejs" };
  const env: Record<string, string> = { Path: ["/usr/bin", "/opt/nodejs", "/bin"].join(require("node:path").delimiter) };
  const bad = fake(); const failing: Run = async (argv, ms) => { bad.log.push([...argv, String(ms)]); return { ok: false, out: "Installer failed with exit code: 1603\n" }; };
  const r1 = await installNode(failing, fix, env);
  expect(r1).toEqual({ ok: false, why: "Installer failed with exit code: 1603" });
  expect(env.Path).toBe(["/usr/bin", "/opt/nodejs", "/bin"].join(require("node:path").delimiter));
  const ok: string[][] = [];
  const r2 = await installNode(async (argv, ms) => { ok.push([...argv, String(ms)]); return { ok: true, out: "" }; }, fix, env);
  expect(r2.ok).toBe(true);
  expect(ok).toEqual([["winget", "install", "--id", "OpenJS.NodeJS.LTS", String(10 * 60_000)]]);
  expect(env.Path).toBe(["/opt/nodejs", "/usr/bin", "/bin"].join(require("node:path").delimiter)); // the existing PATH key, no duplicate
  const both: Record<string, string> = { PATH: "/a", Path: "/a" };
  await installNode(async () => ({ ok: true, out: "" }), fix, both);
  expect(both).toEqual({ PATH: `/opt/nodejs${require("node:path").delimiter}/a`, Path: `/opt/nodejs${require("node:path").delimiter}/a` });
  expect((await installNode(fake().sh, { how: "link", url: "https://nodejs.org/en/download" }, env)).ok).toBe(false);
});

test("the row asks for Node.js when it is missing, and for an update after REA called it too old", async () => {
  forgetNodeOld();
  expect(nodeState(() => null)).toMatchObject({ state: "missing" });
  expect(nodeState(() => "/usr/bin/node")).toBeNull();
  const home = homeWith(".claude");
  await reaPlan(home, "6.8.0", ["claude_code"], fake({ plan: { ok: false, out: "REA requires Node.js 22.x (>=22.23.4), 24.x (>=24.22.1), 26.12.1+; this process runs Node.js 22.14.0. Install a supported release, then retry." } }).sh);
  expect(nodeState(() => "/usr/bin/node")).toMatchObject({ state: "old", have: "22.14.0" });
  forgetNodeOld();
});

test("review fixes: a passing doctor or REA off clears the old-Node mark; winget's 'already newest' and spinner lines read clearly", async () => {
  const home = homeWith(".claude");
  const old = { ok: false, out: "REA requires Node.js 22.x (>=22.23.4), 24.x (>=24.22.1), 26.12.1+; this process runs Node.js 22.14.0. Install a supported release, then retry." };
  await reaPlan(home, "6.8.0", ["claude_code"], fake({ plan: old }).sh);
  expect(nodeState(() => "/usr/bin/node")?.state).toBe("old");
  await reaApply(home, "6.8.0", ["claude_code"], fake().sh);
  forgetDoctor(); forgetLatest();
  const healthy = fake({ doctor: { out: JSON.stringify({ healthy: true, scope_checks: [{ name: "node", ok: true, detail: "24.22.1" }] }) } });
  reaRow(home, healthy.sh); await Bun.sleep(10);
  expect(nodeState(() => "/usr/bin/node")).toBeNull(); // Node.js was updated outside kaizen
  await reaPlan(home, "6.8.0", ["claude_code"], fake({ plan: old }).sh);
  await reaRemove(home, fake().sh);
  expect(nodeState(() => "/usr/bin/node")).toBeNull(); // REA off: nothing to update for
  const fix = { how: "winget" as const, argv: ["winget"], command: "winget install", bin: "/opt/nodejs" };
  const env: Record<string, string> = { PATH: "/a" };
  const same = await installNode(async () => ({ ok: false, out: "Found an existing package already installed. Trying to upgrade the installed package...\nNo available upgrade found.\nNo newer package versions are available from the configured sources.\n" }), fix, env);
  expect(!same.ok && same.why).toContain("older Node.js comes first on PATH");
  expect(env.PATH).toBe("/a");
  const spin = await installNode(async () => ({ ok: false, out: "Downloading\r  -\r  \\\r  |\r  /\r\nInstaller failed with exit code: 1603\r  -\r" }), fix, env);
  expect(!spin.ok && spin.why).toBe("Installer failed with exit code: 1603");
});

test("recheck: REA's JSON still parses when a failed step also wrote to stderr; installNode reads the stderr reason", async () => {
  const home = homeWith(".claude");
  const p = await reaPlan(home, "6.8.0", ["claude_code"], async () => ({ ok: false, out: '{"status":"needs_human","message":"Quit Codex first"}', err: "npm warn deprecated x\n" }));
  expect(!p.ok && p.why).toBe("Quit Codex first");
  const r = await installNode(async () => ({ ok: false, out: "==> Downloading node\n", err: "Error: Permission denied @ dir_s_mkdir\n" }), { how: "brew", argv: ["brew"], command: "brew install node", bin: "/b" }, { PATH: "/a" });
  expect(!r.ok && r.why).toBe("Error: Permission denied @ dir_s_mkdir");
});
