// What `kaizen` shows once it is installed: the state of this project's runs, and
// the few things you would have opened a terminal to do.
import { existsSync, readFileSync, readdirSync, appendFileSync, writeFileSync, mkdirSync, statSync, watch } from "node:fs";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";

const home = homedir();
const rgb = (r: number, g: number, b: number, s: string) =>
  `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`;

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  amber: (s: string) => `\x1b[33m${s}\x1b[0m`,
  // Red is spent on one thing only: a run that cannot move until the user acts.
  red: (s: string) => rgb(232, 80, 80, s),
};

type Run = { id: string; stage: string; awaiting: string | null; moved: number };

// The mascot, rendered from assets/kaizen.jpg. Braille packs 2x4 dots into one
// character, which is the only way outline art survives a downsample this far.
const TANUKI = [
  "⠀⠀⠀⣰⠖⠾⣟⣛⠋⢉⣩⠽⢛⡽⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⢰⢻⠀⠀⢀⡬⠟⠉⢀⠴⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⢠⠇⣾⡠⠞⢩⠤⢄⡚⣁⣀⣀⣀⢀⣠⠤⡄⠀⠀⠀⠀⠀⠀",
  "⢠⣏⠔⣫⣀⡤⢸⠀⠀⠉⠁⠀⠀⠈⠉⠀⠀⡇⠀⠀⠀⠀⠀⠀",
  "⢾⠥⢾⡅⢧⠀⢸⠃⡤⠖⠢⡀⢀⠔⠲⢤⠘⡇⠀⠀⣀⣀⠀⠀",
  "⠀⠀⠈⣇⠈⢠⣫⠞⠀⠘⢱⢣⡜⡎⠃⠀⠳⣝⡄⢠⠇⢻⢉⣷",
  "⠀⠀⠀⠘⢆⠀⠑⢦⣀⡀⠈⠓⠚⠁⢀⣀⣤⣊⣠⢾⡀⢠⣿⠃",
  "⠀⠀⠀⠀⠈⠓⢄⠀⠀⠉⣉⣭⣭⣉⠉⠀⠈⢀⣠⢔⡩⠥⢥⡀",
  "⠀⠀⠀⠀⠀⠀⢠⡇⠀⡞⠁⠀⠀⠈⢳⠀⢰⣍⣠⠚⠧⡀⠀⡷",
  "⠀⠀⠀⠀⠀⠀⠸⡇⠀⣇⠀⠀⠀⠀⣸⠀⢠⡏⠀⠀⢀⣳⠞⠁",
  "⠀⠀⠀⠀⠀⠀⠀⠳⣀⣨⠥⠤⠶⠾⣅⣀⠞⠉⠉⠉⠉⠀⠀⠀",
];

// Compact block wordmark (28 columns x 3 rows).
const WORDMARK = [
  "█ █  ▄▀█  █  ▀▀█  █▀▀  █▄ █",
  "█▀▄  █▀█  █   ▄▀  ██▄  █ ▀█",
  "█ █  █ █  █  █▄▄  █▄▄  █  █",
];

const KNOWN_AGENTS = [
  { name: "Claude Code", dir: ".claude", cmd: "claude" },
  { name: "Antigravity", dir: ".agents", cmd: "agy" },
  { name: "Codex", dir: ".codex", cmd: "codex" },
  { name: "OpenCode", dir: ".opencode", cmd: "opencode" },
  { name: "Gemini CLI", dir: ".gemini", cmd: "gemini" },
  { name: "Cursor", dir: ".cursor", cmd: "cursor" },
];

function detectDefaultAgent(projectDir: string): { name: string; cmd: string } {
  const cfgFile = existsSync(join(projectDir, ".kaizen", "config.yml"))
    ? join(projectDir, ".kaizen", "config.yml")
    : join(home, ".kaizen", "config.yml");
  if (existsSync(cfgFile)) {
    const text = readFileSync(cfgFile, "utf8");
    const m = /^\s*agent:\s*\n\s*default:\s*(\S+)/m.exec(text) || /^\s*agent\.default:\s*(\S+)/m.exec(text);
    if (m && m[1] && m[1] !== "auto") {
      const found = KNOWN_AGENTS.find((a) => a.cmd === m[1] || a.name.toLowerCase() === m[1].toLowerCase());
      if (found && Bun.which(found.cmd)) return found;
    }
  }

  for (const a of KNOWN_AGENTS) {
    if (existsSync(join(projectDir, a.dir)) && Bun.which(a.cmd)) return a;
  }
  if (Bun.which("claude")) return { name: "Claude Code", cmd: "claude" };
  for (const a of KNOWN_AGENTS) {
    if (Bun.which(a.cmd)) return a;
  }
  return { name: "Claude Code", cmd: "claude" };
}

function findTerminal(cwd: string, fullCmd: string[]): { cmd: string[]; detached: boolean } | null {
  const hasDisplay = Boolean(process.env.WAYLAND_DISPLAY || process.env.DISPLAY);
  const inTmux = Boolean(process.env.TMUX);

  if (process.env.TERMINAL && Bun.which(process.env.TERMINAL)) {
    const term = process.env.TERMINAL;
    if (term.includes("kitty")) return { cmd: [term, "--directory", cwd, ...fullCmd], detached: true };
    if (term.includes("alacritty")) return { cmd: [term, "--working-directory", cwd, "-e", ...fullCmd], detached: true };
    if (term.includes("ghostty")) return { cmd: [term, `--working-directory=${cwd}`, "-e", ...fullCmd], detached: true };
    if (term.includes("foot")) return { cmd: [term, "-D", cwd, ...fullCmd], detached: true };
    return { cmd: [term, "-e", ...fullCmd], detached: true };
  }

  if (hasDisplay && Bun.which("xdg-terminal-exec")) {
    return { cmd: ["xdg-terminal-exec", `--dir=${cwd}`, "--", ...fullCmd], detached: true };
  }

  if (hasDisplay) {
    if (Bun.which("kitty")) return { cmd: ["kitty", "--directory", cwd, ...fullCmd], detached: true };
    if (Bun.which("ghostty")) return { cmd: ["ghostty", `--working-directory=${cwd}`, "-e", ...fullCmd], detached: true };
    if (Bun.which("alacritty")) return { cmd: ["alacritty", "--working-directory", cwd, "-e", ...fullCmd], detached: true };
    if (Bun.which("foot")) return { cmd: ["foot", "-D", cwd, ...fullCmd], detached: true };
    if (Bun.which("wezterm")) return { cmd: ["wezterm", "start", "--cwd", cwd, "--", ...fullCmd], detached: true };
    if (Bun.which("gnome-terminal")) return { cmd: ["gnome-terminal", `--working-directory=${cwd}`, "--", ...fullCmd], detached: true };
    if (Bun.which("xfce4-terminal")) return { cmd: ["xfce4-terminal", `--default-working-directory=${cwd}`, "-x", ...fullCmd], detached: true };
    if (Bun.which("konsole")) return { cmd: ["konsole", "--workdir", cwd, "-e", ...fullCmd], detached: true };
    if (Bun.which("xterm")) return { cmd: ["xterm", "-e", `cd "${cwd}" && ${fullCmd.join(" ")}`], detached: true };
  }

  if (inTmux && Bun.which("tmux")) {
    const cmdStr = fullCmd.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ");
    return { cmd: ["tmux", "new-window", "-c", cwd, cmdStr], detached: false };
  }

  if (process.platform === "darwin") {
    const cmdStr = fullCmd.map((a) => (a.includes(" ") ? `\\"${a}\\"` : a)).join(" ");
    const script = `tell application "Terminal" to do script "cd \\"${cwd}\\" && ${cmdStr}"\ntell application "Terminal" to activate`;
    return { cmd: ["osascript", "-e", script], detached: true };
  }

  return null;
}


// ---------------------------------------------------------------- mouse

// SGR reporting (1006), not X10: X10 encodes coordinates as single bytes and gives
// up past column 223, which a five-column board reaches on any wide terminal.
type MouseEv = { button: number; x: number; y: number; press: boolean };

let mouseWanted = false;                           // what config.yml asked for
let mouseArmed = false;                            // what the terminal is actually in

function readMouse(rest: string): { ev: MouseEv; len: number } | null {
  const m = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(rest);
  if (!m) return null;
  return {
    ev: { button: +m[1]!, x: +m[2]!, y: +m[3]!, press: m[4] === "M" },
    len: m[0].length,
  };
}

const WHEEL_UP = 64, WHEEL_DOWN = 65;
const isClick = (e: MouseEv) => e.press && e.button === 0;

function mouseOn() {
  if (!mouseWanted || mouseArmed) return;
  process.stdout.write("\x1b[?1000h\x1b[?1006h");
  mouseArmed = true;
}

function mouseOff() {
  if (!mouseArmed) return;
  process.stdout.write("\x1b[?1006l\x1b[?1000l");
  mouseArmed = false;
}

// Ctrl-C calls process.exit, which unwinds no finally block anywhere. A terminal
// left reporting spits escape junk at every click until `reset`, so this guard has
// to survive an abrupt exit.
process.on("exit", () => { if (mouseArmed) process.stdout.write("\x1b[?1006l\x1b[?1000l"); });

// Off unless the config says otherwise: while reporting is on, the terminal cannot
// select text with the mouse.
function mouseFromConfig(state: string | null) {
  for (const f of [state ? join(state, "config.yml") : null, join(home, ".kaizen", "config.yml")]) {
    if (!f || !existsSync(f)) continue;
    const m = /^\s*ui:\s*\n(?:\s*#.*\n)*\s*mouse:\s*(\S+)/m.exec(readFileSync(f, "utf8"));
    if (m) return m[1] === "true";
  }
  return false;
}

export async function dashboard(
  repo: string,
  agents: string[],
  run: (a: string) => Promise<string[] | void>,
) {
  const { stdin, stdout } = process;
  const state = locate();
  mouseWanted = mouseFromConfig(state);
  // Opening a project is what makes it known; nothing else asks the user to register.
  if (state && dirname(state) !== home) remember(dirname(state));

  // Every known project's runs and open items, tagged with where they came from.
  // draw() runs on every keypress, so this is gathered when the dashboard opens and
  // after an action returns -- never inside draw().
  type Seen = { runs: (Run & { where: string })[]; items: { text: string; where: string }[] };
  let seen: Seen = { runs: [], items: [] };

  const survey = () => {
    const dirs = [...knownProjects().map((d) => join(d, ".kaizen")), join(home, ".kaizen")]
      .filter((d, i, all) => all.indexOf(d) === i && existsSync(d));
    const runs: Seen["runs"] = [], items: Seen["items"] = [];
    for (const dir of dirs) {
      const where = label(dir);
      for (const r of readRuns(dir)) runs.push({ ...r, where });
      for (const g of allBacklog(dir)) for (const t of g.items) items.push({ text: t, where });
    }
    seen = { runs, items };
  };
  survey();

  const actions = () => [
    ...(knownProjects().length || !state ? [
      { key: "projects", label: "All projects", hint: "every project kaizen knows about" },
    ] : []),
    ...(state ? [
      { key: "board", label: "Board", hint: "ideas and runs, by stage" },
      { key: "runs", label: "Runs", hint: "every run, and what each is waiting on" },
      { key: "backlog", label: "Backlog", hint: "what runs noticed and did not do" },
    ] : []),
    { key: "settings", label: "Settings", hint: "modes, approvals, who builds" },
    ...(state && !existsSync(join(state, "config.yml"))
      ? [{ key: "init", label: "Set up this project", hint: "write .kaizen/ here" }] : []),
    ...(!state ? [{ key: "init", label: "Set up this project", hint: "write .kaizen/ here" }] : []),
    { key: "upgrade", label: "Upgrade", hint: "pull, relink, clear the installer cache" },
    { key: "quit", label: "Quit", hint: "" },
  ];

  let active = 0;
  mouseOn();
  try {
    for (;;) {
      const chosen = await menu();
      if (chosen === "quit") return;
      if (chosen === "projects") { await projectsView(); continue; }
      if (chosen === "board") { await boardView(); continue; }
      if (chosen === "runs") { await runsView(); continue; }
      if (chosen === "backlog") { await backlogView(); continue; }
      const lines = await run(chosen);
      if (lines?.length) await report(lines);
      survey();                                 // an action may have changed what exists
      // Settings is one of those actions, and ui.mouse is one of its keys: without
      // this the toggle does nothing until the next launch.
      mouseWanted = mouseFromConfig(state);
      if (mouseWanted) mouseOn(); else mouseOff();
    }
  } finally {
    mouseOff();
  }

  // An action that has something to say says it here, on its own screen, rather
  // than printing to a terminal the dashboard is about to paint over.
  async function report(lines: string[], footer = "any key to go back"): Promise<string> {
    stdout.write("\x1b[?1049h\x1b[?25l\x1b[H\x1b[2J");
    stdout.write("\n");
    for (const line of lines) stdout.write(`  ${line}\n`);
    stdout.write(`\n  ${c.dim(footer)}\n`);
    stdin.setRawMode(true);
    stdin.resume();
    let key = "";
    await new Promise<void>((resolve) => {
      const once = (chunk: Buffer) => {
        const s = chunk.toString();
        if (s.includes("\x03")) process.exit(130);
        const mouse = readMouse(s);
        // A click is a keypress on an any-key screen; the release that follows it
        // must not dismiss the next screen too.
        if (mouse && !isClick(mouse.ev)) return;
        key = mouse ? "" : s;
        stdin.off("data", once);
        resolve();
      };
      stdin.on("data", once);
    });
    stdin.setRawMode(false);
    stdin.pause();
    stdout.write("\x1b[?25h\x1b[?1049l");
    return key;
  }

  // ---------------------------------------------------------------- views

  // One scrolling list, used by every view. Returns the chosen index, or null
  // when the user backs out.
  async function pick(
    title: string,
    rows: string[],
    footer = "enter open · backspace back",
    skip: (i: number) => boolean = () => false,
    extra = "",                        // keys the caller wants to hear about
  ): Promise<{ index: number | null; key?: string }> {
    if (!rows.length) { await report([c.bold(title), "", c.dim("nothing here yet")]); return { index: null }; }

    // Headings are rows too, but they are not items: they are not counted, and
    // moving passes over them rather than landing on them.
    const pickable = rows.map((_, i) => i).filter((i) => !skip(i));
    if (!pickable.length) { await report([c.bold(title), "", c.dim("nothing here yet")]); return { index: null }; }
    let cursor = 0;                                  // index into pickable
    const move = (d: number) => { cursor = Math.min(pickable.length - 1, Math.max(0, cursor + d)); };
    let top = 0;
    const height = () => Math.max(5, (stdout.rows ?? 24) - 8);

    const draw = () => {
      const h = height();
      const at = pickable[cursor]!;
      if (at < top) top = at;
      if (at >= top + h) top = at - h + 1;
      stdout.write("\x1b[H\x1b[2J");
      stdout.write(`\n  ${c.bold(title)}   ${c.dim(`${cursor + 1}/${pickable.length}`)}\n\n`);
      for (const [i, row] of rows.slice(top, top + h).entries()) {
        const real = top + i;
        stdout.write(real === at ? `  ${c.cyan("›")} ${fit(row)}\n` : `    ${fit(row)}\n`);
      }
      if (rows.length > h) stdout.write(`\n  ${c.dim(top + h < rows.length ? "↓ more" : "")}`);
      stdout.write(`\n\n  ${c.dim("↑↓ move · " + footer)}\n`);
    };

    stdout.write("\x1b[?1049h\x1b[?25l");
    stdin.setRawMode(true);
    stdin.resume();
    draw();
    let chosen: number | null = null, hit: string | undefined;
    await new Promise<void>((resolve) => {
      const onData = (chunk: Buffer) => {
        const keys = chunk.toString();
        for (let i = 0; i < keys.length; i++) {
          const rest = keys.slice(i);
          if (rest.startsWith("\x03")) process.exit(130);
          // Mouse reports are consumed here whether or not they mean anything, so
          // an unexpected one is never read as a burst of keystrokes.
          const mouse = readMouse(rest);
          if (mouse) {
            i += mouse.len - 1;
            const { ev } = mouse;
            if (ev.button === WHEEL_UP) move(-3);
            else if (ev.button === WHEEL_DOWN) move(3);
            else if (isClick(ev)) {
              // Rows begin on the fourth line: blank, title, blank, then the list.
              const real = top + (ev.y - 4);
              const at = pickable.indexOf(real);
              if (at < 0) continue;               // a heading, or empty space
              // Click to select; click the selected one to act.
              if (at === cursor) { chosen = real; stdin.off("data", onData); return resolve(); }
              cursor = at;
            } else continue;
            draw();
            continue;
          }
          if (rest.startsWith("q") || rest === "\x1b" || rest.startsWith("\x7f") || rest.startsWith("\b")) {
            stdin.off("data", onData); return resolve();
          }
          if (rest.startsWith("\r") || rest.startsWith("\n")) {
            chosen = pickable[cursor]!; stdin.off("data", onData); return resolve();
          }
          const k = [...extra].find((x) => rest.startsWith(x));
          if (k) { hit = k; stdin.off("data", onData); return resolve(); }
          if (rest.startsWith("\x1b[A")) { move(-1); i += 2; }
          else if (rest.startsWith("\x1b[B")) { move(1); i += 2; }
          else if (rest.startsWith("k")) move(-1);
          else if (rest.startsWith("j")) move(1);
          else continue;
          draw();
        }
      };
      stdin.on("data", onData);
    });
    stdin.setRawMode(false);
    stdin.pause();
    stdout.write("\x1b[?25h\x1b[?1049l");
    return { index: hit ? pickable[cursor]! : chosen, key: hit };
  }

  // Every project kaizen knows about, with what each is waiting on. The global
  // ~/.kaizen is one of them: it holds runs made outside any project.
  async function projectsView() {
    for (;;) {
      const dirs = [...knownProjects(), join(home, ".kaizen")].filter(
        (d, i, all) => all.indexOf(d) === i);

      const rows: string[] = [];
      const open: (string | null)[] = [];
      const width = Math.max(...dirs.map((d) => tilde(d).length));

      for (const dir of dirs) {
        const st = dir.endsWith(".kaizen") ? dir : join(dir, ".kaizen");
        if (!existsSync(st)) {
          // Listed, not dropped: a project that moved should be visible and fixable,
          // and the registry is a file the user can edit.
          rows.push(`${c.dim(tilde(dir).padEnd(width))}  ${c.amber("missing")}`);
          open.push(null);
          continue;
        }
        const runs = readRuns(st);
        const waiting = runs.filter((r) => r.awaiting && r.stage !== "abandoned").length;
        const flight = runs.filter((r) => !r.awaiting && !["done", "abandoned"].includes(r.stage)).length;
        const done = runs.filter((r) => r.stage === "done").length;
        const items = allBacklog(st).reduce((n, g) => n + g.items.length, 0);
        const bits = [
          waiting ? c.amber(`${waiting} waiting`) : "",
          flight ? c.cyan(`${flight} running`) : "",
          done ? c.dim(`${done} done`) : "",
          items ? c.dim(`${items} open`) : "",
        ].filter(Boolean);
        rows.push(`${tilde(dir).padEnd(width)}  ${bits.join(c.dim(" · ")) || c.dim("nothing yet")}`);
        open.push(st);
      }

      const { index, key } = await pick("All projects", rows,
        "enter runs · b backlog · s find more · backspace back", () => false, "sb");
      if (index === null) return;
      if (key === "s") { await sync(); continue; }     // the list rebuilds on the next pass
      if (!open[index]) continue;                      // a project whose state has gone
      if (key === "b") await backlogView(open[index]!);
      else await runsView(open[index]!);
    }
  }

  async function sync() {
    const before = knownProjects().length;
    const started = Date.now();
    const found = findProjects(home);
    for (const dir of found) remember(dir);
    const added = knownProjects().length - before;
    await report([
      c.bold(added ? `Found ${added} project${added === 1 ? "" : "s"}` : "Nothing new"),
      "",
      ...found.map((d) => "  " + c.dim(tilde(d))),
      "",
      c.dim(`${found.length} found in ${((Date.now() - started) / 1000).toFixed(1)}s under ${tilde(home)}`),
      c.dim(`the list lives in ${tilde(join(home, ".kaizen", "projects"))} and can be edited`),
    ]);
  }

  async function runsView(from?: string) {
    for (;;) {
      const here = from ?? state!;
      const runs = readRuns(here);
      const width = Math.max(...runs.map((r) => r.id.length));
      const rows = runs.map((r) => {
        const mark = r.stage === "done" ? c.dim("done   ")
          : r.stage === "abandoned" ? c.dim("dropped")
          : r.awaiting ? c.amber("waiting") : c.cyan("running");
        // The mark already says done or dropped; repeating the stage beside it is noise.
        const tail = r.stage === "done" || r.stage === "abandoned" ? "" : (r.awaiting ?? r.stage);
        return `${mark}  ${r.id.padEnd(width)}  ${c.dim(tail)}`;
      });
      const { index } = await pick(from ? `Runs — ${label(from)}` : "Runs", rows);
      if (index === null) return;
      await runDetail(runs[index]!, here);
    }
  }

  // What a run is, read off its own files rather than summarised from memory.
  async function runDetail(r: Run, from?: string) {
    const dir = join(from ?? state!, "runs", r.id);
    const lines: string[] = [c.bold(r.id), ""];
    lines.push(`  stage      ${r.stage}`);
    lines.push(`  waiting    ${r.awaiting ?? c.dim("nothing — it can carry on")}`);

    const request = section(join(dir, "00-request.md"), 6);
    if (request.length) lines.push("", c.bold("  Request"), ...request.map((l) => "    " + l));

    const findings = readFindings(join(dir, "04-review.md"));
    if (findings.length) {
      lines.push("", c.bold(`  Findings (${findings.length})`));
      for (const f of findings.slice(0, 8)) lines.push("    " + f);
    }

    const items = readBacklog(join(dir, "06-backlog.md"));
    if (items.length) {
      lines.push("", c.bold(`  Backlog (${items.length} open)`));
      for (const it of items.slice(0, 8)) lines.push("    " + it);
    }

    lines.push("", c.dim(`  files in ${tilde(dir)}`));
    await report(lines);
  }

  // Cut to the window, counting printable characters only -- a row is mostly colour
  // codes by the time it gets here, and they take no space on screen.
  function fit(row: string) {
    const room = (stdout.columns ?? 80) - 8;
    const plain = row.replace(/\x1b\[[0-9;]*m/g, "");
    if (plain.length <= room) return row;
    let out = "", seen = 0, i = 0;
    while (i < row.length && seen < room - 1) {
      const esc = /^\x1b\[[0-9;]*m/.exec(row.slice(i));
      if (esc) { out += esc[0]; i += esc[0].length; continue; }
      out += row[i]; i++; seen++;
    }
    return out + "…\x1b[0m";
  }

  async function backlogView(from?: string) {
    const groups = allBacklog(from ?? state!);
    const parsed = groups.map((g) => ({ run: g.run, items: g.items.map(parseItem) }));
    const sevWidth = Math.max(0, ...parsed.flatMap((g) => g.items.map((i) => i.severity?.length ?? 0)));
    const whereWidth = Math.max(0, ...parsed.flatMap((g) => g.items.map((i) => i.where?.length ?? 0)));

    const rows: string[] = [];
    const full: (Item | null)[] = [];          // null where the row is a heading
    for (const g of parsed) {
      rows.push(c.bold(g.run.replace(/^\d{4}-\d{2}-\d{2}-/, ""))); full.push(null);
      for (const it of g.items) {
        // Columns only where there is something to put in them: an item written as
        // prose should not be pushed across the screen by other items' severities.
        const cols: string[] = [];
        if (sevWidth) {
          const sev = (it.severity ?? "").padEnd(sevWidth);
          cols.push(it.severity === "critical" || it.severity === "high" ? c.amber(sev) : c.dim(sev));
        }
        if (whereWidth) cols.push(c.dim((it.where ?? "").padEnd(whereWidth)));
        rows.push("  " + [...cols, it.text].join("  "));
        full.push(it);
      }
    }
    for (;;) {
      const { index, key } = await pick(
        from ? `Backlog — ${label(from)}` : "Backlog — open items",
        rows,
        "enter read · r run in agent · backspace back",
        (n) => full[n] === null,
        "rR",
      );
      if (index === null) return;
      // Rows are cut to the window, so reading one means opening it.
      const it = full[index];
      if (!it) continue;
      if (key === "r" || key === "R") {
        await startBacklogItem(it, from ?? state!);
        continue;
      }
      const k = await report([
        c.bold(it.where ?? "Backlog item"),
        it.severity ? c.dim(`  ${it.severity}`) : "",
        "",
        ...wrap(it.raw.replace(/`/g, ""), 2),
      ], "r run in agent · any other key to go back");
      if (k === "r" || k === "R") {
        await startBacklogItem(it, from ?? state!);
      }
    }
  }


  // ------------------------------------------------------------------ board

  // Ideas and runs on one screen, in stage columns. A run's stage belongs to
  // kaizen and cannot be edited here -- a board that could drag one backwards
  // would be lying about what happened. The one exception is abandoning a run,
  // which is the user's decision either way.
  async function boardView() {
    let allProjects = false;
    let cards: Card[] = [];
    let col = 0, row = 0;
    let top = 0;                                   // first visible line, board-wide
    // Where each card actually landed on screen, rebuilt by whichever draw ran.
    // Recording the frame beats recomputing its geometry: the two layouts place
    // cards differently, and a stale guess after a resize clicks the wrong card.
    type Hit = { y: number; x0: number; x1: number; col: number; row: number };
    let hits: Hit[] = [];
    // What each run was awaiting last time we looked, so a redraw can tell the
    // difference between "still blocked" and "just became blocked".
    const wasAwaiting = new Map<string, string | null>();
    let first = true;

    const states = () => (allProjects
      ? [...knownProjects().map((d) => join(d, ".kaizen")), join(home, ".kaizen")]
      : [state!]
    ).filter((d, i, all) => all.indexOf(d) === i && existsSync(d));

    const refresh = () => {
      const now = Date.now();
      const next: Card[] = [];
      // Every project's requests, not just this state dir's: an idea in the global
      // inbox becomes a run in whichever project the agent was started in.
      const requests = [...knownProjects().map((d) => join(d, ".kaizen")), join(home, ".kaizen")]
        .filter((d, i, all) => all.indexOf(d) === i && existsSync(d))
        .flatMap(startedRuns);
      for (const st of states()) {
        const where = label(st);
        for (const it of readInbox(st)) {
          if (it.status !== "open" && it.status !== "started") continue;
          // Retired once any run's request contains this text -- whoever started it.
          // Checking `started` items only would leave every idea acted on outside the
          // board sitting in IDEA forever, and typing `/kaizen ...` in a terminal is
          // the common way a run begins.
          if (requests.some((r) => r.includes(normalise(it.text)))) continue;
          next.push(it.status === "started"
            ? { kind: "idea", dot: c.dim("◌"), status: "starting", text: it.text, state: st, where, column: 1, awaiting: null, dim: true }
            : { kind: "idea", dot: c.dim("·"), status: "idea", text: it.text, state: st, where, column: 0, awaiting: null, dim: false });
        }
        for (const r of readRuns(st)) {
          const shown = dotFor(r, now);
          const key = `${st}/${r.id}`;
          const before = wasAwaiting.get(key);
          if (!first && before === null && r.awaiting) {
            notify("kaizen — waiting on you", `${short(r.id)} · ${r.awaiting}`);
          }
          wasAwaiting.set(key, r.awaiting);
          next.push({
            kind: "run", id: r.id, dot: shown.dot, status: shown.status, text: short(r.id), state: st, where, column: columnOf(r.stage),
            awaiting: r.stage === "abandoned" ? null : r.awaiting,
            dim: r.stage === "abandoned",
          });
        }
      }
      cards = next;
      first = false;
    };

    const inColumn = (n: number) => cards.filter((k) => k.column === n);
    const current = () => inColumn(col)[row];

    const draw = () => {
      const width = stdout.columns ?? 80;
      // Five columns need room to say anything. Below that the board is worse
      // than the list it replaces, so it becomes one.
      if (width < 100) { drawNarrow(); return; }
      const inner = Math.floor((width - 4) / COLUMNS.length) - 2;
      const cols = COLUMNS.map((meta, n) => {
        const lines: string[] = [];
        const starts: number[] = [];
        for (const k of inColumn(n)) {
          starts.push(lines.length);
          const chosen = n === col && inColumn(n)[row] === k;
          const body = wrapTo(k.text, inner - 4);
          for (const [i, line] of body.entries()) {
            const marker = i === 0 ? (chosen ? c.cyan("›") : " ") : " ";
            const dot = i === 0 ? k.dot : " ";
            const painted = k.awaiting ? c.red(line) : k.dim ? c.dim(line) : line;
            lines.push(`${marker} ${dot} ${painted}`);
          }
          if (allProjects && k.where !== "global") lines.push("    " + c.dim(cut(basename(k.where), inner - 4)));
          lines.push("");
        }
        return { meta, lines, starts };
      });

      stdout.write("\x1b[H\x1b[2J");
      const scope = allProjects ? "all projects" : label(state!);
      stdout.write(`\n  ${c.bold("Board")}   ${c.dim(scope)}\n\n`);
      stdout.write("  " + cols.map(({ meta }, n) =>
        pad(n === col ? c.cyan(meta.title) : c.dim(meta.title), inner)).join("  ") + "\n");
      stdout.write("  " + cols.map(() => c.dim("─".repeat(inner))).join("  ") + "\n");
      const height = Math.max(4, (stdout.rows ?? 24) - 11);
      const deep = Math.max(0, ...cols.map((x) => x.lines.length));
      // The selected card drags the viewport with it; a cursor that can leave the
      // screen is a cursor that deletes cards the user cannot see.
      const sel = cols[col]!.starts[row] ?? 0;
      if (sel < top) top = sel;
      if (sel >= top + height) top = sel - height + 1;
      top = Math.max(0, Math.min(top, Math.max(0, deep - height)));
      hits = [];
      for (let i = top; i < Math.min(deep, top + height); i++) {
        // Cards begin on the sixth line: blank, title, blank, headings, rule.
        const y = 6 + (i - top);
        for (const [n, col_] of cols.entries()) {
          const x0 = 3 + n * (inner + 2);
          const owns = col_.starts.reduce((found, at, idx) => (at <= i ? idx : found), -1);
          if (owns < 0) continue;
          const ends = col_.starts[owns + 1] ?? col_.lines.length;
          if (i >= ends || !(col_.lines[i] ?? "").trim()) continue;
          hits.push({ y, x0, x1: x0 + inner - 1, col: n, row: owns });
        }
        stdout.write("  " + cols.map((x) => pad(x.lines[i] ?? "", inner)).join("  ") + "\n");
      }
      const above = top > 0, below = top + height < deep;
      if (above || below) {
        stdout.write(`  ${c.dim(`${above ? "↑" : " "} ${below ? "↓ more" : ""}`)}\n`);
      }
      stdout.write("\n" + footer(current()) + legend());
    };

    // Keys grouped by what they are for -- moving, acting, leaving -- separated by
    // space rather than by middots, which made one long undifferentiated line.
    const footer = (k?: Card) => {
      const acts = k?.kind === "idea"
        ? "n new  e edit  x reject  d delete  r run"
        : k ? "n new idea  x abandon this run" : "n new idea";
      const scope = allProjects ? "a this project" : "a all projects";
      return `  ${c.dim("↑↓←→ move")}     ${c.dim(acts)}     ${c.dim(scope)}  ${c.dim("q back")}\n`;
    };

    // Only the states actually on the board: a legend for dots nothing is using is
    // six items of noise under every screen.
    const legend = () => {
      const present = new Set(cards.map((k) => k.status));
      const all: [string, string][] = [
        ["running", `${c.cyan("●")} ${c.dim("running")}`],
        ["stalled", c.dim("◐ stalled")],
        ["starting", c.dim("◌ starting")],
        ["waiting", `${c.amber("●")} ${c.red("waiting on you")}`],
        ["done", c.dim("○ done")],
        ["abandoned", c.dim("○ abandoned")],
        ["idea", c.dim("· idea")],
      ];
      const parts = all.filter(([key]) => present.has(key)).map(([, text]) => text);
      return parts.length ? "\n  " + parts.join("    ") + "\n" : "\n";
    };

    // Under 100 columns the board stacks: same cards, same keys, one list.
    const drawNarrow = () => {
      stdout.write("\x1b[H\x1b[2J");
      stdout.write(`\n  ${c.bold("Board")}   ${c.dim("narrow terminal — stacked")}\n\n`);
      hits = [];
      // The header writes three newlines, so the first heading lands on line 4.
      let y = 4;
      for (const [n, meta] of COLUMNS.entries()) {
        const items = inColumn(n);
        if (!items.length) continue;
        stdout.write(`  ${n === col ? c.cyan(meta.title) : c.dim(meta.title)}\n`);
        y++;
        for (const [idx, k] of items.entries()) {
          const chosen = n === col && items[row] === k;
          const text = k.awaiting ? c.red(k.text) : k.dim ? c.dim(k.text) : k.text;
          stdout.write(`  ${chosen ? c.cyan("›") : " "} ${k.dot} ${cut(text, (stdout.columns ?? 80) - 8)}\n`);
          hits.push({ y, x0: 1, x1: stdout.columns ?? 80, col: n, row: idx });
          y++;
        }
        stdout.write("\n");
        y++;
      }
      stdout.write("\n" + footer(current()) + legend());
    };

    const cardAt = (x: number, y: number) =>
      hits.find((h) => h.y === y && x >= h.x0 && x <= h.x1) ?? null;

    const clamp = () => {
      col = Math.min(COLUMNS.length - 1, Math.max(0, col));
      row = Math.min(Math.max(0, inColumn(col).length - 1), Math.max(0, row));
    };

    refresh();
    stdout.write("\x1b[?1049h\x1b[?25l");
    stdin.setRawMode(true);
    stdin.resume();

    // Kaizen writes these files from other processes; watching them is what makes
    // the board move on its own.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let watchers: ReturnType<typeof watch>[] = [];
    const onChange = () => {
      if (timer) clearTimeout(timer);
      // A state.json being rewritten is briefly unparseable; readRuns already
      // drops what it cannot parse, and the delay keeps that window off screen.
      timer = setTimeout(() => { refresh(); clamp(); draw(); arm(); }, 150);
    };

    // fs.watch is not recursive here, and the file that actually changes is
    // runs/<id>/state.json -- two levels down. Watching only the state dir and
    // runs/ sees a new run appear and never sees an existing one move, so every
    // run directory is watched too, and the set is rebuilt whenever anything
    // fires in case the change was a run being created.
    function arm() {
      for (const w of watchers) { try { w.close(); } catch { /* already gone */ } }
      watchers = [];
      for (const st of states()) {
        const runs = join(st, "runs");
        const targets = [st, runs];
        try { for (const id of readdirSync(runs)) targets.push(join(runs, id)); } catch { /* no runs yet */ }
        for (const target of targets) {
          try { if (existsSync(target)) watchers.push(watch(target, { persistent: false }, onChange)); }
          catch { /* unwatchable path */ }
        }
      }
    }
    arm();

    try {
      draw();
      for (;;) {
        const key = await nextKey();
        if (key === "quit") break;
        if (key === "a") { allProjects = !allProjects; refresh(); clamp(); draw(); arm(); continue; }
        if (key === "left") { col--; row = 0; clamp(); draw(); continue; }
        if (key === "right") { col++; row = 0; clamp(); draw(); continue; }
        if (key === "up") { row--; clamp(); draw(); continue; }
        if (key === "down") { row++; clamp(); draw(); continue; }

        const target = current();
        if (key === "n") {
          const text = await promptLine("New idea", "");
          if (text) {
            const st = target?.state ?? state!;
            writeInbox(st, [...readInbox(st), { status: "open", text }]);
          }
          refresh(); col = 0; clamp(); draw(); continue;
        }
        if (!target) { draw(); continue; }
        // Runs are otherwise read-only -- their stage belongs to kaizen -- but
        // abandoning one is the user's decision to make, and /kaizen abort is the
        // same single transition this writes.
        if (target.kind === "run") {
          if (key === "x" && target.id) {
            const why = await promptLine(`Abandon ${target.text}? Reason`, "");
            if (why) {
              const failed = abandonRun(target.state, target.id, why);
              if (failed) await outside(() => report([c.bold("Could not abandon"), "", c.dim(failed)]));
            }
            refresh(); clamp();
          }
          draw(); continue;
        }
        if (key === "e") {
          const text = await promptLine("Edit idea", target.text);
          if (text) replaceIdea(target, { status: "open", text });
        } else if (key === "x") {
          const why = await promptLine(`Reject: ${target.text}`, "");
          // The spec requires a reason on a rejected item; no reason, no rejection.
          if (why) replaceIdea(target, { status: "rejected", text: `${target.text} | ${why}` });
        } else if (key === "d") {
          if (await confirm(`Delete "${cut(target.text, 40)}"?`)) replaceIdea(target, null);
        } else if (key === "r") {
          const mode = await pickMode();
          // "" is the default-mode choice, and must not leave a double space in
          // the prompt the agent is launched with.
          if (mode !== null) {
            const request = `${mode} ${target.text}`.trim();
            await outside(() => startBacklogItem(parseItem(request), target.state));
            // Without this the idea stays open forever and the board shows the
            // same work twice: once as an idea, once as the run it became.
            replaceIdea(target, { status: "started", text: target.text });
          }
        }
        refresh(); clamp(); draw();
      }
    } finally {
      for (const w of watchers) { try { w.close(); } catch { /* already gone */ } }
      watchers = [];
      if (timer) clearTimeout(timer);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\x1b[?25h\x1b[?1049l");
    }

    // The only run state the board writes, and only this transition: stage becomes
    // abandoned, awaiting clears. Every other field is preserved, so a run abandoned
    // here still resumes and reads like one abandoned by /kaizen abort.
    function abandonRun(st: string, id: string, why: string): string | null {
      const file = join(st, "runs", id, "state.json");
      try {
        const run = JSON.parse(readFileSync(file, "utf8"));
        if (run.stage === "abandoned") return "That run is already abandoned.";
        run.stage = "abandoned";
        run.awaiting = null;
        run.updated = new Date().toISOString();
        writeFileSync(file, JSON.stringify(run, null, 2) + "\n");
        // The reason belongs in the record, not in state.json, whose shape is the
        // resume contract every kaizen tool reads.
        appendFileSync(join(st, "runs", id, "02-approval.md"),
          `\n---\n\n## Abandoned\n\n${new Date().toISOString()} — abandoned from the board.\n\n${why}\n`);
        return null;
      } catch (err: any) {
        return err?.message ?? String(err);
      }
    }

    function replaceIdea(card: Card, next: InboxLine | null) {
      const lines = readInbox(card.state);
      const at = lines.findIndex((l) => (l.status === "open" || l.status === "started") && l.text === card.text);
      if (at < 0) return;                            // changed underneath us; the redraw will show why
      if (next) lines[at] = next; else lines.splice(at, 1);
      writeInbox(card.state, lines);
    }

    // startBacklogItem paints its own screens, so the board steps out of the way
    // and takes the terminal back afterwards.
    async function outside(fn: () => Promise<void>) {
      stdin.setRawMode(false);
      stdout.write("\x1b[?25h\x1b[?1049l");
      try {
        await fn();
      } finally {
        // Without this the board's own finally restores a terminal that was never
        // put back into raw mode, and the user is left with no echo.
        stdout.write("\x1b[?1049h\x1b[?25l");
        stdin.setRawMode(true);
        stdin.resume();
      }
    }

    // One chunk can carry several keys -- a held arrow, a paste, fast typing --
    // so it is walked rather than compared whole.
    function nextKey(): Promise<string> {
      return new Promise((resolve) => {
        const onData = (chunk: Buffer) => {
          const keys = chunk.toString();
          if (keys.includes("\x03")) process.exit(130);
          const done = (v: string) => { stdin.off("data", onData); resolve(v); };
          for (let i = 0; i < keys.length; i++) {
            const rest = keys.slice(i);
            const mouse = readMouse(rest);
            if (mouse) {
              i += mouse.len - 1;
              const { ev } = mouse;
              if (ev.button === WHEEL_UP) return done("up");
              if (ev.button === WHEEL_DOWN) return done("down");
              if (!isClick(ev)) continue;
              const target = cardAt(ev.x, ev.y);
              if (!target) continue;
              // Click to select; click the selected card to act, which on an idea
              // means the same thing r does.
              if (target.col === col && target.row === row) return done("r");
              col = target.col; row = target.row;
              draw();
              continue;
            }
            if (rest.startsWith("\x1b[D")) return done("left");
            if (rest.startsWith("\x1b[C")) return done("right");
            if (rest.startsWith("\x1b[A")) return done("up");
            if (rest.startsWith("\x1b[B")) return done("down");
            const ch = keys[i]!;
            if (ch === "h") return done("left");
            if (ch === "l") return done("right");
            if (ch === "k") return done("up");
            if (ch === "j") return done("down");
            if (ch === "q" || ch === "\x1b" || ch === "\x7f" || ch === "\b") return done("quit");
            if ("nexdra".includes(ch)) return done(ch);
          }
        };
        stdin.on("data", onData);
      });
    }

    async function promptLine(title: string, initial: string): Promise<string | null> {
      let buf = initial;
      const paint = () => {
        stdout.write("\x1b[H\x1b[2J");
        stdout.write(`\n  ${c.bold(title)}\n\n  ${buf}${c.cyan("█")}\n\n  ${c.dim("enter save · esc cancel")}\n`);
      };
      paint();
      return new Promise((resolve) => {
        const onData = (chunk: Buffer) => {
          const keys = chunk.toString();
          if (keys.includes("\x03")) process.exit(130);
          const done = (v: string | null) => { stdin.off("data", onData); resolve(v); };
          // Character by character: a held backspace or a paste arrives as one
          // chunk, and comparing the whole chunk to "\x7f" writes the raw bytes
          // into the file instead of deleting anything.
          for (let i = 0; i < keys.length; i++) {
            // Skipped whole, or its digits and semicolons land in the text.
            const mouse = readMouse(keys.slice(i));
            if (mouse) { i += mouse.len - 1; continue; }
            const ch = keys[i]!;
            if (ch === "\x1b") return done(null);
            if (ch === "\r" || ch === "\n") return done(buf.trim() || null);
            if (ch === "\x7f" || ch === "\b") { buf = buf.slice(0, -1); continue; }
            // Anything else unprintable is dropped rather than stored: control
            // bytes in an inbox line survive every later read of that file.
            if (ch >= " " && ch !== "\x7f") buf += ch;
          }
          paint();
        };
        stdin.on("data", onData);
      });
    }

    async function confirm(question: string): Promise<boolean> {
      stdout.write("\x1b[H\x1b[2J");
      stdout.write(`\n  ${c.bold(question)}\n\n  ${c.dim("y delete · any other key keep")}\n`);
      const key = await nextRaw();
      return key === "y" || key === "Y";
    }

    // full or lite, asked at the moment a run starts rather than fixed in config.
    async function pickMode(): Promise<string | null> {
      stdout.write("\x1b[H\x1b[2J");
      stdout.write(`\n  ${c.bold("Start this run how?")}\n\n`);
      stdout.write(`  ${c.cyan("f")}  full   ${c.dim("every stage its own cold agent — the reviewer starts blind")}\n`);
      stdout.write(`  ${c.cyan("l")}  lite   ${c.dim("one session runs every stage — cheaper, review has seen the work")}\n`);
      stdout.write(`  ${c.cyan("d")}  default${c.dim("  whatever config.yml says")}\n\n  ${c.dim("click a line, or any other key to cancel")}\n`);
      // Options start on the fourth line: blank, title, blank, then f, l, d.
      const key = await nextRaw((y) => ["f", "l", "d"][y - 4] ?? null);
      return key === "f" ? "full" : key === "l" ? "lite" : key === "d" ? "" : null;
    }

    // A click arrives as two reports, press and release. The press is what opened
    // this screen, so the release must not be read as its answer -- and a click on
    // one of the offered lines answers it properly, via `clickable`.
    function nextRaw(clickable?: (y: number) => string | null): Promise<string> {
      return new Promise((resolve) => {
        const onData = (chunk: Buffer) => {
          const keys = chunk.toString();
          if (keys.includes("\x03")) process.exit(130);
          const done = (v: string) => { stdin.off("data", onData); resolve(v); };
          for (let i = 0; i < keys.length; i++) {
            const mouse = readMouse(keys.slice(i));
            if (mouse) {
              i += mouse.len - 1;
              if (!clickable || !isClick(mouse.ev)) continue;
              const answer = clickable(mouse.ev.y);
              if (answer) return done(answer);
              continue;
            }
            return done(keys.slice(i));
          }
        };
        stdin.on("data", onData);
      });
    }
  }

  async function startBacklogItem(it: Item, from: string) {
    const projectDir = from === join(home, ".kaizen")
      ? process.cwd()
      : (from.endsWith(".kaizen") ? dirname(from) : from);
    const agent = detectDefaultAgent(projectDir);
    const agentBin = Bun.which(agent.cmd) ?? agent.cmd;
    const prompt = it.where ? `/kaizen ${it.text} (${it.where})` : `/kaizen ${it.text}`;
    const fullCmd = [agentBin, prompt];

    const term = findTerminal(projectDir, fullCmd);
    if (!term) {
      await report([
        c.bold("Could not open terminal"),
        "",
        c.dim("No supported terminal emulator found (xdg-terminal-exec, kitty, ghostty, alacritty, tmux)."),
        "",
        "Run manually:",
        `  ${c.cyan(`cd "${projectDir}" && ${agent.cmd} "${prompt}"`)}`,
      ]);
      return;
    }

    try {
      const proc = Bun.spawn(term.cmd, {
        cwd: projectDir,
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
        detached: term.detached,
      });
      if (term.detached) proc.unref();

      await report([
        c.bold("Started in new terminal"),
        "",
        `  ${c.cyan("Agent")}     ${agent.name} (${c.bold(agent.cmd)})`,
        `  ${c.cyan("Project")}   ${tilde(projectDir)}`,
        `  ${c.cyan("Task")}      ${it.text}`,
        ...(it.where ? [`  ${c.cyan("File")}      ${it.where}`] : []),
        ...(it.severity ? [`  ${c.cyan("Severity")}  ${it.severity}`] : []),
        "",
        c.dim(`Opened in new window running: ${agent.cmd} "${prompt}"`),
      ]);
    } catch (err: any) {
      await report([
        c.bold("Failed to spawn terminal"),
        "",
        c.dim(err?.message ?? String(err)),
        "",
        "Run manually:",
        `  ${c.cyan(`cd "${projectDir}" && ${agent.cmd} "${prompt}"`)}`,
      ]);
    }
  }

  function wrap(text: string, indent = 0) {
    const room = (stdout.columns ?? 80) - 6 - indent;
    const out: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      if (line && line.length + word.length + 1 > room) { out.push(" ".repeat(indent) + line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    if (line) out.push(" ".repeat(indent) + line);
    return out;
  }

  async function menu() {
  let actsTop = 0;                 // screen line of the first action row
  let printed = 0;                 // lines this draw has written
  const w = (text: string) => { printed += (text.match(/\n/g) ?? []).length; stdout.write(text); };
  const draw = () => {
    printed = 0;
    const acts = actions();
    w("\x1b[H\x1b[2J");

    // The mascot sits beside the header rather than above it; stacked, it pushes
    // the runs -- the thing you opened this for -- below the fold on a short window.
    const cols = stdout.columns ?? 80, rows = stdout.rows ?? 24;
    const wide = cols >= 64;
    const art = TANUKI;
    const at = 2;          // where the text sits against it

    // Every width below is measured, not guessed: the mascot's own width plus the
    // gutter plus the wordmark's columns is exactly what the wide header occupies,
    // and 2 more is the left margin every line is written with.
    const gutter = Math.max(...art.map((l) => l.length)) + 4;
    const setsWordmark = cols >= gutter + WORDMARK[0]!.length + 2;

    const beside = Array(art.length).fill("");
    if (setsWordmark) {
      // Against the mascot's middle, with what kaizen is under it and where you are
      // under that: the header says what the tool does before it says where it is.
      const top = 2;
      for (const [i, line] of WORDMARK.entries()) {
        const t = i / (WORDMARK.length - 1);
        beside[top + i] = rgb(
          Math.round(222 - t * 120), Math.round(238 - t * 100), Math.round(255 - t * 30), line);
      }
      // The description is chosen from compact phrasings to fit cleanly beside the mascot.
      const room = cols - gutter - 2 - (version(repo).length + 3);
      const line = ["plan · approve · build · review",
                    "plan · approve · build",
                    "plan · build · review"].find((d) => d.length <= room);
      beside[top + WORDMARK.length + 1] =
        `${c.dim(version(repo))}${line ? "   " + c.dim(line) : ""}`;
      beside[top + WORDMARK.length + 2] = c.dim(state ? tilde(dirname(state)) : "no project here");
      beside[top + WORDMARK.length + 3] = c.dim(agents.join(", "));
    } else {
      beside[at] = `${c.bold("kaizen")} ${c.dim(version(repo))}`;
      beside[at + 1] = c.dim(state ? tilde(dirname(state)) : "no project here");
      beside[at + 3] = c.dim(agents.join(", "));
    }
    w("\n");
    if (wide) {
      // Cut what sits beside the mascot to the room left over. The agent list is
      // long and grows with every agent installed, and it wrapped here before the
      // wordmark existed -- a wrapped line pushes the whole header down a row.
      for (const [i, line] of art.entries()) {
        const t = i / (art.length - 1);
        const r = Math.round(235 - t * 135);
        const g = Math.round(245 - t * 110);
        const b = Math.round(255 - t * 20);
        w("  " + rgb(r, g, b, line.padEnd(gutter)) + cut(beside[i] ?? "", cols - gutter - 2) + "\n");
      }
    } else {
      w(`  ${c.bold("kaizen")} ${c.dim(version(repo))}   ${c.dim(state ? tilde(dirname(state)) : "no project here")}\n`);
      w(`  ${c.dim(agents.join(", "))}\n`);
    }

    if (state) {
      // Across every project, not only this one. Where more than one is known each
      // row says which, since "waiting on approvals.plan" means nothing on its own.
      const many = new Set(seen.runs.map((r) => r.where)).size > 1;
      const from = (w: string) => (many ? c.dim(w + "  ") : "");
      const wait = seen.runs.filter((r) => r.awaiting && r.stage !== "abandoned");
      const fly = seen.runs.filter((r) => !r.awaiting && !["done", "abandoned"].includes(r.stage));
      const fin = seen.runs.filter((r) => r.stage === "done");

      const runLines = [
        ...wait.map((r) => `${c.amber("●")} ${from(r.where)}${short(r.id)}  ${c.dim(r.awaiting ?? "")}`),
        ...fly.map((r) => `${c.cyan("●")} ${from(r.where)}${short(r.id)}  ${c.dim(r.stage)}`),
        ...(fin.length ? [c.dim(`● ${fin.length} done`)] : []),
      ];
      if (!runLines.length) runLines.push(c.dim("none yet"));

      // parseItem's `where` is the file the finding is in; the project is a separate
      // thing and both belong on the row.
      const items = seen.items.map((i) => ({ ...parseItem(i.text), project: i.where }));
      const backLines = items.slice(0, 6).map((it) => {
        const sev = it.severity ? (it.severity === "critical" || it.severity === "high"
          ? c.amber(it.severity) : c.dim(it.severity)) + " " : "";
        return from(it.project) + sev + (it.where ? c.dim(it.where) + "  " : "") + it.text;
      });
      if (!backLines.length) backLines.push(c.dim("nothing open"));
      else if (items.length > 6) backLines.push(c.dim(`… ${items.length - 6} more`));

      // Side by side while there is room for two readable columns; stacked below
      // that, since a panel squeezed under forty columns shows nothing useful.
      const inner = Math.floor((cols - 9) / 2);
      if (cols >= 96) {
        // Both panels get the same body height so their bottom edges meet.
        const tall = Math.max(runLines.length, backLines.length);
        while (runLines.length < tall) runLines.push("");
        while (backLines.length < tall) backLines.push("");
        const left = panel("Runs", runLines, inner);
        const right = panel(`Backlog — ${items.length} open`, backLines, inner);
        w("\n");
        for (let i = 0; i < Math.max(left.length, right.length); i++) {
          w("  " + (left[i] ?? " ".repeat(inner + 2)) + " " + (right[i] ?? "") + "\n");
        }
      } else {
        w("\n");
        for (const line of panel("Runs", runLines, cols - 8)) w("  " + line + "\n");
        for (const line of panel(`Backlog — ${items.length} open`, backLines, cols - 8)) w("  " + line + "\n");
      }
    } else {
      w(`\n  ${c.dim("This folder has no .kaizen/. Set it up, or just ask your agent for something —")}\n`);
      w(`  ${c.dim("the first run creates it.")}\n`);
    }

    w("\n");
    // Counted, not derived: the panels above change height with the terminal and
    // with what exists, so nothing else can know where the actions start.
    actsTop = printed + 1;
    for (const [i, a] of acts.entries()) {
      const on = i === active;
      w(on
        ? `  ${c.cyan("›")} ${c.bold(a.label.padEnd(20))}${c.dim(a.hint)}\n`
        : `    ${c.dim(a.label)}\n`);
    }
    w(`\n  ${c.dim("↑↓ move · enter choose · q quit")}   ${c.dim("⭐ github.com/hfadhlullah/kaizen")}\n`);
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
        if (rest.startsWith("\x03") || rest.startsWith("q") || rest === "\x1b"
            || rest.startsWith("\x7f") || rest.startsWith("\b")) {
          stdin.off("data", onData); return resolve();
        }
        if (rest.startsWith("\r") || rest.startsWith("\n")) {
          chosen = acts[active]!.key;
          stdin.off("data", onData); return resolve();
        }
        const mouse = readMouse(rest);
        if (mouse) {
          i += mouse.len - 1;
          const { ev } = mouse;
          if (ev.button === WHEEL_UP) active = (active - 1 + acts.length) % acts.length;
          else if (ev.button === WHEEL_DOWN) active = (active + 1) % acts.length;
          else if (isClick(ev)) {
            const row = ev.y - actsTop;
            if (row < 0 || row >= acts.length) continue;
            if (row === active) { chosen = acts[active]!.key; stdin.off("data", onData); return resolve(); }
            active = row;
          } else continue;
          draw();
          continue;
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
  return chosen;
  }
}

// The list of projects kaizen knows about. Appended to as kaizen sets one up or is
// opened inside one, and seeded by the Find projects action. Plain lines so it can be
// read and corrected in an editor; blanks and # lines ignored.
const REGISTRY = join(home, ".kaizen", "projects");

export function knownProjects(): string[] {
  if (!existsSync(REGISTRY)) return [];
  return readFileSync(REGISTRY, "utf8").split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

// Never fails the command that triggered it: a read-only home is not a reason for a
// dashboard to stop opening.
export function remember(projectDir: string) {
  try {
    if (knownProjects().includes(projectDir)) return;
    mkdirSync(dirname(REGISTRY), { recursive: true });
    appendFileSync(REGISTRY, projectDir + "\n");
  } catch { /* nothing here is worth an error */ }
}

// Bounded on purpose. Depth is what keeps this from becoming a filesystem walk, and
// the skips are the directories that make one slow: node_modules, and anything dotted
// (which includes .git, and every state directory that is not a project of its own).
function findProjects(root: string, depth = 4): string[] {
  const found: string[] = [];
  const walk = (dir: string, left: number) => {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    // $HOME holds ~/.kaizen, the global state, which is not a project and must not
    // stop the walk before it has looked at anything.
    if (dir !== root && entries.includes(".kaizen")) { found.push(dir); return; }
    if (left === 0) return;
    for (const name of entries) {
      if (name.startsWith(".") || name === "node_modules") continue;
      try { if (statSync(join(dir, name)).isDirectory()) walk(join(dir, name), left - 1); }
      catch { /* unreadable or vanished mid-walk */ }
    }
  };
  walk(root, depth);
  return found;
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
      const file = join(dir, id, "state.json");
      const s = JSON.parse(readFileSync(file, "utf8"));
      // When the run last moved. Kaizen records no liveness signal, so the file's
      // own mtime is the only evidence that anything is still working on it.
      let moved = 0;
      try { moved = statSync(file).mtimeMs; } catch { /* vanished mid-read */ }
      return [{ id, stage: s.stage ?? "?", awaiting: s.awaiting ?? null, moved }];
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
// The global state directory is not a project and has no parent worth naming.
function label(stateDir: string) {
  return stateDir === join(home, ".kaizen") ? "global" : tilde(dirname(stateDir));
}

function tilde(p: string) { return p.startsWith(home) ? "~" + p.slice(home.length) : p; }

// The first few real lines of a file's body, blank lines and headings dropped.
function section(file: string, n: number) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .slice(0, n);
}

function readFindings(file: string) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\d+\.\s/.test(l) || /\b(critical|high|medium|low)\b:/.test(l));
}

// Backlog items are often a reviewer's finding pasted verbatim -- a backticked
// path, a severity, then the sentence. Split those apart so a list can show the
// severity and the place as columns and leave the prose to speak for itself.
type Item = { severity: string | null; where: string | null; text: string; raw: string };

function parseItem(raw: string): Item {
  const m = /^`?([^`:]+(?::\d+)?)`?\s*[:—-]\s*(critical|high|medium|low)\s*[:—-]\s*(.+)$/i.exec(raw);
  if (m) {
    const where = m[1]!.trim().split("/").pop()!;
    return { severity: m[2]!.toLowerCase(), where, text: tidy(m[3]!), raw };
  }
  const sev = /^(critical|high|medium|low)\s*[:—-]\s*(.+)$/i.exec(raw);
  if (sev) return { severity: sev[1]!.toLowerCase(), where: null, text: tidy(sev[2]!), raw };
  return { severity: null, where: null, text: tidy(raw), raw };
}

// One readable sentence: no markdown, and the fix belongs in the full view. The
// first word is left alone -- capitalising it turns request_for_id into
// Request_for_id, which is a different identifier.
function tidy(text: string) {
  return text.replace(/`/g, "").split(/\s+Fix:\s+/)[0]!.trim();
}

function readBacklog(file: string) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n")
    .map((l) => l.trim())
    .filter((l) => /^-\s*open:/.test(l))
    .map((l) => l.replace(/^-\s*open:\s*/, ""));
}

function allBacklog(state: string) {
  const out: { run: string; items: string[] }[] = [];
  const runs = join(state, "runs");
  if (existsSync(runs)) {
    for (const id of readdirSync(runs).reverse()) {
      const items = readBacklog(join(runs, id, "06-backlog.md"));
      if (items.length) out.push({ run: id, items });
    }
  }
  const orphan = readBacklog(join(state, "backlog.md"));
  if (orphan.length) out.push({ run: "Orphaned", items: orphan });
  return out;
}


// ---------------------------------------------------------------- board data

type Card = {
  kind: "idea" | "run";
  id?: string;                                     // runs only: the directory name
  dot: string;
  status: string;                                  // what the legend calls this card
  text: string;
  state: string;
  where: string;
  column: number;
  awaiting: string | null;
  dim: boolean;
};

const COLUMNS = [
  { key: "idea", title: "IDEA" },
  { key: "plan", title: "PLANNING" },
  { key: "build", title: "BUILDING" },
  { key: "review", title: "REVIEW" },
  { key: "done", title: "DONE" },
];


// A run is called running on the evidence that it moved recently; there is no PID
// to ask. Anything in flight and older than this is stalled, not running -- the
// difference the board exists to show.

// The verbatim request of every run, normalised, so an idea that has become a run
// can be retired from the board.
// ponytail: reads each run's 00-request.md on every refresh; fine at tens of runs,
// cache by mtime if a project ever has hundreds.
function startedRuns(state: string): string[] {
  const dir = join(state, "runs");
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const id of readdirSync(dir)) {
    try { out.push(normalise(readFileSync(join(dir, id, "00-request.md"), "utf8"))); }
    catch { /* no request file, or unreadable */ }
  }
  return out;
}

function normalise(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

const RUNNING_WITHIN_MS = 30 * 60_000;

// The status is what the legend lists; the dot is how it is drawn. Deriving one
// from the other by comparing coloured strings breaks the moment a colour moves.
function dotFor(r: Run, now: number): { dot: string; status: string } {
  if (r.stage === "abandoned") return { dot: DIM + "○" + OFF, status: "abandoned" };
  if (r.awaiting) return { dot: c.amber("●"), status: "waiting" };
  if (r.stage === "done") return { dot: c.dim("○"), status: "done" };
  return now - r.moved < RUNNING_WITHIN_MS
    ? { dot: c.cyan("●"), status: "running" }
    : { dot: c.dim("◐"), status: "stalled" };
}

// A stage this build has never heard of still belongs somewhere visible, and
// PLANNING is the honest guess: the run has started and has not finished.
function columnOf(stage: string) {
  if (stage === "build") return 2;
  if (stage === "review") return 3;
  if (stage === "done" || stage === "abandoned") return 4;
  return 1;
}

type InboxLine = { status: string; text: string };

// Ideas with no run yet. Deliberately not backlog.md, which the spec defines as
// an orphanage for items rescued from pruned runs, and not a run stub each.
function readInbox(state: string): InboxLine[] {
  const f = join(state, "inbox.md");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n")
    .map((l) => /^-\s*(open|started|done|rejected):\s*(.+)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ status: m[1]!, text: m[2]!.trim() }));
}

// Whole-file rewrite. The board is the only writer today.
// ponytail: single writer assumed; if a kaizen stage ever appends here too, this
// needs a lock or an append-only journal.
function writeInbox(state: string, lines: InboxLine[]) {
  mkdirSync(state, { recursive: true });
  const body = [
    "# Inbox",
    "",
    "Ideas with no run yet. One line each, same format as a run's backlog.",
    "",
    ...lines.map((l) => `- ${l.status}: ${l.text}`),
  ];
  writeFileSync(join(state, "inbox.md"), body.join("\n") + "\n");
}

// Best effort: a machine without notify-send loses the notification, not the board.
function notify(title: string, body: string) {
  try {
    if (!Bun.which("notify-send")) return;
    Bun.spawn(["notify-send", title, body], {
      stdin: "ignore", stdout: "ignore", stderr: "ignore", detached: true,
    }).unref();
  } catch { /* notifications are not worth an exception */ }
}

// wrap() above fills the terminal; a board column has its own width.
function wrapTo(text: string, room: number) {
  const out: string[] = [];
  let line = "";
  // A run id is a single word to any whitespace split, so without breaking on
  // hyphens too it can never wrap and is always cut. Kept in the same order the
  // text arrived, hyphen retained on the line it ends.
  const words = text.split(/\s+/).flatMap((w) =>
    w.length <= room ? [w] : w.split(/(?<=-)/));
  for (const word of words) {
    if (line && line.length + word.length + (line.endsWith("-") ? 0 : 1) > room) { out.push(line); line = word; }
    else line = line ? (line.endsWith("-") ? line + word : `${line} ${word}`) : word;
  }
  if (line) out.push(line);
  return out.length ? out.map((l) => cut(l, room)) : [""];
}

function pad(s: string, room: number) {
  const body = cut(s, room);
  return body + " ".repeat(Math.max(0, room - vis(body)));
}

// Printable width: a row is mostly colour codes by the time it is drawn, and they
// occupy no columns.
function vis(s: string) { return s.replace(/\x1b\[[0-9;]*m/g, "").length; }

function cut(s: string, room: number) {
  if (vis(s) <= room) return s;
  let out = "", seen = 0, i = 0;
  while (i < s.length && seen < room - 1) {
    const esc = /^\x1b\[[0-9;]*m/.exec(s.slice(i));
    if (esc) { out += esc[0]; i += esc[0].length; continue; }
    out += s[i]; i++; seen++;
  }
  return out + "…\x1b[0m";
}

const DIM = "\x1b[2m", OFF = "\x1b[0m";

function panel(title: string, lines: string[], inner: number) {
  const bar = "─".repeat(Math.max(0, inner - vis(title) - 3));
  const out = [`${DIM}╭─${OFF} ${title} ${DIM}${bar}╮${OFF}`];
  for (const line of lines) {
    const body = cut(line, inner - 2);
    out.push(`${DIM}│${OFF} ${body}${" ".repeat(Math.max(0, inner - 2 - vis(body)))} ${DIM}│${OFF}`);
  }
  out.push(`${DIM}╰${"─".repeat(Math.max(0, inner))}╯${OFF}`);
  return out;
}

// Run ids carry the date they started; the list is already in date order.
function short(id: string) { return id.replace(/^\d{4}-\d{2}-\d{2}-/, ""); }
