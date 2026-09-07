// Full-screen settings browser for .kaizen/config.yml.
// Arrow keys move and change; every change is written straight to the file.
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

type Setting = { key: string; values: string[]; help: string };

const SETTINGS: Setting[] = [
  { key: "mode", values: ["approve", "auto", "plan-only", "review-only"], help: "Where a run stops" },
  { key: "build.executor", values: ["subagent", "inline", "ask"], help: "Who carries out the approved plan" },
  { key: "approvals.plan", values: ["true", "false"], help: "Stop and show the plan before anything is built" },
  { key: "approvals.review", values: ["true", "false"], help: "Stop after the review, before the run is done" },
  { key: "approvals.each_file", values: ["true", "false"], help: "Confirm every individual edit" },
  { key: "auto_fix.enabled", values: ["true", "false"], help: "Fix findings without asking" },
  { key: "auto_fix.min_severity", values: ["critical", "high", "medium", "low"], help: "How bad a finding must be to be fixed automatically" },
  { key: "auto_fix.max_iterations", values: ["1", "2", "3", "4", "5"], help: "Fix and recheck rounds before escalating" },
  { key: "review.write_memory", values: ["true", "false"], help: "Let the reviewer append lessons to memory.md" },
  { key: "review.memory_max_lines", values: ["50", "100", "200", "400"], help: "Size cap on memory.md, a tax on every run" },
  { key: "track.default", values: ["", "software", "writing", "communication", "operations", "research"], help: "Pin a track, or leave empty to infer per run" },
  { key: "state.keep_runs", values: ["5", "10", "20", "50"], help: "Completed runs kept before the oldest is pruned" },
  { key: "git.auto_commit", values: ["false", "true"], help: "Commit the work when a run finishes" },
  { key: "git.branch_before_implement", values: ["true", "false"], help: "Branch before building when on the default branch" },
];

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  inv: (s: string) => `\x1b[7m${s}\x1b[0m`,
};

export async function settings(repoRoot: string, standalone = true) {
  const file = locate();
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    copyFileSync(join(repoRoot, "skills/kaizen/config.default.yml"), file);
  }

  const { stdin, stdout } = process;
  if (!stdin.isTTY) { console.log(`Settings live in ${file}`); return; }

  let active = 0, saved = "";
  const draw = () => {
    const text = readFileSync(file, "utf8");
    const rows = SETTINGS.map((s) => ({ s, value: read(text, s.key) ?? c.dim("(default)") }));
    const width = Math.max(...SETTINGS.map((s) => s.key.length)) + 4;

    stdout.write("\x1b[H\x1b[2J");           // home, clear
    stdout.write(`\n  ${c.bold("kaizen settings")}   ${c.dim(tilde(file))}\n\n`);
    for (const [i, { s, value }] of rows.entries()) {
      const on = i === active;
      const name = s.key.padEnd(width);
      stdout.write(on
        ? `  ${c.cyan("›")} ${c.bold(name)}${c.inv(` ${value} `)}\n`
        : `    ${c.dim(name)}${value}\n`);
    }
    stdout.write(`\n  ${c.dim(SETTINGS[active]!.help)}\n`);
    stdout.write(`\n  ${c.dim("↑↓ move · ←→ change · backspace back")}   ${saved}\n`);
  };

  stdout.write("\x1b[?1049h\x1b[?25l");      // alternate screen, hide cursor
  stdin.setRawMode(true);
  stdin.resume();
  draw();

  await new Promise<void>((resolve) => {
    const onData = (chunk: Buffer) => {
      const keys = chunk.toString();
      for (let i = 0; i < keys.length; i++) {
        const rest = keys.slice(i);
        // esc, q, backspace, and left-at-the-edge all mean "back to where I came
        // from" -- the settings screen is always something you opened from
        // somewhere else.
        if (rest.startsWith("\x03") || rest.startsWith("q") || rest === "\x1b"
            || rest.startsWith("\x7f") || rest.startsWith("\b")) {
          stdin.off("data", onData); return resolve();
        }
        if (rest.startsWith("\x1b[A")) { active = (active - 1 + SETTINGS.length) % SETTINGS.length; i += 2; }
        else if (rest.startsWith("\x1b[B")) { active = (active + 1) % SETTINGS.length; i += 2; }
        else if (rest.startsWith("\x1b[C") || rest.startsWith("\x1b[D") || rest.startsWith("\r")) {
          const step = rest.startsWith("\x1b[D") ? -1 : 1;
          const s = SETTINGS[active]!;
          const text = readFileSync(file, "utf8");
          const now = read(text, s.key) ?? s.values[0]!;
          const at = s.values.indexOf(now);
          const next = s.values[((at < 0 ? 0 : at) + step + s.values.length) % s.values.length]!;
          writeFileSync(file, write(text, s.key, next));
          saved = c.green(`saved ${s.key} = ${next || '""'}`);
          if (!rest.startsWith("\r")) i += 2;
        } else if (rest.startsWith("k")) active = (active - 1 + SETTINGS.length) % SETTINGS.length;
        else if (rest.startsWith("j")) active = (active + 1) % SETTINGS.length;
        else continue;
        draw();
      }
    };
    stdin.on("data", onData);
  });

  stdin.setRawMode(false);
  stdin.pause();
  stdout.write("\x1b[?25h\x1b[?1049l");      // restore cursor and screen
  // Returning to the dashboard means returning to its alternate screen, where a
  // line printed here would never be seen.
  if (standalone) console.log(`  ${c.green("+")} settings saved to ${tilde(file)}\n`);
}

// The nearest .kaizen wins, exactly as the workflow resolves it.
function locate() {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, ".kaizen"))) return join(dir, ".kaizen", "config.yml");
    if (existsSync(join(dir, ".git"))) break;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return join(homedir(), ".kaizen", "config.yml");
}

// Read and write a dotted key by walking indentation, so the comment above every
// key survives. Parsing to an object and dumping it back would delete all of them.
function lineOf(text: string, key: string) {
  const parts = key.split(".");
  const lines = text.split("\n");
  let depth = 0, from = 0;
  for (const [pi, part] of parts.entries()) {
    const want = new RegExp(`^ {${depth}}${part}:`);
    let found = -1;
    for (let i = from; i < lines.length; i++) {
      if (want.test(lines[i]!)) { found = i; break; }
      if (pi > 0 && /^\S/.test(lines[i]!) && i > from) break;   // left the parent block
    }
    if (found < 0) return { lines, index: -1, indent: depth };
    from = found + 1; depth += 2;
  }
  return { lines, index: from - 1, indent: depth - 2 };
}

function read(text: string, key: string) {
  const { lines, index } = lineOf(text, key);
  if (index < 0) return null;
  const v = lines[index]!.split(":").slice(1).join(":").split("#")[0]!.trim();
  return v.replace(/^["']|["']$/g, "");
}

function write(text: string, key: string, value: string) {
  const { lines, index, indent } = lineOf(text, key);
  if (index < 0) return text;
  const name = key.split(".").pop()!;
  const shown = value === "" ? '""' : value;
  lines[index] = `${" ".repeat(indent)}${name}: ${shown}`;
  return lines.join("\n");
}

function tilde(p: string) {
  const h = homedir();
  return p.startsWith(h) ? "~" + p.slice(h.length) : p;
}
