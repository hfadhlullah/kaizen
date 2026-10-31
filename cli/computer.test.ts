import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computer, computerCheck } from "./computer.ts";
import { bundledSkills, setSkill, skillsHeld, skillsToLink } from "./skills.ts";

const repo = join(import.meta.dir, "..");
let t: string, home: string, fake: string[];
beforeEach(() => {
  t = mkdtempSync(join(tmpdir(), "kz-computer-"));
  home = join(t, "home");
  mkdirSync(join(home, ".claude"), { recursive: true });
  // A stand-in helper: prints the argv it was given, so a test sees exactly what arrived.
  const f = join(t, "fake.js");
  writeFileSync(f, `const a = process.argv.slice(2);
if (a[0] === "big") console.log(JSON.stringify({ ok: true, pad: "x".repeat(300000) }));
else if (a[0] === "state" && a[1] === "nope") console.log(JSON.stringify({ ok: false, code: "app-not-found", error: "no app" }));
else console.log(JSON.stringify({ ok: true, argv: a }));`);
  fake = [process.execPath, f];
});
afterEach(() => rmSync(t, { recursive: true, force: true }));
const turnOn = () => setSkill(repo, home, "kaizen-computer", true, true);

test("G-01: off after install and upgrade, with no links; on needs confirm", () => {
  const s = bundledSkills(repo).find((x) => x.id === "kaizen-computer")!;
  expect([s.group, s.offByDefault]).toEqual(["optional", true]);
  const held = skillsHeld(repo, home);
  expect(held).toContain("kaizen-computer");
  const rels = bundledSkills(repo).map((x) => x.rel);
  for (const global of [true, false]) expect(skillsToLink(rels, [], global, held)).not.toContain("optional/kaizen-computer");
  expect(skillsToLink(["kaizen"], [], true, ["kaizen"])).toEqual(["kaizen"]);
  expect(setSkill(repo, home, "kaizen-computer", true)).toBe("confirm required");
  expect(skillsHeld(repo, home)).toContain("kaizen-computer");
  expect(turnOn()).toBeNull();
  expect(skillsHeld(repo, home)).not.toContain("kaizen-computer");
  expect(skillsToLink(rels, [], true, skillsHeld(repo, home))).toContain("optional/kaizen-computer");
  expect(setSkill(repo, home, "kaizen-computer", false)).toBeNull();
  expect(skillsHeld(repo, home)).toContain("kaizen-computer");
});

test("G-02: every command refuses while off, before the helper runs", async () => {
  for (const argv of [["apps"], ["windows", "a"], ["state", "a"], ["click", "a", "0"], ["set-value", "a", "0", "x"], ["type", "a", "0", "x"], ["nonsense"]]) {
    const r = await computer(argv, { home, cmd: fake });
    expect(r.code).toBe(1);
    expect(r.out).toMatchObject({ ok: false, code: "disabled" });
    expect(String(r.out.recovery)).toContain("Settings");
  }
  turnOn();
  expect((await computer(["apps"], { home, cmd: fake })).out.ok).toBe(true);
});

test("G-05: arguments reach the helper as plain argv, output is capped, bad calls and errors carry recovery", async () => {
  turnOn();
  const evil = "x; touch /tmp/kz-pwn $(id) `id` | cat";
  const r = await computer(["type", "App Name", "0.1", evil], { home, cmd: fake });
  expect(r.out.argv).toEqual(["type", "App Name", "0.1", evil]);
  expect(await computer(["state", "a", "b", "c"], { home, cmd: fake })).toMatchObject({ code: 1, out: { code: "bad-usage" } });
  expect((await computer(["big"], { home, cmd: fake })).code).toBe(1); // not a verb
  const huge = await computer(["apps"], { home, cmd: [process.execPath, "-e", 'console.log(JSON.stringify({ok:true,pad:"x".repeat(300000)}))'] });
  expect(huge.out).toMatchObject({ ok: false, code: "too-large" });
  const err = await computer(["state", "nope"], { home, cmd: fake });
  expect(err.out).toMatchObject({ ok: false, code: "app-not-found" });
  expect(String(err.out.recovery)).toContain("apps");
  const junk = await computer(["apps"], { home, cmd: [process.execPath, "-e", "console.log('not json')"] });
  expect(junk.out).toMatchObject({ code: "helper-failed" });
});

// The helper's own logic, on fake nodes: no desktop needed. Skipped where python3 is missing.
const py = Bun.which("python3");
const probe = (body: string) => {
  const dir = join(repo, "cli");
  const code = `import sys, json\nsys.path.insert(0, ${JSON.stringify(dir)})\nimport importlib.util as u\nspec = u.spec_from_file_location("h", ${JSON.stringify(join(dir, "computer-helper.py"))})\nh = u.module_from_spec(spec); spec.loader.exec_module(h)\n${body}`;
  const r = Bun.spawnSync([py!, "-I", "-c", code], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode) throw new Error(r.stderr.toString());
  return JSON.parse(r.stdout.toString());
};
const FAKE = `
class F(h.Node):
    def __init__(s, role, name="", kids=(), text=None, edit=False, st=("showing", "enabled")):
        s._r, s._n, s.k, s._t, s._e, s._s, s.log = role, name, list(kids), text, edit, list(st), []
    def role(s): return s._r
    def name(s): return s._n
    def states(s): return s._s
    def count(s): return len(s.k)
    def child(s, i): return s.k[i]
    def text(s, cap):
        if s._r == h.SECURE: raise AssertionError("secret read")
        return s._t
    def number(s): return None
    def actions(s): return []
    def editable(s): return s._e
    def set_text(s, v): s.log.append(("set", v))
    def append_text(s, v): s.log.append(("add", v))
    def focus(s): return True
`;

test.skipIf(!py)("G-03: a password manager is matched by name before its tree is read", () => {
  const r = probe(`${FAKE}
class Boom(F):
    def count(s): raise AssertionError("tree read")
    def child(s, i): raise AssertionError("tree read")
root = F("desktop", kids=[Boom("application", "KeePassXC"), F("application", "Editor")])
try: h.find_app(root, "keepass"); got = "no refusal"
except h.Fail as f: got = f.code
print(json.dumps({"got": got, "other": h.find_app(root, "edit").name(), "flag": [h.blocked(x) for x in ("1Password", "Bitwarden", "gedit")]}))`);
  expect(r).toEqual({ got: "blocked-app", other: "Editor", flag: [true, true, false] });
});

test.skipIf(!py)("G-04: a secure field gives no value and refuses set-value and type; the tree is capped", () => {
  const r = probe(`${FAKE}
pw = F("password text", "Password", text="hunter2", edit=True)
box = F("text", "Name", text="ada", edit=True)
win = F("frame", "Login", kids=[box, pw])
app = F("application", "Login", kids=[win])
d = h.describe(win, "0", 0, [300])
codes = []
for verb in ("set-value", "type"):
    try: h.act(app, verb, [app.name(), "0.1", "x"]); codes.append("accepted")
    except h.Fail as f: codes.append(f.code)
big = F("frame", "W", kids=[F("button", "b" + str(i)) for i in range(1000)])
cap = h.describe(big, "0", 0, [300])
deep = F("frame", "d")
n = deep
for i in range(20):
    c = F("panel", "p"); n.k.append(c); n = c
dd = h.describe(deep, "0", 0, [300])
depth = 0; x = dd
while x.get("children"): x = x["children"][0]; depth += 1
print(json.dumps({"pw": d["children"][1], "box": d["children"][0].get("value"), "nodes": len(cap["children"]), "trunc": cap.get("truncated"), "depth": depth, "long": len(h.describe(F("text", "n", text="y" * 900), "0", 0, [9])["value"]), "pwlog": pw.log, "codes": codes}))`);
  expect(r.pw).toEqual({ id: "0.1", role: "password text", name: "Password", secure: true, states: [] });
  expect(r.box).toBe("ada");
  expect(r.codes).toEqual(["secure-field", "secure-field"]);
  expect([r.nodes, r.trunc, r.depth, r.pwlog]).toEqual([299, true, 8, []]);
  expect(r.long).toBeLessThanOrEqual(201);
});

test("the row's check never throws, and Wayland shows its note", () => {
  const c = computerCheck([process.execPath, "-e", 'console.log(JSON.stringify({ok:true,atspi:true,a11y:false}))']);
  expect(c.needs).toEqual([{ name: "AT-SPI bindings", found: true }, { name: "accessibility on", found: false }]);
  expect(computerCheck([process.execPath, "-e", "process.exit(3)"]).needs.every((n) => !n.found)).toBe(true);
});

// The real helper, run by hand with no on-list: it must refuse by itself, not rely on computer.ts.
test.skipIf(!py)("the helper refuses on its own while the skill is off, and a corrupt on-list counts as off", () => {
  const run = (verb: string[]) => JSON.parse(Bun.spawnSync([py!, "-I", join(repo, "cli", "computer-helper.py"), ...verb], { env: { ...process.env, HOME: home }, stdout: "pipe", stderr: "ignore" }).stdout.toString());
  for (const v of [["apps"], ["state", "a"], ["click", "a", "0"], ["set-value", "a", "0", "x"], ["type", "a", "0", "x"]]) expect(run(v)).toMatchObject({ ok: false, code: "disabled" });
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  writeFileSync(join(home, ".kaizen", "skills-on.json"), "{not json");
  expect(run(["apps"])).toMatchObject({ code: "disabled" });
  writeFileSync(join(home, ".kaizen", "skills-on.json"), JSON.stringify(["kaizen-deck"]));
  expect(run(["apps"])).toMatchObject({ code: "disabled" });
  writeFileSync(join(home, ".kaizen", "skills-on.json"), JSON.stringify(["kaizen-computer"]));
  expect(run(["apps"]).code).not.toBe("disabled"); // on: it goes on to the desktop, which may have no bus here
});
