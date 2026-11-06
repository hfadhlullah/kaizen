// The desktop app starts its bundled board with KAIZEN_HOME=<its read-only copy> and
// KAIZEN_DESKTOP_BUNDLED=1 (desktop/src/server.ts). The board keeps both for itself:
// a terminal it opens sees neither, so `kaizen upgrade` there aims at ~/kaizen, not the
// AppImage (EROFS). A KAIZEN_HOME the user set, on a board that is not bundled, is kept.
import { test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "..");

async function terminalEnv(extra: Record<string, string>) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "kz-denv-")));
  const home = join(root, "home"), proj = join(root, "proj"), st = join(proj, ".kaizen"), bin = join(root, "bin"), out = join(root, "env.txt");
  for (const d of [join(home, ".kaizen"), st, bin]) mkdirSync(d, { recursive: true });
  writeFileSync(join(home, ".kaizen", "projects"), proj + "\n");
  writeFileSync(join(st, "inbox.md"), "# Inbox\n");
  // The shell. Asked by the board's login-env probe (-l -i -c …) it answers like a real
  // login shell, its whole environment, which is how the removed variables came back.
  // As a terminal it writes what it inherited, then waits to be killed.
  const sh = join(bin, "fakesh");
  writeFileSync(sh, `#!/bin/sh\nif [ "$3" = "-c" ]; then echo __kaizen_env__; env -0; exit 0; fi\nenv > ${out}.tmp && mv ${out}.tmp ${out}\nwhile read x; do :; done\n`, { mode: 0o755 });
  writeFileSync(join(bin, "gemini"), "#!/bin/sh\n", { mode: 0o755 });
  symlinkSync(Bun.which("git")!, join(bin, "git"));
  const port = 20000 + Math.floor(Math.random() * 20000);
  // Only what each case sets: a suite run from a desktop-app terminal carries both already.
  const { KAIZEN_HOME: _h, KAIZEN_DESKTOP_BUNDLED: _b, ...base } = process.env;
  const proc = Bun.spawn([process.execPath, join(repo, "cli", "install.ts"), "web", "--port", String(port), "--no-open", "--foreground"], {
    cwd: proj, stdout: "ignore", stderr: "ignore",
    env: { ...base, HOME: home, USERPROFILE: home, PATH: `${bin}:/usr/bin:/bin`, SHELL: sh, DISPLAY: "", WAYLAND_DISPLAY: "", TERMINAL: "", TMUX: "", ...extra },
  });
  try {
    const at = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { await fetch(at + "/state"); break; } catch { if (i > 150) throw new Error("board did not start"); await Bun.sleep(50); } }
    const r = await fetch(at + "/shell", { method: "POST", headers: { "content-type": "application/json", origin: at }, body: JSON.stringify({ dir: st }) });
    expect(r.status).toBe(200);
    for (let i = 0; i < 100 && !existsSync(out); i++) await Bun.sleep(50);
    const env = Object.fromEntries(readFileSync(out, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
    const page = (await fetch(at + "/")).status;
    const upgrade = extra.KAIZEN_DESKTOP_BUNDLED ? await fetch(at + "/upgrade", { method: "POST", headers: { origin: at } }) : null;
    return { env, page, upgrade: upgrade && { status: upgrade.status, body: await upgrade.text() } };
  } finally { proc.kill(); }
}

test.skipIf(process.platform === "win32")("G-01 G-02 a bundled desktop board keeps KAIZEN_HOME and its flag from its terminals, and still knows it is bundled", async () => {
  const r = await terminalEnv({ KAIZEN_HOME: repo, KAIZEN_DESKTOP_BUNDLED: "1" });
  expect(r.env.KAIZEN_HOME).toBeUndefined();
  expect(r.env.KAIZEN_DESKTOP_BUNDLED).toBeUndefined();
  expect(r.env.KAIZEN_BOARD_PID).toBeDefined(); // it is the board's terminal
  expect(r.page).toBe(200);
  expect(r.upgrade?.status).toBe(409);
  expect(r.upgrade?.body).toContain("desktop app's copy");
}, 30000);

test.skipIf(process.platform === "win32")("G-03 a KAIZEN_HOME the user set, on a board that is not bundled, reaches its terminals", async () => {
  const r = await terminalEnv({ KAIZEN_HOME: repo });
  expect(r.env.KAIZEN_HOME).toBe(repo);
  expect(r.page).toBe(200);
}, 30000);
