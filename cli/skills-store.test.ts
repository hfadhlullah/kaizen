import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { audits, cliAgents, forgetStore, install, installArgv, isClean, parseInstall, readAudit, remove, removeArgv, search, storeRecord } from "./skills-store.ts";

const tmpHome = () => realpathSync(mkdtempSync(join(tmpdir(), "kz-store-")));
const fakeFetch = (routes: Record<string, unknown>) => (async (url: string) => {
  const hit = Object.entries(routes).find(([k]) => url.includes(k));
  return hit ? new Response(JSON.stringify(hit[1]), { headers: { "content-type": "application/json" } }) : new Response("no", { status: 500 });
}) as any;

// Answers recorded from skills.sh on 2026-11-20.
const PDF = { ath: { risk: "safe" }, socket: { risk: "safe", alerts: 0, score: 90 }, snyk: { risk: "low" } };
const DOCX = { ath: { risk: "safe" }, socket: { risk: "safe", score: 90 }, snyk: { risk: "critical" } };
const HALLMARK = { ath: { risk: "medium" }, socket: { risk: "medium", score: 79 }, snyk: { risk: "low" } };

test("an audit is clean only when all three say safe or low", () => {
  expect(isClean(readAudit(PDF))).toBe(true);
  expect(isClean(readAudit(DOCX))).toBe(false);
  expect(isClean(readAudit(HALLMARK))).toBe(false);
  expect(isClean(readAudit(null))).toBe(false);
  expect(isClean(readAudit({ ath: { risk: "safe" }, socket: { risk: "safe" } }))).toBe(false); // Snyk missing
  expect(isClean(readAudit({ ath: { risk: "safe" }, socket: { risk: "nonsense" }, snyk: { risk: "low" } }))).toBe(false);
  expect(readAudit(PDF).socketScore).toBe(90);
});

test("audits: a failed fetch is unknown, not clean, and is not cached", async () => {
  forgetStore();
  const down = (async () => { throw new Error("offline"); }) as any;
  const a = await audits("anthropics/skills", ["pdf"], down);
  expect(a.pdf!.gen).toBe("unknown");
  expect(isClean(a.pdf!)).toBe(false);
  const b = await audits("anthropics/skills", ["pdf"], fakeFetch({ "/tele/audit": { pdf: PDF } }));
  expect(isClean(b.pdf!)).toBe(true);
});

test("search joins results with their audits and drops names outside the patterns", async () => {
  forgetStore();
  const home = tmpHome();
  const f = fakeFetch({
    "/api/search": { skills: [
      { source: "anthropics/skills", skillId: "pdf", installs: 233102 },
      { source: "anthropics/skills", skillId: "docx", installs: 222026 },
      { source: "evil/x; rm -rf ~", skillId: "a", installs: 1 },
      { source: "ok/repo", skillId: "bad name", installs: 1 },
    ] },
    "/tele/audit": { pdf: PDF, docx: DOCX },
  });
  const r = await search("pdf", home, f);
  expect(r.hits.map((h) => `${h.name}:${h.clean}`)).toEqual(["pdf:true", "docx:false"]);
  expect(r.hits[0]!.installs).toBe(233102);
  expect((await search("   ", home, f)).hits).toEqual([]);
  forgetStore();
  expect((await search("pdf", home, fakeFetch({}))).error).toBeTruthy();
});

test("install and remove run argv arrays, name only this computer's agents (never '*'), and refuse names outside the patterns", async () => {
  expect(installArgv("anthropics/skills", "pdf", ["claude-code", "codex"]).slice(1)).toEqual(["-y", "skills@1.9.0", "add", "anthropics/skills", "--skill", "pdf", "-g", "-y", "--json", "-a", "claude-code", "codex"]);
  const h = tmpHome();
  for (const d of [".claude", ".gemini", ".config"]) mkdirSync(join(h, d));
  expect(cliAgents(h)).toEqual(["claude-code", "gemini-cli"]);
  expect(cliAgents(h)).not.toContain("*");
  expect(removeArgv("pdf").slice(1)).toEqual(["-y", "skills@1.9.0", "remove", "pdf", "-g", "-y"]);
  const home = tmpHome();
  let ran: string[][] = [];
  const sh = async (argv: string[]) => { ran.push(argv); return { ok: true, out: "" }; };
  expect((await install(home, "a/b; rm -rf ~", "pdf", sh)).ok).toBe(false);
  expect((await install(home, "a/b", "$(touch x)", sh)).ok).toBe(false);
  expect((await install(home, "../etc", "pdf", sh)).ok).toBe(false);
  expect((await install(home, "./local/x", "pdf", sh)).ok).toBe(false);
  expect((await install(home, "a/b", "-a", sh)).ok).toBe(false);
  expect((await install(home, "a/b", "--all", sh)).ok).toBe(false);
  expect(ran).toEqual([]);
});

test("install records what kaizen installed; remove only removes recorded skills", async () => {
  const home = tmpHome();
  mkdirSync(join(home, ".claude"));
  const dir = join(home, ".agents", "skills", "pdf");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), "---\nname: pdf\n---\n");
  const out = `Installing...\n[\n {"name":"pdf","status":"installed","source":"anthropics/skills","hash":"abc","path":${JSON.stringify(dir)},"agents":["Claude Code"]}\n]\n`;
  const ran: string[][] = [];
  const sh = async (argv: string[]) => {
    ran.push(argv);
    if (argv.includes("remove")) { (await import("node:fs")).rmSync(dir, { recursive: true }); return { ok: true, out: "Done" }; }
    return { ok: true, out };
  };
  // A skill kaizen did not install is the user's: refused, nothing runs.
  expect((await remove(home, "pdf", sh)).ok).toBe(false);
  expect(ran).toEqual([]);
  const r = await install(home, "anthropics/skills", "pdf", sh);
  expect(r.ok).toBe(true);
  expect(ran[0]!.slice(-2)).toEqual(["-a", "claude-code"]);
  expect(storeRecord(home).pdf!.source).toBe("anthropics/skills");
  expect(storeRecord(home).pdf!.hash).toBe("abc");
  expect((await remove(home, "pdf", sh)).ok).toBe(true);
  expect(existsSync(dir)).toBe(false);
  expect(storeRecord(home).pdf).toBeUndefined();
  // Names an ordinary object would answer for are never "recorded" (review finding 1).
  for (const n of ["constructor", "toString", "hasOwnProperty", "__proto__"]) expect((await remove(home, n, sh)).ok).toBe(false);
  // A skill of the same name the user put there after kaizen's install is theirs (review finding 2).
  ran.length = 0;
  await install(home, "anthropics/skills", "pdf", async (argv: string[]) => {
    ran.push(argv);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "---\nname: pdf\n---\n");
    return { ok: true, out };
  });
  writeFileSync(join(dir, "SKILL.md"), "---\nname: pdf\ndescription: the user's own\n---\n");
  ran.length = 0;
  const r2 = await remove(home, "pdf", sh);
  expect(r2.ok).toBe(false);
  expect(ran).toEqual([]);
  expect(existsSync(dir)).toBe(true);
  // A failed install leaves no record (of a new name).
  writeFileSync(join(home, ".kaizen", "skills-store.json"), "{}");
  const fail = async () => ({ ok: false, out: "npm error 404" });
  expect((await install(home, "anthropics/skills", "pdf", fail)).ok).toBe(false);
  expect(storeRecord(home).pdf).toBeUndefined();
});

test("an install whose answer names no path still records the CLI's own folder, so it can be removed", async () => {
  const home = tmpHome();
  mkdirSync(join(home, ".claude"));
  const dir = join(home, ".agents", "skills", "pdf");
  const sh = async (argv: string[]) => {
    if (argv.includes("remove")) { (await import("node:fs")).rmSync(dir, { recursive: true }); return { ok: true, out: "" }; }
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "---\nname: pdf\n---\n");
    return { ok: true, out: '[{"name":"pdf","status":"installed"}]' };
  };
  expect((await install(home, "anthropics/skills", "pdf", sh)).ok).toBe(true);
  expect(storeRecord(home).pdf!.path).toBe(dir);
  expect((await remove(home, "pdf", sh)).ok).toBe(true);
});

test("parseInstall takes the JSON array after npx's progress lines", () => {
  expect(parseInstall("npm warn x\n[{\"name\":\"a\"}]")?.[0].name).toBe("a");
  expect(parseInstall("no json here")).toBeNull();
});

// The routes: install and remove need the page's one-time token; a skill whose audits are not clean also needs
// risky:true; remove refuses a skill kaizen did not install. A local stand-in answers for skills.sh.
test("board refuses store installs without an inspect token, and removes only what kaizen recorded", async () => {
  const fake = Bun.serve({ port: 0, fetch: (req) => {
    const u = new URL(req.url);
    if (u.pathname === "/tele/audit") return Response.json({ docx: DOCX });
    return Response.json({ skills: [] });
  } });
  const home = tmpHome();
  mkdirSync(join(home, ".claude", "skills", "mine"), { recursive: true });
  writeFileSync(join(home, ".claude", "skills", "mine", "SKILL.md"), "---\ndescription: My own skill.\n---\n");
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  const port = 20000 + Math.floor(Math.random() * 20000);
  const p = Bun.spawn([process.execPath, join(import.meta.dir, "install.ts"), "web", "--foreground", "--no-open", "--port", String(port)],
    { env: { ...process.env, HOME: home, USERPROFILE: home, KAIZEN_HOME: join(home, "kz"), KAIZEN_SKILLS_SH: `http://127.0.0.1:${fake.port}` }, stdout: "ignore", stderr: "ignore" });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/")).ok) break; } catch { /* not up yet */ } await Bun.sleep(100); }
    const post = (path: string, body: object) => fetch(base + path, { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify(body) });
    const token = async () => ((await (await fetch(base + "/skills")).json()) as any).token as string;
    // Install takes only an inspect's token: the page's token, a made-up one or none are refused, for skills and plugins.
    for (const body of [{}, { token: await token() }, { token: "made-up", risky: true }]) {
      const r = await post("/skills/install", { source: "anthropics/skills", name: "docx", ...body });
      expect(r.status).toBe(400);
      expect(((await r.json()) as any).error).toContain("inspect required");
      expect((await post("/skills/plugin-install", { name: "github", ...body })).status).toBe(400);
    }
    // Inspect refuses a name outside the patterns before looking at anything.
    expect((await post("/skills/inspect", { kind: "skill", source: "a/b; rm -rf ~", name: "x" })).status).toBe(400);
    expect((await post("/skills/plugin-remove", { name: "constructor", token: await token() })).status).toBe(400);
    // The user's own folder shows under outside skills; Remove needs the page token and moves it aside, never deletes it.
    const page = (await (await fetch(base + "/skills")).json()) as any;
    expect(page.outside.map((s: any) => `${s.id}:${s.origin}`)).toContain("mine:folder");
    expect((await post("/skills/remove", { name: "mine", token: "made-up" })).status).toBe(400);
    expect(existsSync(join(home, ".claude", "skills", "mine", "SKILL.md"))).toBe(true);
    const r2 = await post("/skills/remove", { name: "mine", token: await token() });
    expect(r2.status).toBe(200);
    const moved = ((await r2.json()) as any).movedTo as string;
    expect(existsSync(join(home, ".claude", "skills", "mine"))).toBe(false);
    expect(readFileSync(join(moved, ".claude", "mine", "SKILL.md"), "utf8")).toContain("My own skill");
  } finally { p.kill(); fake.stop(true); }
}, 30000);
