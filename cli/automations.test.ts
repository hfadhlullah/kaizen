import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addRule, DAILY_CAP, dueSince, fire, nextRun, parseCron, patchRule, presetCron, promptOf, readHistory, readRules, runOf, shellArgv, shown, tickAutomations, type Rule } from "./automations.ts";

// Nothing here starts an agent or a terminal: every launch is the fake below.
const proj = () => { const d = mkdtempSync(join(tmpdir(), "kz-auto-")); const st = join(d, ".kaizen"); mkdirSync(join(st, "runs"), { recursive: true }); return st; };
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const spy = (ok = true) => { const calls: { it: any; from: string; pick: any }[] = []; return { calls, launch: ((it: any, from: string, _r: any, pick: any) => { calls.push({ it, from, pick }); return ok ? { ok: true } : { ok: false, why: "no terminal" }; }) as any }; };
const mk = (st: string, o: any = {}): Rule => { const r = addRule(st, { name: "n", text: "check things", kind: "hourly", time: "09:05", ...o }); if (typeof r === "string") throw new Error(r); return r; };
const run = (st: string, id: string, text: string, stage = "plan", awaiting?: string) => { mkdirSync(join(st, "runs", id), { recursive: true }); writeFileSync(join(st, "runs", id, "00-request.md"), text); writeFileSync(join(st, "runs", id, "state.json"), JSON.stringify({ stage, awaiting })); };

test("G-01 cron parse and next run", () => {
  expect(nextRun("*/15 * * * *", at(2026, 1, 5, 10, 1))).toBe(at(2026, 1, 5, 10, 15));
  expect(nextRun("0 9 * * 1-5", at(2026, 1, 9, 10))).toBe(at(2026, 1, 12, 9)); // Fri -> Mon
  expect(nextRun("0 9 * * 0", at(2026, 1, 5))).toBe(at(2026, 1, 11, 9));
  expect(nextRun("0 9 * * 7", at(2026, 1, 5))).toBe(at(2026, 1, 11, 9));
  expect(nextRun("0 9 1,15 * 1", at(2026, 1, 2))).toBe(at(2026, 1, 5, 9)); // dom or dow
  expect(nextRun("0 9 1-3 * *", at(2026, 1, 4))).toBe(at(2026, 2, 1, 9));
  for (const bad of ["@daily", "0 9 * * mon", "61 * * * *", "0 0 ? * *", "* * * *", "0 0 L * *", "*/0 * * * *"]) expect(typeof parseCron(bad)).toBe("string");
  expect(nextRun("0 0 31 2 *", Date.now())).toBeNull();
  expect(typeof addRule(proj(), { name: "x", text: "abc", kind: "cron", cron: "0 0 31 2 *" })).toBe("string");
  expect(presetCron("weekdays", "09:30", "mon")).toBe("30 9 * * 1-5");
  expect(presetCron("weekly", "09:30", "fri")).toBe("30 9 * * 5");
  expect(presetCron("hourly", "09:05", "")).toBe("5 * * * *");
  // the minute walk keeps a daily time across a DST change (whatever the machine's zone does)
  const a = nextRun("0 9 * * *", at(2026, 3, 7, 12))!, b = nextRun("0 9 * * *", at(2026, 11, 1, 12))!;
  expect([new Date(a).getHours(), new Date(b).getHours()]).toEqual([9, 9]);
});

test("G-02/G-03 one fire per due minute, even from two boards", async () => {
  const st = proj(), r = mk(st), s = spy(), due = at(2026, 1, 5, 9, 5);
  const out = await Promise.all([fire(st, r, "scheduled", due, { launch: s.launch }), fire(st, r, "scheduled", due, { launch: s.launch })]);
  expect(out.filter(Boolean).length).toBe(1);
  expect(s.calls.length).toBe(1);
  expect(readHistory(st).length).toBe(1);
  expect(await fire(st, r, "scheduled", due, { launch: s.launch })).toBeNull();
});

test("G-04 grace: a short outage fires once, a long one is skipped, a new rule never fires for the past", async () => {
  const st = proj(), r = mk(st), s = spy();
  const base = r.last_fired_for;
  await tickAutomations([st], { launch: s.launch, now: () => base + 30_000 });
  expect(s.calls.length).toBe(0);
  const st2 = proj(); const r2 = mk(st2, { kind: "daily", time: "09:00" }); const s2 = spy();
  patchRule(st2, r2.id, (x) => ({ ...x, last_fired_for: at(2026, 1, 1) }));
  await tickAutomations([st2], { launch: s2.launch, now: () => at(2026, 1, 4, 9, 30) }); // three days: only the last slot, 30 min old
  expect(s2.calls.length).toBe(1);
  const st3 = proj(); const r3 = mk(st3, { kind: "daily", time: "09:00" }); const s3 = spy();
  patchRule(st3, r3.id, (x) => ({ ...x, last_fired_for: at(2026, 1, 1) }));
  await tickAutomations([st3], { launch: s3.launch, now: () => at(2026, 1, 4, 23, 0) }); // 14 h > 12 h grace
  expect(s3.calls.length).toBe(0);
  expect(readHistory(st3)[0]!.status).toBe("skipped_missed");
  await tickAutomations([st3], { launch: s3.launch, now: () => at(2026, 1, 4, 23, 1) });
  expect(readHistory(st3).length).toBe(1);
});

test("G-05 overlap until the previous run is done", async () => {
  const st = proj(), r = mk(st), s = spy();
  const h1 = (await fire(st, r, "manual", 0, { launch: s.launch, now: () => 1_000_000 }))!;
  expect(h1.status).toBe("launched");
  run(st, "r1", `Request: x [automation n fire ${h1.fire}]`, "plan", "approvals.plan");
  expect((await fire(st, r, "manual", 0, { launch: s.launch, now: () => 1_000_001 }))!.status).toBe("skipped_overlap");
  run(st, "r1", `Request: x [automation n fire ${h1.fire}]`, "done");
  expect((await fire(st, r, "manual", 0, { launch: s.launch, now: () => 1_000_002 }))!.status).toBe("launched");
  expect(s.calls.length).toBe(2);
});

test("G-06 precheck gates scheduled fires only, and a timeout kills the child", async () => {
  const st = proj(), s = spy(), due = at(2026, 1, 5, 9, 5);
  const ok = mk(st, { precheck: "exit 0" }), no = mk(st, { precheck: "echo nope; exit 1" }), slow = mk(st, { precheck: "sleep 30", precheck_timeout: 1 });
  expect((await fire(st, ok, "scheduled", due, { launch: s.launch }))!.status).toBe("launched");
  const h = (await fire(st, no, "scheduled", due, { launch: s.launch }))!;
  expect([h.status, h.reason]).toEqual(["skipped_precheck", "exit 1: nope"]);
  const t0 = Date.now();
  const hs = (await fire(st, slow, "scheduled", due, { launch: s.launch }))!;
  expect(hs.status).toBe("skipped_precheck");
  expect(hs.reason).toContain("timed out");
  expect(Date.now() - t0).toBeLessThan(10_000);
  expect(s.calls.length).toBe(1);
  expect((await fire(st, no, "manual", 0, { launch: s.launch }))!.status).toBe("launched");
});

test("G-07/G-08 auto mode, no yolo, guarded text and the marker", async () => {
  const st = proj(), s = spy();
  for (const t of ["auto x", "plan y", "approve everything"]) {
    const r = mk(st, { text: t });
    const p = promptOf(r, "f1");
    expect(p.text.startsWith("auto Request: ")).toBe(true);
  }
  const r = mk(st, { text: "tidy   the\nbacklog" });
  await fire(st, r, "manual", 0, { launch: s.launch });
  const it = s.calls[0]!.it;
  expect(it.text).toMatch(/^auto tidy the backlog \[automation n fire [\w.]+\]$/);
  expect(JSON.stringify(s.calls[0]!.pick ?? {})).not.toContain("yolo");
  expect(s.calls[0]!.from).toBe(st);
});

test("G-09 failures: launch error does not retry, daily cap stops launches", async () => {
  const st = proj(), r = mk(st), bad = spy(false);
  const h = (await fire(st, r, "manual", 0, { launch: bad.launch }))!;
  expect([h.status, h.reason]).toEqual(["launch_failed", "no terminal"]);
  const st2 = proj(), r2 = mk(st2), s = spy();
  let n = 0;
  for (let i = 0; i < DAILY_CAP; i++) { const x = (await fire(st2, r2, "manual", 0, { launch: s.launch, now: () => 5_000_000 + i }))!; if (x.status === "skipped_overlap") continue; n++; }
  expect(s.calls.length).toBe(1);
  // fill history directly to the cap, then one more
  const hist = Array.from({ length: DAILY_CAP }, (_, i) => ({ rule: r2.id, fire: `x${i}`, due: 0, at: 9_000_000 + i, kind: "manual", status: "launch_failed" }));
  writeFileSync(join(st2, "automation-runs.json"), JSON.stringify(hist));
  expect((await fire(st2, r2, "manual", 0, { launch: s.launch, now: () => 9_100_000 }))!.status).toBe("skipped_cap");
  expect(n).toBeGreaterThan(0);
});

test("G-10 files: a corrupt rules file is not overwritten; history keeps 100", async () => {
  const st = proj();
  writeFileSync(join(st, "automations.json"), "{nope");
  expect(await tickAutomations([st], { launch: spy().launch })).toBe(false);
  expect(readFileSync(join(st, "automations.json"), "utf8")).toBe("{nope");
  expect(typeof addRule(st, { name: "x", text: "abc", kind: "hourly" })).toBe("string");
  expect(() => readRules(st)).toThrow();
  const st2 = proj(), r = mk(st2), s = spy();
  for (let i = 0; i < 105; i++) await fire(st2, r, "manual", 0, { launch: s.launch, now: () => 1_000 + i * 2 * 86_400_000 }).catch(() => 0);
  expect(readHistory(st2).length).toBeLessThanOrEqual(100);
});

test("G-11 a rule launches in its own project only", async () => {
  const a = proj(), b = proj(), s = spy();
  const r = mk(a);
  await fire(a, r, "manual", 0, { launch: s.launch });
  expect(s.calls[0]!.from).toBe(a);
  expect(readHistory(b).length).toBe(0);
});

test("G-12 a history line follows its run", async () => {
  const st = proj(), r = mk(st), s = spy();
  const h = (await fire(st, r, "manual", 0, { launch: s.launch }))!;
  expect(runOf(st, h.fire)).toBeNull();
  expect(shown(st, h, h.at + 60_000).status).toBe("launched");
  expect(shown(st, h, h.at + 16 * 60_000).status).toBe("launch_failed");
  run(st, "r9", `auto Request: x [automation n fire ${h.fire}]`, "build");
  expect(shown(st, h)).toEqual({ status: "running", run: "r9" });
  expect(runOf(st, h.fire.slice(0, -1))).toBeNull(); // a longer id is not a prefix match
});

test("G-13 the module never approves, passes yolo or runs kaizen approve", () => {
  const src = readFileSync(join(import.meta.dir, "automations.ts"), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  expect(src).not.toMatch(/yolo:|\bapprove\w*\(|kaizen approve|"\/approve/i);
  expect(dueSince("* * * * *", 0, 0)).toBeNull();
});

test("fix: a launch that lost its marker still blocks for a day; a live terminal blocks a done run", async () => {
  const st = proj(), r = mk(st), s = spy();
  const h1 = (await fire(st, r, "manual", 0, { launch: s.launch, now: () => 1_000_000 }))!;
  const t = h1.at + 2 * 3_600_000; // marker never reached 00-request.md, past the 15 minute mark
  expect((await fire(st, r, "manual", 0, { launch: s.launch, now: () => t }))!.status).toBe("skipped_overlap");
  const h = h1.at + 25 * 3_600_000;
  expect((await fire(st, r, "manual", 0, { launch: s.launch, now: () => h }))!.status).toBe("launched");
  const st2 = proj(), r2 = mk(st2), h2 = (await fire(st2, r2, "manual", 0, { launch: s.launch, now: () => 1_000_000 }))!;
  run(st2, "r1", `Request: x [automation n fire ${h2.fire}]`, "done");
  expect((await fire(st2, r2, "manual", 0, { launch: s.launch, now: () => 1_000_001, live: (_s, id) => id === "r1" }))!.status).toBe("skipped_overlap");
});

test("fix: the precheck shell per platform", () => {
  expect(shellArgv("echo hi", true)).toEqual(["cmd", "/c", "echo hi"]);
  expect(shellArgv("echo hi", false)).toEqual(["sh", "-c", "echo hi"]);
});
