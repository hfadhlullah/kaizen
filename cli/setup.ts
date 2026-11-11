// `kaizen setup`: the walk after install — a project, the settings, the board, the
// phone. Enter takes the first choice at every step; nothing changes without an answer.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { addWebHost, home, remember } from "./state.ts";
import { applyPreset, detectPreset } from "./settings.ts";
import { qr } from "./qr.ts";
import { nextSteps } from "./look.ts";

const PORT = 7420;
const TAILSCALE = "https://tailscale.com/download";
const INSTALL = join(import.meta.dir, "install.ts");

export type Ui = {
  select: <T>(q: string, o: { label: string; hint: string; value: T }[]) => Promise<T>;
  ask: (q: string) => string | null;
  c: Record<"dim" | "bold" | "accent" | "green", (s: string) => string>;
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

// What the project step should do from `dir`: nothing when kaizen already owns it,
// offer the git root or the folder itself, or null at home, where it has to ask.
export function projectStep(dir: string, homeDir: string): { ready: true } | { offer: string; git: boolean } | null {
  if (dir === homeDir) return null;
  let git = "";
  for (let d = dir; d !== homeDir; ) {
    if (existsSync(join(d, ".kaizen"))) return { ready: true };
    if (!git && existsSync(join(d, ".git"))) git = d;
    const up = resolve(d, "..");
    if (up === d) break;
    d = up;
  }
  return { offer: git || dir, git: !!git };
}

export function manual() {
  return `
  kaizen setup needs a terminal. By hand:
    kaizen settings                         pick a preset
    kaizen web                              the Kaizen App
    tailscale serve --bg 127.0.0.1:${PORT}      phone, then add the name it prints to ~/.kaizen/web-hosts
`;
}

export async function setup(ui: Ui) {
  const { c, select } = ui;
  const out = (s = "") => console.log(s);
  const run = (cmd: string[], cwd?: string) => Bun.spawnSync(cmd, { cwd, stdin: "inherit", stdout: "inherit", stderr: "inherit" }).exitCode === 0;

  const project = projectStep(process.cwd(), home);
  const needsProject = !(project && "ready" in project);
  const tailnetNow = () => {
    try { return tailnetName(Bun.spawnSync(["tailscale", "status", "--json"], { windowsHide: true }).stdout.toString()); } catch { return null; /* not installed */ }
  };
  let tailnet = tailnetNow();
  const total = 3 + (needsProject ? 1 : 0);
  let n = 0;
  const title = (name: string) => `Step ${++n} of ${total}: ${name}`;

  out(`\n  ${c.bold("kaizen setup")}  ${c.dim("Press Enter to take the first choice. Nothing changes without an answer.")}`);

  const initProject = (dir: string) => {
    const r = Bun.spawnSync([process.execPath, INSTALL, "--yes", "--init-project"], { cwd: dir, windowsHide: true });
    if (r.exitCode === 0 && existsSync(join(dir, ".kaizen"))) { remember(dir); out(`  ${c.green("+")} ${dir} is ready`); }
    else out(`  ${c.dim(`Could not set up ${dir}. Run kaizen setup from inside it to try again.`)}`);
  };

  // Project
  if (project && "offer" in project) {
    const { offer, git } = project;
    const yes = { label: "Yes", hint: "kaizen keeps its work here: a .kaizen folder, a CLAUDE.md line", value: true };
    const no = { label: "Skip", hint: "the first /kaizen run does it", value: false };
    // Yes leads only in a repository: setup may be running in any folder at all.
    if (await select(title(`Set up kaizen in the ${basename(offer)} folder?`), git ? [yes, no] : [no, yes])) initProject(offer);
  } else if (!project) {
    out(`\n  ${c.bold(title("Your project"))}`);
    for (let tries = 0; tries < 2; tries++) {
      const typed = ui.ask("  Folder of a project, or Enter to skip: ")?.trim();
      if (!typed) break;
      const dir = resolve(typed.replace(/^~(?=$|[\\/])/, home));
      if (dir === home || !existsSync(dir) || !statSync(dir).isDirectory()) { out(`  ${c.dim(`${typed} is not a project folder`)}`); continue; }
      initProject(dir);
      break;
    }
  }

  // Settings
  const defaults = readFileSync(join(import.meta.dir, "..", "skills/kaizen/config.default.yml"), "utf8");
  const file = join(home, ".kaizen", "config.yml");
  const current = existsSync(file) ? readFileSync(file, "utf8") : defaults;
  const now = detectPreset(current, defaults);
  const presets = [
    { label: "Medium (recommended)", hint: "you approve the plan; serious findings get fixed for you", value: "medium" as const },
    { label: "Low", hint: "cheapest; you approve every step", value: "low" as const },
    { label: "Ultra", hint: "runs on its own and fixes every finding", value: "ultra" as const },
  ];
  // What is set now leads, so Enter keeps it.
  const options = [
    { label: `Keep ${now}`, hint: "your current settings", value: null },
    ...presets.filter((p) => p.value !== now),
  ];
  const preset = await select(title("How much should kaizen ask you?"), options);
  if (preset) {
    mkdirSync(join(home, ".kaizen"), { recursive: true });
    writeFileSync(file, applyPreset(current, preset, defaults));
    out(`  ${c.green("+")} ${preset} is set`);
  }

  // Kaizen App
  if (await select(title("Open the Kaizen App?"), [
    { label: "Yes", hint: "see your work in the browser, on this computer only", value: true },
    { label: "Later", hint: "run kaizen web", value: false },
  ])) run([process.execPath, INSTALL, "web", "--daemon"]);

  // Phone
  if (await select(title("Use the Kaizen App on your phone?"), [
    { label: "Not now", hint: "nothing changes", value: false },
    { label: "Yes", hint: "private to your own devices, through Tailscale", value: true },
  ])) {
    if (!tailnet) {
      out(`\n  The phone connects through Tailscale, a free private network.`);
      out(`    1  Install it on this computer: ${c.accent(TAILSCALE)}`);
      out(`    2  Install it on your phone too, from the same link`);
      out(`    3  Sign in on both with the same account`);
    }
    while (!tailnet) {
      if (!await select("Tailscale ready on both?", [
        { label: "Check again", hint: "see if Tailscale is running here", value: true },
        { label: "Skip for now", hint: "run kaizen setup when it is ready", value: false },
      ])) break;
      tailnet = tailnetNow();
      if (!tailnet) out(`  ${c.dim("Tailscale is not running on this computer yet.")}`);
      else out(`  ${c.green("+")} Tailscale is running`);
    }
    if (tailnet && run(["tailscale", "serve", "--bg", `127.0.0.1:${PORT}`])) {
      addWebHost(tailnet);
      const url = `https://${tailnet}`;
      out(`\n${qr(url)}\n\n  Scan with your phone camera, or open ${c.accent(url)}`);
      out(`  Then choose Add to Home screen: it opens full screen with the kaizen icon.`);
      out(`  ${c.dim("Anyone on your tailnet who can reach this PC can drive your agents; restrict it with Tailscale ACLs.")}`);
    } else if (tailnet) out(`  ${c.dim("tailscale serve failed; see its message above")}`);
  }

  // Failing to make a shortcut must not spoil a finished setup; web prints what happened.
  // From the install, not this file: under bunx this file is a temp copy that goes away.
  const installed = join(process.env.KAIZEN_HOME ?? join(home, "kaizen"), "cli", "install.ts");
  run([process.execPath, existsSync(installed) ? installed : INSTALL, "web", "--shortcut"]);
  out(nextSteps());
}
