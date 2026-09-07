// Full-screen settings browser for .kaizen/config.yml.
// Arrow keys move and change; every change is written straight to the file.
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

type Setting = { key: string; values: string[]; help: string };

export type PresetName = "low" | "medium" | "ultra";

export const PRESETS: Record<PresetName, {
  label: string;
  hint: string;
  settings: Record<string, string>;
}> = {
  low: {
    label: "Low",
    hint: "inline & manual — lite runner, inline builder, manual approvals, no auto-fix",
    settings: {
      mode: "approve",
      runner: "lite",
      "build.executor": "inline",
      "approvals.plan": "true",
      "approvals.review": "true",
      "approvals.each_file": "false",
      "auto_fix.enabled": "false",
      "auto_fix.min_severity": "high",
      "auto_fix.max_iterations": "1",
      "git.auto_commit": "false",
      "git.branch_before_implement": "false",
    },
  },
  medium: {
    label: "Medium",
    hint: "balanced (recommended) — full runner, subagents, plan approval, auto-fix high/critical",
    settings: {
      mode: "approve",
      runner: "full",
      "build.executor": "subagent",
      "approvals.plan": "true",
      "approvals.review": "false",
      "approvals.each_file": "false",
      "auto_fix.enabled": "true",
      "auto_fix.min_severity": "high",
      "auto_fix.max_iterations": "2",
      "git.auto_commit": "false",
      "git.branch_before_implement": "true",
    },
  },
  ultra: {
    label: "Ultra",
    hint: "autonomous — full runner, subagents, auto mode, auto-fix all findings (up to 4 rounds)",
    settings: {
      mode: "auto",
      runner: "full",
      "build.executor": "subagent",
      "approvals.plan": "false",
      "approvals.review": "false",
      "approvals.each_file": "false",
      "auto_fix.enabled": "true",
      "auto_fix.min_severity": "low",
      "auto_fix.max_iterations": "4",
      "git.auto_commit": "true",
      "git.branch_before_implement": "true",
    },
  },
};

export function detectPreset(text: string, defaults?: string): PresetName | "custom" {
  for (const name of ["low", "medium", "ultra"] as const) {
    const p = PRESETS[name];
    let match = true;
    for (const [k, expected] of Object.entries(p.settings)) {
      const actual = read(text, k) ?? (defaults ? read(defaults, k) : null);
      if (actual !== expected) {
        match = false;
        break;
      }
    }
    if (match) return name;
  }
  return "custom";
}

export function applyPreset(text: string, preset: PresetName, defaults: string): string {
  let updated = text;
  const p = PRESETS[preset];
  for (const [k, v] of Object.entries(p.settings)) {
    updated = write(updated, k, v, defaults);
  }
  updated = write(updated, "preset", preset, defaults);
  return updated;
}

const SETTINGS: Setting[] = [
  { key: "preset", values: ["low", "medium", "ultra", "custom"], help: "Quick preset — low: inline & manual, medium: balanced, ultra: autonomous subagents" },
  { key: "mode", values: ["approve", "auto", "plan-only", "review-only"], help: "Where a run stops" },
  { key: "runner", values: ["full", "lite"], help: "full: every stage its own cold agent. lite: this session runs them all, cheaper, reviewer has seen the work" },
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
  { key: "ui.mouse", values: ["false", "true"], help: "Click to select, click again to act. While on, the terminal cannot select text with the mouse" },
  { key: "agent.default", values: ["auto", "claude", "codex", "agy", "opencode", "gemini"], help: "Default coding agent to launch from dashboard backlog" },
];

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  inv: (s: string) => `\x1b[7m${s}\x1b[0m`,
};

// Registered once at module scope, not per call: opening settings, going back and
// opening it again would otherwise stack a listener each time, and Node starts
// printing warnings into the alternate screen at eleven.
let mouseArmed = false;
process.on("exit", () => { if (mouseArmed) process.stdout.write("\x1b[?1006l\x1b[?1000l"); });

export async function settings(repoRoot: string, standalone = true) {
  const file = locate();
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    copyFileSync(join(repoRoot, "skills/kaizen/config.default.yml"), file);
  }

  const { stdin, stdout } = process;
  if (!stdin.isTTY) { console.log(`Settings live in ${file}`); return; }

  const defaults = readFileSync(join(repoRoot, "skills/kaizen/config.default.yml"), "utf8");
  let active = 0, saved = "";
  const draw = () => {
    const text = readFileSync(file, "utf8");
    const currentPreset = detectPreset(text, defaults);
    const rows = SETTINGS.map((s) => ({
      s,
      value: s.key === "preset" ? currentPreset : (read(text, s.key) ?? c.dim("(default)")),
    }));
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
  const mouse = /^\s*ui:\s*\n(?:\s*#.*\n)*\s*mouse:\s*(\S+)/m.exec(readFileSync(file, "utf8"));
  const mouseOn = mouse?.[1] === "true";
  if (mouseOn) { stdout.write("\x1b[?1000h\x1b[?1006h"); mouseArmed = true; }
  stdin.setRawMode(true);
  stdin.resume();
  draw();

  function cycle(step: number) {
    const s = SETTINGS[active]!;
    const wasMouse = s.key === "ui.mouse";
    const text = readFileSync(file, "utf8");
    if (s.key === "preset") {
      const current = detectPreset(text, defaults);
      const presets: PresetName[] = ["low", "medium", "ultra"];
      const at = presets.indexOf(current as PresetName);
      const next = presets[((at < 0 ? 0 : at) + step + presets.length) % presets.length]!;
      const updated = applyPreset(text, next, defaults);
      writeFileSync(file, updated);
      saved = c.green(`applied preset: ${next}`);
    } else {
      const now = read(text, s.key) ?? s.values[0]!;
      const at = s.values.indexOf(now);
      const next = s.values[((at < 0 ? 0 : at) + step + s.values.length) % s.values.length]!;
      let updated = write(text, s.key, next, defaults);
      const detected = detectPreset(updated, defaults);
      updated = write(updated, "preset", detected, defaults);
      writeFileSync(file, updated);
      // Only claim a save that happened. Reporting one that did not is worse
      // than failing loudly: the setting reads back unchanged and nobody knows why.
      saved = read(updated, s.key) === next
        ? c.green(`saved ${s.key} = ${next || '""'} (preset: ${detected})`)
        : `\x1b[33mcould not write ${s.key}\x1b[0m`;
      // Applied here rather than at the next launch: a toggle that needs a restart
      // reads as a toggle that does not work.
      if (wasMouse) {
        if (next === "true" && !mouseArmed) { stdout.write("\x1b[?1000h\x1b[?1006h"); mouseArmed = true; }
        if (next === "false" && mouseArmed) { stdout.write("\x1b[?1006l\x1b[?1000l"); mouseArmed = false; }
      }
    }
  }

  await new Promise<void>((resolve) => {
    const onData = (chunk: Buffer) => {
      const keys = chunk.toString();
      for (let i = 0; i < keys.length; i++) {
        const rest = keys.slice(i);
        // Rows begin on the fourth line: blank, title, blank, then the settings.
        const m = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(rest);
        if (m) {
          i += m[0].length - 1;
          const button = +m[1]!, y = +m[3]!, press = m[4] === "M";
          if (button === 64) active = (active - 1 + SETTINGS.length) % SETTINGS.length;
          else if (button === 65) active = (active + 1) % SETTINGS.length;
          else if (press && button === 0) {
            const row = y - 4;
            if (row < 0 || row >= SETTINGS.length) continue;
            // Click to select; click the selected row to cycle it, which is what
            // the right arrow already does.
            if (row === active) { cycle(1); continue; }
            active = row;
          } else continue;
          draw();
          continue;
        }
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
          cycle(rest.startsWith("\x1b[D") ? -1 : 1);
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
  if (mouseArmed) { stdout.write("\x1b[?1006l\x1b[?1000l"); mouseArmed = false; }
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

function write(text: string, key: string, value: string, defaults: string) {
  const name = key.split(".").pop()!;
  const shown = value === "" ? '""' : value;
  const { lines, index, indent } = lineOf(text, key);

  if (index >= 0) {
    lines[index] = `${" ".repeat(indent)}${name}: ${shown}`;
    return lines.join("\n");
  }

  // A config written before this key existed does not have a line to change. Take
  // the key from the defaults, comment and all, rather than silently doing nothing
  // and reporting a save: an older config is the normal case for anyone who has had
  // kaizen installed for a while.
  return insert(text, key, shown, defaults);
}

function insert(text: string, key: string, shown: string, defaults: string) {
  const parts = key.split(".");
  const name = parts[parts.length - 1]!;
  const indent = (parts.length - 1) * 2;
  const src = defaults.split("\n");
  const { index: at } = lineOf(defaults, key);

  // The comment block above the key in the defaults explains it; carry it across.
  const block: string[] = [];
  if (at >= 0) {
    let i = at - 1;
    while (i >= 0 && /^\s*#/.test(src[i]!)) { block.unshift(src[i]!); i--; }
  }
  block.push(`${" ".repeat(indent)}${name}: ${shown}`);

  const lines = text.split("\n");
  if (parts.length === 1) {
    while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
    return [...lines, "", ...block, ""].join("\n");
  }

  // Nested: put it under its parent if the parent is there, else write the parent too.
  const parent = parts.slice(0, -1).join(".");
  const { index: pi } = lineOf(text, parent);
  if (pi < 0) {
    while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
    return [...lines, "", `${parts[0]}:`, ...block, ""].join("\n");
  }
  let end = pi + 1;
  while (end < lines.length && (/^\s+\S/.test(lines[end]!) || !lines[end]!.trim())) end++;
  lines.splice(end, 0, ...block);
  return lines.join("\n");
}

function tilde(p: string) {
  const h = homedir();
  return p.startsWith(h) ? "~" + p.slice(h.length) : p;
}
