// `kaizen setup`: the walk after install — a project, the settings, the board, the
// phone. Every step can be skipped, and nothing changes without an answer.
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { addWebHost, home, remember } from "./state.ts";
import { applyPreset, detectPreset } from "./settings.ts";
import { qr } from "./qr.ts";

const PORT = 7420;
const INSTALL = join(import.meta.dir, "install.ts");

export type Ui = {
  select: <T>(q: string, o: { label: string; hint: string; value: T }[]) => Promise<T>;
  ask: (q: string) => string | null;
  c: Record<"dim" | "bold" | "cyan" | "green", (s: string) => string>;
};

// The DNS name `tailscale status --json` reports for this machine, or null when
// Tailscale is not running or not logged in.
export function tailnetName(json: string): string | null {
  try {
    const s = JSON.parse(json);
    const name = String(s?.Self?.DNSName ?? "").replace(/\.$/, "").toLowerCase();
    return s?.BackendState === "Running" && name ? name : null;
  } catch { return null; }
}

// A folder already inside a project (.git or .kaizen on the way up to home).
function inProject(dir: string) {
  for (let d = dir; d !== home; ) {
    if (existsSync(join(d, ".git")) || existsSync(join(d, ".kaizen"))) return true;
    const up = resolve(d, "..");
    if (up === d) return false;
    d = up;
  }
  return false;
}

export function manual() {
  return `
  kaizen setup needs a terminal. By hand:
    kaizen settings                         pick a preset
    kaizen web                              the board
    tailscale serve --bg 127.0.0.1:${PORT}      phone, then add the name it prints to ~/.kaizen/web-hosts
`;
}

export async function setup(ui: Ui) {
  const { c, select } = ui;
  const out = (s = "") => console.log(s);
  const run = (cmd: string[], cwd?: string) => Bun.spawnSync(cmd, { cwd, stdin: "inherit", stdout: "inherit", stderr: "inherit" }).exitCode === 0;

  out(`\n  ${c.bold("kaizen setup")}  ${c.dim("three short steps, each can be skipped")}`);

  // 1 -- project
  if (!inProject(process.cwd())) {
    out(`\n  ${c.bold("1  Project")}  ${c.dim("kaizen keeps its runs in a .kaizen/ folder inside your project")}`);
    for (let tries = 0; tries < 2; tries++) {
      const typed = ui.ask("  Project folder (Enter to skip): ")?.trim();
      if (!typed) break;
      const dir = resolve(typed.replace(/^~(?=$|[\\/])/, home));
      if (dir === home || !existsSync(dir) || !statSync(dir).isDirectory()) { out(`  ${c.dim(`${typed}: not a folder`)}`); continue; }
      const r = Bun.spawnSync([process.execPath, INSTALL, "--yes", "--init-project"], { cwd: dir });
      if (r.exitCode === 0 && existsSync(join(dir, ".kaizen"))) { remember(dir); out(`  ${c.green("+")} set up ${dir}`); }
      else out(`  ${c.dim(`could not set up ${dir}`)}`);
      break;
    }
  }

  // 2 -- settings
  const defaults = readFileSync(join(import.meta.dir, "..", "skills/kaizen/config.default.yml"), "utf8");
  const file = join(home, ".kaizen", "config.yml");
  const current = existsSync(file) ? readFileSync(file, "utf8") : defaults;
  const now = detectPreset(current, defaults);
  const preset = await select(`2  Settings  (now: ${now})`, [
    { label: "Keep", hint: "leave them as they are", value: null },
    { label: "Medium", hint: "balanced — subagents, plan approval, auto-fix high/critical", value: "medium" as const },
    { label: "Low", hint: "inline and manual — lite runner, manual approvals, no auto-fix", value: "low" as const },
    { label: "Ultra", hint: "autonomous — auto mode, auto-fix all findings", value: "ultra" as const },
  ]);
  if (preset) { writeFileSync(file, applyPreset(current, preset, defaults)); out(`  ${c.green("+")} ${preset} preset in ~/.kaizen/config.yml`); }
  out(`  ${c.dim("every setting: kaizen settings, or the gear on the board")}`);

  // 3 -- board
  out(`\n  ${c.bold("3  Board")}`);
  run([process.execPath, INSTALL, "web", "--daemon"]);

  // 4 -- phone
  out(`\n  ${c.bold("4  Phone")}  ${c.dim("the board on your phone, over Tailscale")}`);
  let name: string | null = null;
  try { name = tailnetName(Bun.spawnSync(["tailscale", "status", "--json"]).stdout.toString()); } catch { /* not installed */ }
  if (!name) {
    out(`  Tailscale is not running here. Install it on this PC and your phone (${c.cyan("https://tailscale.com/download")}),`);
    out(`  sign in on both, then run ${c.cyan("kaizen setup")} again.\n`);
    return;
  }
  const yes = await select(`Run tailscale serve so your phone can reach the board?`, [
    { label: "Not now", hint: "nothing changes", value: false },
    { label: "Yes", hint: `tailscale serve --bg 127.0.0.1:${PORT} — private to your tailnet`, value: true },
  ]);
  if (!yes) { out(); return; }
  if (!run(["tailscale", "serve", "--bg", `127.0.0.1:${PORT}`])) { out(`  ${c.dim("tailscale serve failed — see its message above")}\n`); return; }
  addWebHost(name);
  const url = `https://${name}`;
  out(`\n${qr(url)}\n\n  Scan with your phone camera, or open ${c.cyan(url)}`);
  out(`  Then choose Add to Home screen: it opens full screen with the kaizen icon.`);
  out(`  ${c.dim("Anyone on your tailnet who can reach this PC can drive your agents; restrict it with Tailscale ACLs.")}\n`);
}
