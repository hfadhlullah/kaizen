// Full-screen settings browser for .kaizen/config.yml.
// Arrow keys move and change; every change is written straight to the file.
import { existsSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { readText } from "./state.ts";

// `text` is a value typed rather than chosen: a path. It has no values to cycle.
type Setting = { key: string; label: string; group: string; values: string[]; help: string; text?: boolean; folder?: boolean };

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
  { key: "preset", label: "Preset", group: "Preset", values: ["low", "medium", "ultra", "custom"], help: "Sets every row below at once. low: you do it here, step by step. medium: balanced. ultra: hands-off. Change any row and it becomes custom" },
  { key: "mode", label: "Stop for approval", group: "Approvals", values: ["approve", "auto", "plan-only", "review-only"], help: "approve: pause and ask you at each enabled checkpoint. auto: never pause. plan-only: write the plan and stop. review-only: just audit existing work" },
  { key: "approvals.plan", label: "Approve the plan first", group: "Approvals", values: ["true", "false"], help: "Show the plan and wait for your OK before anything is built" },
  { key: "approvals.review", label: "Approve after review", group: "Approvals", values: ["true", "false"], help: "After the review, wait for your OK before the run is called done" },
  { key: "approvals.each_file", label: "Confirm every file edit", group: "Approvals", values: ["true", "false"], help: "Ask before each individual file change. Maximum control, slowest" },
  { key: "runner", label: "Stage isolation", group: "Agents", values: ["full", "lite"], help: "full: each stage is a fresh agent, so the reviewer never saw the work (costs more). lite: this one session does every stage, cheaper, reviewer may miss its own mistakes" },
  { key: "build.executor", label: "Who builds", group: "Agents", values: ["subagent", "inline", "ask"], help: "subagent: a separate agent builds and reports back. inline: this session builds while you watch. ask: choose at the plan approval" },
  { key: "agent.default", label: "Tool the board launches", group: "Agents", values: ["auto", "claude", "codex", "agy", "opencode", "gemini"], help: "Coding tool opened when you start a run from the board. auto: Claude Code if installed, else the first one found" },
  { key: "subagents.model", label: "Model for stage agents", group: "Agents", values: ["inherit", "opus", "sonnet", "haiku"], help: "Which Claude model the planner, builder and reviewer run on. inherit: same as your main session. Claude Code only" },
  { key: "subagents.effort", label: "Effort for stage agents", group: "Agents", values: ["inherit", "low", "medium", "high"], help: "How hard the stage agents think. low is faster and cheaper; high finds more. Claude Code only" },
  { key: "auto_fix.enabled", label: "Fix findings automatically", group: "Auto-fix", values: ["true", "false"], help: "true: findings severe enough get fixed and re-reviewed without asking. false: every finding stops and asks you" },
  { key: "auto_fix.min_severity", label: "Auto-fix from severity", group: "Auto-fix", values: ["critical", "high", "medium", "low"], help: "The least severe finding still fixed automatically. low fixes everything; critical fixes almost nothing" },
  { key: "auto_fix.max_iterations", label: "Max fix rounds", group: "Auto-fix", values: ["1", "2", "3", "4", "5"], help: "Fix-then-recheck rounds before leftovers are handed to you. Each round is a full build plus a full review, the priciest knob here" },
  { key: "git.auto_commit", label: "Commit when done", group: "Git", values: ["false", "true"], help: "Commit the work when a run finishes. Never pushes" },
  { key: "git.branch_before_implement", label: "Branch before building", group: "Git", values: ["true", "false"], help: "Create a branch before building when you are on the default branch" },
  { key: "track.default", label: "Kind of work", group: "Project", values: ["auto", "software", "writing", "communication", "operations", "research"], help: "Pin what runs in this project are (a docs repo is always writing). auto: the planner infers it per run" },
  { key: "review.write_memory", label: "Remember lessons", group: "Project", values: ["true", "false"], help: "Let the reviewer save what it learned to .kaizen/memory.md, which every future run reads" },
  { key: "review.memory_max_lines", label: "Memory size cap", group: "Project", values: ["50", "100", "200", "400"], help: "Lines memory.md may hold before old lessons are pruned. Every run reads it, so bigger costs more" },
  { key: "state.keep_runs", label: "Runs to keep", group: "Project", values: ["5", "10", "20", "50"], help: "Finished runs kept before the oldest is pruned. Open backlog items are rescued first" },
  { key: "dictation.model", label: "Dictation model", group: "Board", values: ["tiny", "base", "small", "large-v3-turbo"], help: "Whisper model the web board dictates with, in the browser. tiny ~60 MB rough; base ~165 MB English-leaning; small ~410 MB accurate across languages; large-v3-turbo ~1.5 GB best, needs a capable GPU. Downloaded once on the next mic press" },
  { key: "sources.every", label: "Gather requests", group: "Board", values: ["off", "1h", "6h", "24h"], help: "How often the board checks your request sources for new ideas while it is running. off: only when you press Gather now" },
  { key: "board.projects_dir", label: "Projects folder", group: "Board", values: [], text: true, folder: true, help: `A folder your projects live in, e.g. ${process.platform === "win32" ? join(homedir(), "Projects") : "~/Projects"}. Every folder inside it appears in the board's project list, ready to choose; choosing one sets it up. Empty: only projects kaizen already knows` },
  { key: "ui.mouse", label: "Enable mouse", group: "Terminal", values: ["false", "true"], help: "Click to select, click again to act. While on, the terminal cannot select text with the mouse" },
];

// The same rows and the same write the TUI uses, for `kaizen web`'s settings panel:
// one place decides what a setting is called, what it may be, and how it is saved.
export function listSettings(repoRoot: string) {
  const file = locate();
  const defaults = readText(join(repoRoot, "skills/kaizen/config.default.yml"));
  const load = (f: string) => existsSync(f) ? readText(f) : "";
  const text = load(file), board = load(globalFile());
  const preset = detectPreset(text, defaults);
  return {
    file: tilde(file),
    rows: SETTINGS.map((s) => ({
      ...s,
      value: s.key === "preset" ? preset : (read(s.group === "Board" ? board : text, s.key) || read(defaults, s.key)) ?? s.values[0] ?? "",
    })),
  };
}

export function setSetting(repoRoot: string, key: string, value: string) {
  const s = SETTINGS.find((x) => x.key === key);
  if (!s || !(s.text || s.values.includes(value))) return { error: "unknown setting or value" };
  const file = fileFor(s);
  const defaultsPath = join(repoRoot, "skills/kaizen/config.default.yml");
  if (!existsSync(file)) { mkdirSync(dirname(file), { recursive: true }); copyFileSync(defaultsPath, file); }
  const defaults = readText(defaultsPath);
  const text = readText(file);
  let updated: string;
  if (key === "preset") {
    if (value === "custom") return { error: "custom is what any other change makes" };
    updated = applyPreset(text, value as PresetName, defaults);
  } else {
    updated = write(text, key, value, defaults);
    updated = write(updated, "preset", detectPreset(updated, defaults), defaults);
    if (read(updated, key) !== value) return { error: `${key} did not save; edit ${tilde(file)} by hand` };
  }
  writeFileSync(file, updated);
  return { ok: true };
}

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

  const defaults = readText(join(repoRoot, "skills/kaizen/config.default.yml"));
  let active = 0, saved = "";
  // `/` filters the rows by name, help, key, group or option; moving only visits matches.
  let query = "", typing = false;
  const shown = () => SETTINGS.flatMap((s, i) =>
    `${s.label} ${s.help} ${s.key} ${s.group} ${s.values.join(" ")}`.toLowerCase().includes(query.toLowerCase()) ? [i] : []);
  const move = (step: number) => {
    const list = shown();
    if (!list.length) return;
    const at = list.indexOf(active);
    active = at < 0 ? list[0]! : list[(at + step + list.length) % list.length]!;
  };
  // Screen line -> setting index, rebuilt on every draw; the mouse clicks by line.
  let rowAt: number[] = [];
  const draw = () => {
    const text = readText(file);
    const currentPreset = detectPreset(text, defaults);
    // Booleans as a checkbox, numeric scales as a level bar; the file still holds the words.
    const show = (s: Setting, v: string) => {
      if (s.values.length === 2 && s.values.includes("true")) return v === "true" ? "[✓] on" : "[ ] off";
      if (s.values.every((x) => /^\d+$/.test(x))) {
        const at = s.values.indexOf(v);
        return at < 0 ? v : "▮".repeat(at + 1) + "▯".repeat(s.values.length - at - 1) + " " + v;
      }
      return v;
    };
    const rows = SETTINGS.map((s) => ({
      s,
      // Older configs spell "infer the track" as an empty string; show what it means.
      // The preset as a game's quick preset: arrows either side, the tier lit after it. No colour codes: the selected row wraps this in inverse, which a reset would end.
      value: s.key === "preset"
        ? `◁ ${currentPreset.padEnd(6)} ▷ ${(["low", "medium", "ultra"] as const).map((p) => p === currentPreset ? "━" : "─").join("")}`
        : show(s, (read(fileFor(s) === file ? text : readText(fileFor(s)), s.key) || (s.key === "track.default" ? "auto" : undefined)) ?? c.dim("(default)")),
    }));
    const width = Math.max(...SETTINGS.map((s) => s.label.length)) + 4;

    stdout.write("\x1b[H\x1b[2J");           // home, clear
    // On the title line, so the screen-line -> row map below is unchanged.
    const search = typing || query ? `   / ${query}${typing ? "▏" : ""}` : "";
    stdout.write(`\n  ${c.bold("kaizen settings")}   ${c.dim(tilde(file))}${c.cyan(search)}\n`);
    rowAt = [];
    let line = 2, group = "";
    const list = shown();
    for (const [i, { s, value }] of rows.entries()) {
      if (!list.includes(i)) continue;
      if (s.group !== group) {
        group = s.group;
        stdout.write(`\n  ${c.dim(group.toUpperCase())}\n`);
        line += 2;
      }
      const on = i === active;
      const name = s.label.padEnd(width);
      stdout.write(on
        ? `  ${c.cyan("›")} ${c.bold(name)}${c.inv(` ${value} `)}\n`
        : `    ${c.dim(name)}${value}\n`);
      rowAt[line++] = i;
    }
    const cur = SETTINGS[active]!;
    if (!list.length) stdout.write(`\n  ${c.dim(`no setting matches "${query}"`)}\n\n`);
    else {
      stdout.write(`\n  ${c.dim(cur.key)}  ${c.dim("options:")} ${cur.values.map((v) => v || '""').join(c.dim(" / "))}\n`);
      stdout.write(`  ${cur.help}\n`);
    }
    stdout.write(`\n  ${c.dim(typing
      ? "type to filter · enter or ↑↓ keep it · esc clear"
      : `↑↓ pick a setting · ←→ or enter to change it (saved instantly) · / search · esc ${query ? "clear search" : "back"}`)}   ${saved}\n`);
  };

  stdout.write("\x1b[?1049h\x1b[?25l");      // alternate screen, hide cursor
  const mouse = /^\s*ui:\s*\n(?:\s*#.*\n)*\s*mouse:\s*(\S+)/m.exec(readText(file));
  const mouseOn = mouse?.[1] === "true";
  if (mouseOn) { stdout.write("\x1b[?1000h\x1b[?1006h"); mouseArmed = true; }
  stdin.setRawMode(true);
  stdin.resume();
  draw();

  function cycle(step: number) {
    if (!shown().includes(active)) return;
    const s = SETTINGS[active]!;
    const wasMouse = s.key === "ui.mouse";
    const f = fileFor(s);
    if (s.text) { saved = c.dim(`type ${s.key} in the board's settings, or in ${tilde(f)}`); return; }
    if (!existsSync(f)) { mkdirSync(dirname(f), { recursive: true }); copyFileSync(join(repoRoot, "skills/kaizen/config.default.yml"), f); }
    const text = readText(f);
    if (s.key === "preset") {
      const current = detectPreset(text, defaults);
      const presets: PresetName[] = ["low", "medium", "ultra"];
      const at = presets.indexOf(current as PresetName);
      const next = presets[((at < 0 ? 0 : at) + step + presets.length) % presets.length]!;
      const updated = applyPreset(text, next, defaults);
      writeFileSync(f, updated);
      saved = c.green(`applied preset: ${next}`);
    } else {
      const now = read(text, s.key) ?? s.values[0]!;
      const at = s.values.indexOf(now);
      const next = s.values[((at < 0 ? 0 : at) + step + s.values.length) % s.values.length]!;
      let updated = write(text, s.key, next, defaults);
      const detected = detectPreset(updated, defaults);
      updated = write(updated, "preset", detected, defaults);
      writeFileSync(f, updated);
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
        const m = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(rest);
        if (m) {
          i += m[0].length - 1;
          const button = +m[1]!, y = +m[3]!, press = m[4] === "M";
          if (button === 64) move(-1);
          else if (button === 65) move(1);
          else if (press && button === 0) {
            const row = rowAt[y - 1];
            if (row === undefined) continue;
            // Click to select; click the selected row to cycle it, which is what
            // the right arrow already does.
            if (row === active) { cycle(1); continue; }
            active = row;
          } else continue;
          draw();
          continue;
        }
        // While searching, keys type into the query: esc drops it, enter or an
        // arrow keeps it and goes back to picking.
        if (typing) {
          if (rest === "\x1b") { query = ""; typing = false; }
          else if (rest.startsWith("\r")) typing = false;
          else if (rest.startsWith("\x1b[A") || rest.startsWith("\x1b[B")) { typing = false; move(rest[2] === "A" ? -1 : 1); i += 2; }
          else if (rest.startsWith("\x1b[")) { i += 2; continue; }
          else if (rest.startsWith("\x7f") || rest.startsWith("\b")) query = query.slice(0, -1);
          else if (rest.startsWith("\x03")) { stdin.off("data", onData); return resolve(); }
          else if (rest[0]! >= " ") query += rest[0];
          else continue;
          if (!shown().includes(active)) move(0);
          draw();
          continue;
        }
        if (rest.startsWith("/")) { query = ""; typing = true; draw(); continue; }
        if (rest === "\x1b" && query) { query = ""; draw(); continue; }
        // esc, q, backspace, and left-at-the-edge all mean "back to where I came
        // from" -- the settings screen is always something you opened from
        // somewhere else.
        if (rest.startsWith("\x03") || rest.startsWith("q") || rest === "\x1b"
            || rest.startsWith("\x7f") || rest.startsWith("\b")) {
          stdin.off("data", onData); return resolve();
        }
        if (rest.startsWith("\x1b[A")) { move(-1); i += 2; }
        else if (rest.startsWith("\x1b[B")) { move(1); i += 2; }
        else if (rest.startsWith("\x1b[C") || rest.startsWith("\x1b[D") || rest.startsWith("\r")) {
          cycle(rest.startsWith("\x1b[D") ? -1 : 1);
          if (!rest.startsWith("\r")) i += 2;
        } else if (rest.startsWith("k")) move(-1);
        else if (rest.startsWith("j")) move(1);
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

// The nearest .kaizen/config.yml wins, exactly as the workflow resolves it. A
// project that has not written one of its own is edited globally, so one setting
// changed in ~/.kaizen/config.yml reaches every project.
function locate() {
  let dir = process.cwd();
  for (;;) {
    const conf = join(dir, ".kaizen", "config.yml");
    if (existsSync(conf)) return conf;
    if (existsSync(join(dir, ".git"))) break;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return globalFile();
}

function globalFile() {
  return join(homedir(), ".kaizen", "config.yml");
}

// Board settings describe this machine's board (its projects folder, dictation,
// how often it gathers), not a project. They always live in the global config:
// a project's own config.yml, often committed to its repo, would otherwise hide
// them the moment the board moves into that project.
function fileFor(s: Setting) {
  return s.group === "Board" ? globalFile() : locate();
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
