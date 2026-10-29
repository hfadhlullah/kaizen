// The checks behind the board's "Add a project" sheet: every URL, path, branch and base
// a web page can send is tested here, and each refusal has a case.
import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, realpathSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gitUrl, destDir, cloneInto, branchesOf, winBad, dirSize, ignoreKaizen } from "./add-project.ts";
import { run, addWorktree, type Run } from "./worktree.ts";

const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), "addp-")));

test("gitUrl accepts https, ssh and user@host:path, and names the repository", () => {
  expect(gitUrl("https://github.com/o/repo.git")).toEqual({ url: "https://github.com/o/repo.git", name: "repo" });
  expect(gitUrl("  https://gitlab.example.com:8443/g/sub/repo/  ")).toMatchObject({ name: "repo" });
  expect(gitUrl("ssh://git@host.example/o/repo")).toMatchObject({ name: "repo" });
  expect(gitUrl("git@github.com:o/repo.git")).toEqual({ url: "git@github.com:o/repo.git", name: "repo" });
});

test("gitUrl refuses options, helper transports, plain http, local paths, credentials and odd characters", () => {
  for (const bad of [
    "", "   ", 5, null,
    "--upload-pack=touch /tmp/x", "-oProxyCommand=id", "--help",
    "ext::sh -c id", "ext::sh -c id%s", "fd::3", "file:///etc", "/etc/passwd", "./repo", "C:\\repo", "~/repo",
    "http://github.com/o/r.git", "git://github.com/o/r.git", "ftp://h/o/r",
    "https://github.com/o/r .git", "https://github.com/o/r\n--x", "https://github.com/o/r\0",
    "https://user:pw@github.com/o/r.git",
    "https://-evil.example/o/r.git", "ssh://-oProxyCommand=id/o/r", "ssh://git@-oProxyCommand=id/o/r",
    "-oProxyCommand=id@host:o/r", "git@-bad:o/r", "git@host:/abs/path",
    "https://github.com/o/../r.git", "https://github.com/", "https://github.com/o/.git", "https://github.com/o/..",
    "https://github.com/o/r$(id)", "https://github.com/o/r;id", "https://github.com/o/r|id",
    "https://" + "a".repeat(600) + "/r",
  ]) expect(gitUrl(bad), String(bad)).toHaveProperty("error");
});

test("winBad: Windows device names and trailing dots, on every platform", () => {
  for (const n of ["", ".", "..", "con", "NUL.txt", "COM1", "a.", "a ", "a:b", "a|b"]) expect(winBad(n), n).toBe(true);
  for (const n of ["config", "my-project", "a.b", "com10"]) expect(winBad(n), n).toBe(false);
});

test("destDir: resolves ~ and relative paths; refuses root, home, kaizen/git folders, .., bad names and places below a project", () => {
  const home = tmp();
  expect(destDir("~/Projects/x", home)).toEqual({ dir: join(home, "Projects", "x") });
  expect(destDir("x", home)).toEqual({ dir: join(home, "x") });
  expect(destDir(join(home, "y"), home)).toEqual({ dir: join(home, "y") });
  for (const bad of [
    "", "  ", 3, undefined, "/", "~", home, home + "/", "~/.kaizen/x", join(home, ".kaizen"),
    "/tmp/a/../../etc", "../x", "~/a/../b", "~/x/.git/y", "~/x/.kaizen", "~/con", "~/a.", "x\0y", "~/" + "a/".repeat(600),
  ]) expect(destDir(bad, home), String(bad)).toHaveProperty("error");
  // Below a known project, or below a folder that has a .kaizen: a second .kaizen would shadow the first.
  mkdirSync(join(home, "p", ".kaizen"), { recursive: true });
  expect(destDir(join(home, "p", "sub"), home)).toMatchObject({ error: expect.stringContaining("inside the project") });
  expect(destDir(join(home, "q", "sub"), home, [join(home, "q")])).toMatchObject({ error: expect.stringContaining("inside the project") });
  expect(destDir(join(home, "p"), home, [join(home, "p")])).toEqual({ dir: join(home, "p") }); // the project itself is fine
  expect(destDir(join(home, "other"), home, [join(home, "p")])).toEqual({ dir: join(home, "other") });
});

test("branchesOf lists local and origin branches, the current one, and the remote default first", () => {
  const root = tmp(), remote = join(root, "r.git"), proj = join(root, "p");
  const g = (cwd: string, ...a: string[]) => { const r = run(["git", "-c", "user.email=a@b.c", "-c", "user.name=t", ...a], cwd); if (!r.ok) throw new Error(r.why); return r.out; };
  g(root, "init", "-q", "--bare", "-b", "main", remote);
  g(root, "clone", "-q", remote, proj);
  writeFileSync(join(proj, "a"), "a"); g(proj, "add", "a"); g(proj, "commit", "-qm", "a"); g(proj, "push", "-q", "origin", "HEAD:main");
  g(proj, "remote", "set-head", "origin", "main");
  g(proj, "checkout", "-q", "-b", "dev");
  const b = branchesOf(proj);
  expect(b.current).toBe("dev");
  expect(b.def).toBe("origin/main");
  expect(b.branches.sort()).toEqual(["dev", "main", "origin/main"]);
  expect(branchesOf(root)).toEqual({ current: "", def: "", branches: [] }); // not a repository
  const none: Run = () => ({ ok: false, out: "", why: "git is not installed" });
  expect(branchesOf(proj, none).branches).toEqual([]);
  // addWorktree with a base: the branch starts at the base's tip; unknown or option-like bases are refused.
  const old = g(proj, "rev-parse", "origin/main");
  writeFileSync(join(proj, "b"), "b"); g(proj, "add", "b"); g(proj, "commit", "-qm", "b");
  expect(addWorktree(proj, "f1", run, "--detach")).toMatchObject({ ok: false });
  expect(addWorktree(proj, "f1", run, "-x")).toMatchObject({ ok: false });
  expect(addWorktree(proj, "f1", run, "nope")).toMatchObject({ ok: false });
  expect(addWorktree(proj, "f1", run, "HEAD~1")).toMatchObject({ ok: false });
  expect(existsSync(join(proj, ".kaizen/wt/f1"))).toBe(false);
  const w = addWorktree(proj, "f1", run, "origin/main") as { path: string };
  expect(w.ok).toBe(true);
  expect(g(w.path, "rev-parse", "HEAD")).toBe(old);
  expect(run(["git", "config", "--get", "branch.f1.remote"], w.path).out).toBe(""); // --no-track
});

test("cloneInto: argv is `git clone -- url to` with the protocol allow-list and no prompts; a failure removes what it made", async () => {
  const seen: { cmd: string[]; env: any }[] = [];
  const fake = (code: number) => (cmd: string[], o: any) => { seen.push({ cmd, env: o.env }); return { stderr: "fatal: nope\nfatal: gone", exited: Promise.resolve(code), kill() {} }; };
  const dir = tmp(), to = join(dir, "r");
  expect(await cloneInto("https://h.example/o/r.git", to, fake(0))).toEqual({ ok: true });
  expect(seen[0]!.cmd).toEqual(["git", "clone", "--", "https://h.example/o/r.git", to]);
  expect(seen[0]!.env.GIT_ALLOW_PROTOCOL).toBe("https:ssh");
  expect(seen[0]!.env.GIT_TERMINAL_PROMPT).toBe("0");
  // Failure: the last stderr line is the reason; a folder the call made goes, one that was there stays.
  mkdirSync(to);
  expect(await cloneInto("https://h.example/o/r.git", to, fake(128))).toEqual({ ok: false, why: "fatal: gone" });
  expect(existsSync(to)).toBe(true);
  const mine = join(dir, "mine");
  const mk = (cmd: string[], o: any) => { mkdirSync(mine); return fake(1)(cmd, o); };
  expect((await cloneInto("https://h.example/o/r.git", mine, mk)).ok).toBe(false);
  expect(existsSync(mine)).toBe(false);
});

test("cloneInto against a real local repository (protocol list opened for the test only)", async () => {
  const root = tmp(), src = join(root, "src"), to = join(root, "out");
  const g = (cwd: string, ...a: string[]) => { const r = run(["git", "-c", "user.email=a@b.c", "-c", "user.name=t", ...a], cwd); if (!r.ok) throw new Error(r.why); };
  mkdirSync(src); g(src, "init", "-q", "-b", "main"); writeFileSync(join(src, "f"), "x"); g(src, "add", "f"); g(src, "commit", "-qm", "f");
  // The default protocols refuse a file path, the point of GIT_ALLOW_PROTOCOL.
  expect((await cloneInto(src, to)).ok).toBe(false);
  expect(existsSync(to)).toBe(false);
  expect(await cloneInto(src, to, undefined, "file")).toEqual({ ok: true });
  expect(readFileSync(join(to, "f"), "utf8")).toBe("x");
});

test("gitUrl refuses an ssh user that starts with a dash", () => {
  expect(gitUrl("ssh://-oFoo@host.example/x/r.git")).toHaveProperty("error");
  expect(gitUrl("-oFoo@host.example:x/r.git")).toHaveProperty("error");
  expect(gitUrl("ssh://git@host.example/x/r.git")).toHaveProperty("url");
});

test("destDir: symlinks, case, the ~/.kaizen prefix and places outside home", () => {
  const home = tmp(), out = tmp();
  mkdirSync(join(home, "p", ".kaizen"), { recursive: true });
  mkdirSync(join(home, "empty"));
  symlinkSync(join(home, "empty"), join(home, "ln"));
  expect(destDir(join(home, "ln"), home)).toMatchObject({ error: expect.stringContaining("symbolic link") });
  // An existing folder is canonicalised, so a dir reached through a link into a project is still below it.
  symlinkSync(join(home, "p"), join(home, "via"));
  expect(destDir(join(home, "via", "sub"), home, [join(home, "p")])).toMatchObject({ error: expect.stringContaining("inside the project") });
  for (const bad of ["~/X/.GIT/y", "~/x/.Kaizen", "~/.KAIZEN/x", "~/.kaizen/x"]) expect(destDir(bad, home), bad).toHaveProperty("error");
  expect(destDir("~/.kaizenfoo", home)).toEqual({ dir: join(home, ".kaizenfoo") });
  // Outside home: refused, unless under the Projects folder setting.
  expect(destDir(join(out, "x"), home)).toMatchObject({ error: expect.stringContaining("inside your home") });
  expect(destDir(join(out, "x"), home, [], out)).toEqual({ dir: join(out, "x") });
});

test("cloneInto: a clone that runs past the timeout or the size cap is killed (group) and what it made is removed", async () => {
  const dir = tmp();
  const hang = (made: string) => (cmd: string[], o: any) => {
    let done!: (n: number) => void;
    const exited = new Promise<number>((r) => (done = r));
    mkdirSync(made);
    return { stderr: "", exited, kill() { done(137); } };
  };
  const t = join(dir, "t");
  expect(await cloneInto("https://h.example/o/r.git", t, hang(t), "https:ssh", 30, 1e9, 1e6)).toEqual({ ok: false, why: "git clone timed out" });
  expect(existsSync(t)).toBe(false);
  const c = join(dir, "c");
  const r = await cloneInto("https://h.example/o/r.git", c, hang(c), "https:ssh", 60_000, 100, 10, () => 101);
  expect(r).toMatchObject({ ok: false, why: expect.stringContaining("larger than") });
  expect(existsSync(c)).toBe(false);
});

test("dirSize counts only .git/objects/pack", () => {
  const d = tmp(), p = join(d, ".git", "objects", "pack");
  mkdirSync(p, { recursive: true });
  writeFileSync(join(p, "tmp_pack_x"), "x".repeat(100));
  writeFileSync(join(d, "big.bin"), "y".repeat(5000));
  expect(dirSize(d)).toBe(100);
  expect(dirSize(join(d, "none"))).toBe(0);
});

test("ignoreKaizen writes the .kaizen rules once", () => {
  const d = tmp();
  expect(ignoreKaizen(d)).toBe(true);
  expect(readFileSync(join(d, ".gitignore"), "utf8")).toContain(".kaizen/*");
  expect(ignoreKaizen(d)).toBe(false);
  expect(readFileSync(join(d, ".gitignore"), "utf8").match(/\.kaizen\/\*\n/g)!.length).toBe(1);
});
