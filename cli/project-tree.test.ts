import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("project tree and text preview stay inside a registered project", async () => {
  const home = mkdtempSync(join(tmpdir(), "kaizen-tree-"));
  const project = join(home, "project");
  mkdirSync(join(home, ".kaizen"));
  mkdirSync(join(project, ".kaizen"), { recursive: true });
  mkdirSync(join(project, "src"));
  writeFileSync(join(home, ".kaizen", "projects"), project + "\n");
  writeFileSync(join(project, "src", "good.txt"), "<script>alert(1)</script>\n");
  writeFileSync(join(project, "binary.dat"), Buffer.from([0, 1, 2]));
  writeFileSync(join(project, "big.txt"), "x".repeat(65537));
  writeFileSync(join(project, ".secret"), "hidden");
  symlinkSync(join(home, ".kaizen", "projects"), join(project, "link"));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const repo = join(import.meta.dir, "..");
  const proc = Bun.spawn([process.execPath, join(repo, "cli", "install.ts"), "web", "--port", String(port), "--no-open", "--foreground"], {
    cwd: project, env: { ...process.env, HOME: home, USERPROFILE: home, KAIZEN_HOME: repo }, stdout: "ignore", stderr: "ignore",
  });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { await fetch(base + "/state"); break; } catch { if (i > 100) throw new Error("board did not start"); await Bun.sleep(50); } }
    const get = (route: string, path: string, dir = join(project, ".kaizen")) => fetch(base + route + "?dir=" + encodeURIComponent(dir) + "&path=" + encodeURIComponent(path));
    const root = await (await get("/project-tree", "")).json() as any;
    expect(root.entries.map((e: any) => e.name)).toContain("src");
    expect(root.entries.map((e: any) => e.name)).not.toContain(".secret");
    expect(root.entries.map((e: any) => e.name)).not.toContain("link");
    expect((await (await get("/project-text", "src/good.txt")).json()).content).toBe("<script>alert(1)</script>\n");
    for (const path of ["../.kaizen/projects", "/etc/passwd", "C:/Windows/win.ini", ".secret", "link", "src/../../.secret"]) expect((await get("/project-text", path)).status).toBeGreaterThanOrEqual(400);
    for (const path of ["binary.dat", "big.txt"]) expect((await get("/project-text", path)).status).toBe(415);
    expect((await get("/project-tree", "", join(home, "elsewhere", ".kaizen"))).status).toBe(404);
    const download = await fetch(base + "/project-text?dir=" + encodeURIComponent(join(project, ".kaizen")) + "&path=src%2Fgood.txt&download=1");
    expect(download.headers.get("content-type")).toContain("text/plain");
    expect(download.headers.get("content-disposition")).toContain("attachment");
  } finally { proc.kill(); await proc.exited; rmSync(home, { recursive: true, force: true }); }
});
