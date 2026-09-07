// What `kaizen` shows once it is installed: the state of this project's runs, and
// the few things you would have opened a terminal to do.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";

const home = homedir();
const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  amber: (s: string) => `\x1b[33m${s}\x1b[0m`,
};

type Run = { id: string; stage: string; awaiting: string | null };

export async function dashboard(repo: string, agents: string[], run: (a: string) => Promise<void>) {
  const { stdin, stdout } = process;
  const state = locate();

  const actions = () => [
    { key: "settings", label: "Settings", hint: "modes, approvals, who builds" },
    ...(state && !existsSync(join(state, "config.yml"))
      ? [{ key: "init", label: "Set up this project", hint: "write .kaizen/ here" }] : []),
    ...(!state ? [{ key: "init", label: "Set up this project", hint: "write .kaizen/ here" }] : []),
    { key: "upgrade", label: "Upgrade", hint: "pull, relink, clear the installer cache" },
    { key: "quit", label: "Quit", hint: "" },
  ];

  let active = 0;
  const draw = () => {
    const acts = actions();
    const runs = state ? readRuns(state) : [];
    const waiting = runs.filter((r) => r.awaiting && r.stage !== "abandoned");
    const flight = runs.filter((r) => !r.awaiting && !["done", "abandoned"].includes(r.stage));
    const done = runs.filter((r) => r.stage === "done");

    stdout.write("\x1b[H\x1b[2J");
    stdout.write(`\n  ${c.bold("kaizen")} ${c.dim(version(repo))}   ${c.dim(state ? tilde(dirname(state)) : "no project here")}\n`);

    if (state) {
      stdout.write(`\n  ${c.bold("Runs")}\n`);
      if (!runs.length) stdout.write(`    ${c.dim("none yet")}\n`);
      for (const r of waiting) stdout.write(`    ${c.amber("●")} ${r.id}  ${c.dim("waiting on you — " + r.awaiting)}\n`);
      for (const r of flight) stdout.write(`    ${c.cyan("●")} ${r.id}  ${c.dim("in flight — " + r.stage)}\n`);
      if (done.length) stdout.write(`    ${c.dim(`● ${done.length} done`)}\n`);
      const open = backlog(state);
      if (open) stdout.write(`\n  ${c.bold("Backlog")}   ${open} open\n`);
    } else {
      stdout.write(`\n  ${c.dim("This folder has no .kaizen/. Set it up, or just ask your agent for something —")}\n`);
      stdout.write(`  ${c.dim("the first run creates it.")}\n`);
    }

    stdout.write(`\n  ${c.bold("Installed for")}   ${agents.join(", ")}\n\n`);
    for (const [i, a] of acts.entries()) {
      const on = i === active;
      stdout.write(on
        ? `  ${c.cyan("›")} ${c.bold(a.label.padEnd(20))}${c.dim(a.hint)}\n`
        : `    ${c.dim(a.label)}\n`);
    }
    stdout.write(`\n  ${c.dim("↑↓ move · enter choose · q quit")}\n`);
  };

  stdout.write("\x1b[?1049h\x1b[?25l");
  stdin.setRawMode(true);
  stdin.resume();
  draw();

  let chosen = "quit";
  await new Promise<void>((resolve) => {
    const onData = (chunk: Buffer) => {
      const acts = actions();
      const keys = chunk.toString();
      for (let i = 0; i < keys.length; i++) {
        const rest = keys.slice(i);
        if (rest.startsWith("\x03") || rest.startsWith("q") || rest === "\x1b") {
          stdin.off("data", onData); return resolve();
        }
        if (rest.startsWith("\r") || rest.startsWith("\n")) {
          chosen = acts[active]!.key;
          stdin.off("data", onData); return resolve();
        }
        if (rest.startsWith("\x1b[A")) { active = (active - 1 + acts.length) % acts.length; i += 2; }
        else if (rest.startsWith("\x1b[B")) { active = (active + 1) % acts.length; i += 2; }
        else if (rest.startsWith("k")) active = (active - 1 + acts.length) % acts.length;
        else if (rest.startsWith("j")) active = (active + 1) % acts.length;
        else continue;
        draw();
      }
    };
    stdin.on("data", onData);
  });

  stdin.setRawMode(false);
  stdin.pause();
  stdout.write("\x1b[?25h\x1b[?1049l");
  if (chosen !== "quit") await run(chosen);
}

function locate() {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, ".kaizen"))) return join(dir, ".kaizen");
    if (existsSync(join(dir, ".git"))) return null;
    const up = dirname(dir);
    if (up === dir) return existsSync(join(home, ".kaizen")) ? join(home, ".kaizen") : null;
    dir = up;
  }
}

function readRuns(state: string): Run[] {
  const dir = join(state, "runs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((id) => {
    try {
      const s = JSON.parse(readFileSync(join(dir, id, "state.json"), "utf8"));
      return [{ id, stage: s.stage ?? "?", awaiting: s.awaiting ?? null }];
    } catch { return []; }
  }).reverse();
}

// Open items are the ones worth a number; done and rejected stay as record.
function backlog(state: string) {
  const files = [join(state, "backlog.md")];
  const runs = join(state, "runs");
  if (existsSync(runs)) for (const id of readdirSync(runs)) files.push(join(runs, id, "06-backlog.md"));
  let n = 0;
  for (const f of files) {
    if (!existsSync(f)) continue;
    n += (readFileSync(f, "utf8").match(/^\s*-\s*open:/gm) ?? []).length;
  }
  return n;
}

function version(repo: string) {
  try { return JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).version; } catch { return ""; }
}
function tilde(p: string) { return p.startsWith(home) ? "~" + p.slice(home.length) : p; }
