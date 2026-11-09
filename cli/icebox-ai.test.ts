// The icebox's ChatGPT side: a board capture is sorted after it has answered, never over a
// kind someone chose, and the promote form's task draft. ChatGPT is a local stand-in.
import { test, expect, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applySort, capture, readIcebox, setKind } from "./sources.ts";

const roots: string[] = [];
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));
const scratch = () => { const r = realpathSync(mkdtempSync(join(tmpdir(), "kz-ice-ai-"))); roots.push(r); return r; };

test("applySort writes only items still sorted by the rules, and merges tags", async () => {
  const st = join(scratch(), ".kaizen");
  mkdirSync(st, { recursive: true });
  const a = await capture(st, { text: "Looking for someone to automate an office", tags: ["office"] }, undefined, undefined);
  const b = await capture(st, { text: "Client wants Excel export", kind: "client" });
  const c = await capture(st, { text: "A note sorted by hand later" });
  if (!("id" in a) || !("id" in b) || !("id" in c)) throw new Error("capture failed");
  expect(setKind(st, [c.id], "finding")).toBeNull();
  expect(applySort(st, a.id, "people", ["Automation", "office"])).toBe(true);
  expect(applySort(st, b.id, "people", ["x"])).toBe(false);   // a person chose client
  expect(applySort(st, c.id, "client", ["x"])).toBe(false);   // a person chose finding
  expect(applySort(st, a.id, "client")).toBe(false);          // already sorted by the AI
  expect(applySort(st, "nope", "client")).toBe(false);
  const ice = readIcebox(st), by = (id: string) => ice.find((s) => s.id === id)!;
  expect(by(a.id)).toMatchObject({ kind: "people", sorted: "ai", tags: ["office", "automation"] });
  expect(by(b.id)).toMatchObject({ kind: "client", sorted: "me" });
  expect(by(c.id)).toMatchObject({ kind: "finding", sorted: "me" });
  expect(applySort(st, a.id, "urgent")).toBe(false);
});

test.skipIf(process.platform === "win32")("the board sorts a capture after answering, never over a person's kind, and drafts a task", async () => {
  const homeDir = scratch(), proj = join(homeDir, "p"), st = join(proj, ".kaizen");
  for (const d of [st, join(homeDir, ".kaizen"), join(homeDir, ".claude")]) mkdirSync(d, { recursive: true });
  writeFileSync(join(homeDir, ".kaizen", "projects"), proj + "\n");
  writeFileSync(join(proj, "README.md"), "kaizen plans, builds and reviews work with AI agents.\n");
  const creds = join(homeDir, ".kaizen", "chatgpt.json");
  writeFileSync(creds, JSON.stringify({ host: "urn:uuid:x", client_id: "c", refresh_token: "r", access_token: "a", expires_at: Date.now() + 3_600_000 }));
  const asked: string[] = [];
  const ev = (o: object) => "data: " + JSON.stringify(o) + "\n\n";
  const said = (o: object) => new Response(ev({ type: "response.completed", response: { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(o) }] }] } }));
  const fake = Bun.serve({
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname;
      if (path.endsWith("/models")) return Response.json({ models: [{ slug: "gpt-test" }] });
      const body: any = await req.json();
      const name = body.text.format.name;
      asked.push(name + ":" + body.input[0].content[0].text.split("\n").pop());
      if (name === "icebox_sort") { await Bun.sleep(1200); return said({ kind: "people", tags: ["office"] }); }
      return said({ title: "Automate the office intake", details: "Asked in a post.\n- First: list the steps." });
    },
  });
  const port = 20000 + Math.floor(Math.random() * 20000), at = `http://127.0.0.1:${port}`;
  const repo = join(import.meta.dir, "..");
  const proc = Bun.spawn([process.execPath, join(repo, "cli", "install.ts"), "web", "--port", String(port), "--no-open", "--foreground"], {
    cwd: proj, env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir, KAIZEN_HOME: repo, KAIZEN_CHATGPT_URL: `http://127.0.0.1:${fake.port}`, FIRECRAWL_API_KEY: "" }, stdout: "ignore", stderr: "ignore",
  });
  try {
    for (let i = 0; ; i++) { try { await fetch(at + "/state"); break; } catch { if (i > 150) throw new Error("board did not start"); await Bun.sleep(50); } }
    const post = async (body: object) => { const r = await fetch(at + "/icebox", { method: "POST", headers: { "content-type": "application/json", origin: at }, body: JSON.stringify({ dir: st, ...body }) }); const t = await r.text(); try { return { status: r.status, ...JSON.parse(t) }; } catch { throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`); } };
    const item = (id: string) => readIcebox(st).find((s) => s.id === id)!;

    // Answers at once; the sort lands afterwards.
    const t0 = Date.now();
    const a = await post({ op: "add", text: "Looking for someone to automate an office, please DM" });
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(a.ok).toBe(true);
    expect(item(a.id)).toMatchObject({ sorted: "rules" });
    // A person picks a kind while ChatGPT is still thinking about the next one: theirs stays.
    const b = await post({ op: "add", text: "Client asked for weekly Excel export" });
    expect(await post({ op: "kind", ids: [b.id], kind: "client" })).toMatchObject({ ok: true });
    // A capture that names its kind is not sent at all.
    await post({ op: "add", text: "My own finding with a kind", kind: "finding" });
    for (let i = 0; i < 80 && item(a.id).sorted === "rules"; i++) await Bun.sleep(50);
    await Bun.sleep(1500);
    expect(item(a.id)).toMatchObject({ kind: "people", sorted: "ai", tags: ["office"] });
    expect(item(b.id)).toMatchObject({ kind: "client", sorted: "me" });
    expect(asked.filter((x) => x.startsWith("icebox_sort")).length).toBeLessThanOrEqual(2);
    expect(asked.some((x) => x.includes("My own finding"))).toBe(false);

    // The promote form's draft; refused from another origin, and without ChatGPT.
    expect(await post({ op: "task-draft", ids: [a.id] })).toMatchObject({ ok: true, title: "Automate the office intake", details: "Asked in a post.\n- First: list the steps." });
    expect(await post({ op: "task-draft", ids: ["nope"] })).toMatchObject({ status: 404 });
    const foreign = await fetch(at + "/icebox", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ dir: st, op: "task-draft", ids: [a.id] }) });
    expect(foreign.status).toBe(403);
    rmSync(creds);
    expect(await post({ op: "task-draft", ids: [a.id] })).toMatchObject({ status: 409, error: "Connect ChatGPT to draft tasks" });
    const c = await post({ op: "add", text: "Captured while not connected" });
    await Bun.sleep(300);
    expect(item(c.id)).toMatchObject({ sorted: "rules" });
  } finally {
    proc.kill();
    await proc.exited;
    fake.stop(true);
  }
}, 30_000);

// "Collection" is the word people see; "board" (what is stored, and the first name) still works.
test("kaizen icebox: --collection and collection(s) work beside --board and board(s)", () => {
  const homeDir = scratch(), proj = join(homeDir, "p");
  mkdirSync(join(proj, ".kaizen"), { recursive: true });
  const kz = (...a: string[]) => {
    const p = Bun.spawnSync([process.execPath, join(import.meta.dir, "install.ts"), "icebox", ...a], { cwd: proj, env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir, CLAUDECODE: "", KAIZEN_RUN_ID: "", FIRECRAWL_API_KEY: "" }, stdin: "ignore" });
    return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
  };
  expect(kz("collections").out).toContain("no collections yet");
  expect(kz("collections", "add", "Arupadatu", "--client").code).toBe(0);
  const a = kz("add", "Weekly Excel export", "--collection", "Arupadatu");
  expect(a.code).toBe(0);
  expect(a.out).toContain("· Arupadatu]");
  const b = kz("add", "Old flag still works", "--board", "Pricing");
  expect(b.out).toContain("· Pricing]");
  const id = /icebox: (\w+)/.exec(b.out)![1]!;
  expect(kz("collection", id, "Arupadatu").out).toContain(`collection: ${id}`);
  expect(kz("board", id, "-").code).toBe(0);
  expect(kz("boards").out).toContain("Arupadatu");
  expect(kz("add", "x thing", "--collection", "A", "--client", "B").out).toContain("--collection or --client, not both");
  const st = join(proj, ".kaizen");
  expect(readIcebox(st).find((s) => s.text === "Weekly Excel export")).toMatchObject({ board: "Arupadatu", kind: "client" });
});
