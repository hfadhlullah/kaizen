// What `kaizen` shows once it is installed: the state of this project's runs, and
// the few things you would have opened a terminal to do.
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
};

type Run = { id: string; stage: string; awaiting: string | null };

// The mascot, rendered from assets/kaizen.jpg. Braille packs 2x4 dots into one
// character, which is the only way outline art survives a downsample this far;
// sampling brightness onto a character ramp gives grey mush, having no midtones
// to sample. Regenerate with the snippet in assets/tanuki.txt's history.
const TANUKI = [
  "⠀⠀⠀⠀⢀⡶⢶⣖⡒⠒⠛⠛⠛⠛⣛⡿⠟⢛⡟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⢀⣾⡇⠀⠀⠉⠛⠲⣤⠴⠛⠁⢀⡴⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⡾⢹⠇⠀⠀⣠⠴⠋⠁⠀⣠⠖⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⣼⠁⣸⣠⡴⠋⢁⡴⠦⣄⡚⢁⣀⣀⣀⣀⡀⢀⣠⠴⢦⡀⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⣸⢃⡴⠟⠁⠀⣀⢸⡇⠀⠈⠙⠉⠉⠀⠀⠉⠉⠋⠁⠀⢨⡇⠀⠀⠀⠀⠀⠀⠀⠀",
  "⣰⡿⠋⢰⡏⢹⠋⠁⠈⣧⠀⠀⢀⡀⠀⠀⠀⠀⢀⡀⠀⠀⣸⠃⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠻⠖⠛⢹⡇⠘⣇⠀⢰⠇⣠⠞⢉⡉⢳⡀⢀⡞⢉⡉⠳⣄⠘⣆⠀⠀⢠⡤⣤⢀⡀⠀",
  "⠀⠀⠀⠀⣧⠀⠉⣰⣋⡴⠃⠀⠈⠁⡞⣀⣀⢳⠈⠁⠀⠘⢦⣙⣆⠀⣰⠃⠹⡇⣸⣻",
  "⠀⠀⠀⠀⠘⣆⠀⠈⠻⣄⠀⠀⠀⠀⠳⢬⡥⠞⠀⠀⠀⠀⣠⠝⠁⢀⡇⠀⠀⣷⢳⠃",
  "⠀⠀⠀⠀⠀⠈⢧⡀⠀⠈⠙⠲⠦⣤⣤⣀⣀⣤⣤⠴⠖⠿⠷⠶⠚⠉⣳⠤⠴⠯⠏⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠙⠲⣄⠀⠀⠀⣀⡤⠶⠶⢤⣀⠀⠀⠀⠀⣀⣤⠞⣡⠶⠚⠒⢦⡀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⠀⠀⡼⠁⠀⠀⠀⠀⠈⢧⠀⠀⢾⠉⢀⡾⠻⣄⡀⠀⠈⡇",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠐⡇⠀⠀⠀⠀⠀⠀⢸⠆⠀⢸⠚⠉⠀⠀⠀⢯⣀⡼⠃",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⢷⠀⠀⠻⣄⠀⠀⠀⠀⣠⠟⠀⠀⡾⢤⣤⣀⣤⡤⠶⠋⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢧⣄⣠⠤⠶⠒⠒⠻⠧⣄⣠⡼⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀",
];

// The same, for windows that cannot spare fifteen rows before the runs begin.
// The wordmark the installer prints. 45 columns; the header only sets it when the
// terminal has room beside the mascot, and otherwise says the name in text.
const WORDMARK = [
  "██╗  ██╗ █████╗ ██╗███████╗███████╗███╗   ██╗",
  "██║ ██╔╝██╔══██╗██║╚══███╔╝██╔════╝████╗  ██║",
  "█████╔╝ ███████║██║  ███╔╝ █████╗  ██╔██╗ ██║",
  "██╔═██╗ ██╔══██║██║ ███╔╝  ██╔══╝  ██║╚██╗██║",
  "██║  ██╗██║  ██║██║███████╗███████╗██║ ╚████║",
  "╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═╝  ╚═══╝",
];

const TANUKI_SMALL = [
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


export async function dashboard(
  repo: string,
  agents: string[],
  run: (a: string) => Promise<string[] | void>,
) {
  const { stdin, stdout } = process;
  const state = locate();

  const actions = () => [
    ...(state ? [
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
  for (;;) {
    const chosen = await menu();
    if (chosen === "quit") return;
    if (chosen === "runs") { await runsView(); continue; }
    if (chosen === "backlog") { await backlogView(); continue; }
    const lines = await run(chosen);
    if (lines?.length) await report(lines);
  }

  // An action that has something to say says it here, on its own screen, rather
  // than printing to a terminal the dashboard is about to paint over.
  async function report(lines: string[]) {
    stdout.write("\x1b[?1049h\x1b[?25l\x1b[H\x1b[2J");
    stdout.write("\n");
    for (const line of lines) stdout.write(`  ${line}\n`);
    stdout.write(`\n  ${c.dim("any key to go back")}\n`);
    stdin.setRawMode(true);
    stdin.resume();
    await new Promise<void>((resolve) => {
      const once = (chunk: Buffer) => {
        if (chunk.toString().includes("\x03")) process.exit(130);
        stdin.off("data", once);
        resolve();
      };
      stdin.on("data", once);
    });
    stdin.setRawMode(false);
    stdin.pause();
    stdout.write("\x1b[?25h\x1b[?1049l");
  }

  // ---------------------------------------------------------------- views

  // One scrolling list, used by every view. Returns the chosen index, or null
  // when the user backs out.
  async function pick(
    title: string,
    rows: string[],
    footer = "enter open · backspace back",
    skip: (i: number) => boolean = () => false,
  ) {
    if (!rows.length) { await report([c.bold(title), "", c.dim("nothing here yet")]); return null; }

    // Headings are rows too, but they are not items: they are not counted, and
    // moving passes over them rather than landing on them.
    const pickable = rows.map((_, i) => i).filter((i) => !skip(i));
    if (!pickable.length) { await report([c.bold(title), "", c.dim("nothing here yet")]); return null; }
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
    let chosen: number | null = null;
    await new Promise<void>((resolve) => {
      const onData = (chunk: Buffer) => {
        const keys = chunk.toString();
        for (let i = 0; i < keys.length; i++) {
          const rest = keys.slice(i);
          if (rest.startsWith("\x03")) process.exit(130);
          if (rest.startsWith("q") || rest === "\x1b" || rest.startsWith("\x7f") || rest.startsWith("\b")) {
            stdin.off("data", onData); return resolve();
          }
          if (rest.startsWith("\r") || rest.startsWith("\n")) {
            chosen = pickable[cursor]!; stdin.off("data", onData); return resolve();
          }
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
    return chosen;
  }

  async function runsView() {
    for (;;) {
      const runs = readRuns(state!);
      const width = Math.max(...runs.map((r) => r.id.length));
      const rows = runs.map((r) => {
        const mark = r.stage === "done" ? c.dim("done   ")
          : r.stage === "abandoned" ? c.dim("dropped")
          : r.awaiting ? c.amber("waiting") : c.cyan("running");
        // The mark already says done or dropped; repeating the stage beside it is noise.
        const tail = r.stage === "done" || r.stage === "abandoned" ? "" : (r.awaiting ?? r.stage);
        return `${mark}  ${r.id.padEnd(width)}  ${c.dim(tail)}`;
      });
      const i = await pick("Runs", rows);
      if (i === null) return;
      await runDetail(runs[i]!);
    }
  }

  // What a run is, read off its own files rather than summarised from memory.
  async function runDetail(r: Run) {
    const dir = join(state!, "runs", r.id);
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

  async function backlogView() {
    const groups = allBacklog(state!);
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
      const i = await pick("Backlog — open items", rows, "enter read · backspace back",
        (n) => full[n] === null);
      if (i === null) return;
      // Rows are cut to the window, so reading one means opening it.
      const it = full[i];
      if (!it) continue;
      await report([
        c.bold(it.where ?? "Backlog item"),
        it.severity ? c.dim(`  ${it.severity}`) : "",
        "",
        ...wrap(it.raw.replace(/`/g, ""), 2),
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
  const draw = () => {
    const acts = actions();
    const runs = state ? readRuns(state) : [];
    const waiting = runs.filter((r) => r.awaiting && r.stage !== "abandoned");
    const flight = runs.filter((r) => !r.awaiting && !["done", "abandoned"].includes(r.stage));
    const done = runs.filter((r) => r.stage === "done");

    stdout.write("\x1b[H\x1b[2J");

    // The mascot sits beside the header rather than above it; stacked, it pushes
    // the runs -- the thing you opened this for -- below the fold on a short window.
    const cols = stdout.columns ?? 80, rows = stdout.rows ?? 24;
    const wide = cols >= 64;
    const art = rows >= 30 ? TANUKI : TANUKI_SMALL;
    const at = art === TANUKI ? 6 : 2;          // where the text sits against it

    // Every width below is measured, not guessed: the mascot's own width plus the
    // gutter plus the wordmark's 45 columns is exactly what the wide header occupies,
    // and 2 more is the left margin every line is written with.
    const gutter = Math.max(...art.map((l) => l.length)) + 4;
    const setsWordmark = art === TANUKI && cols >= gutter + WORDMARK[0]!.length + 2;

    const beside = Array(art.length).fill("");
    if (setsWordmark) {
      // Against the mascot's middle, with what kaizen is under it and where you are
      // under that: the header says what the tool does before it says where it is.
      const top = Math.max(0, Math.floor((art.length - WORDMARK.length) / 2) - 2);
      for (const [i, line] of WORDMARK.entries()) {
        const t = i / (WORDMARK.length - 1);
        beside[top + i] = rgb(
          Math.round(222 - t * 120), Math.round(238 - t * 100), Math.round(255 - t * 30), line);
      }
      // The description is longer than the wordmark, so it and not the art decides
      // what fits. Take the longest that does; take none rather than wrap.
      const room = cols - gutter - 2 - (version(repo).length + 3);
      const line = ["plan · you approve · build · an independent agent reviews",
                    "plan · approve · build · independent review",
                    "plan · approve · build · review"].find((d) => d.length <= room);
      beside[top + WORDMARK.length + 1] =
        `${c.dim(version(repo))}${line ? "   " + c.dim(line) : ""}`;
      beside[top + WORDMARK.length + 3] = c.dim(state ? tilde(dirname(state)) : "no project here");
      beside[top + WORDMARK.length + 4] = c.dim(agents.join(", "));
    } else {
      beside[at] = `${c.bold("kaizen")} ${c.dim(version(repo))}`;
      beside[at + 1] = c.dim(state ? tilde(dirname(state)) : "no project here");
      beside[at + 3] = c.dim(agents.join(", "));
    }
    stdout.write("\n");
    if (wide) {
      // Cut what sits beside the mascot to the room left over. The agent list is
      // long and grows with every agent installed, and it wrapped here before the
      // wordmark existed -- a wrapped line pushes the whole header down a row.
      for (const [i, line] of art.entries()) {
        stdout.write("  " + c.cyan(line.padEnd(gutter)) + cut(beside[i] ?? "", cols - gutter - 2) + "\n");
      }
    } else {
      stdout.write(`  ${c.bold("kaizen")} ${c.dim(version(repo))}   ${c.dim(state ? tilde(dirname(state)) : "no project here")}\n`);
      stdout.write(`  ${c.dim(agents.join(", "))}\n`);
    }

    if (state) {
      const runLines = [
        ...waiting.map((r) => `${c.amber("●")} ${short(r.id)}  ${c.dim(r.awaiting ?? "")}`),
        ...flight.map((r) => `${c.cyan("●")} ${short(r.id)}  ${c.dim(r.stage)}`),
        ...(done.length ? [c.dim(`● ${done.length} done`)] : []),
      ];
      if (!runLines.length) runLines.push(c.dim("none yet"));

      const items = allBacklog(state).flatMap((g) => g.items.map(parseItem));
      const backLines = items.slice(0, 6).map((it) => {
        const sev = it.severity ? (it.severity === "critical" || it.severity === "high"
          ? c.amber(it.severity) : c.dim(it.severity)) + " " : "";
        return sev + (it.where ? c.dim(it.where) + "  " : "") + it.text;
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
        stdout.write("\n");
        for (let i = 0; i < Math.max(left.length, right.length); i++) {
          stdout.write("  " + (left[i] ?? " ".repeat(inner + 2)) + " " + (right[i] ?? "") + "\n");
        }
      } else {
        stdout.write("\n");
        for (const line of panel("Runs", runLines, cols - 8)) stdout.write("  " + line + "\n");
        for (const line of panel(`Backlog — ${items.length} open`, backLines, cols - 8)) stdout.write("  " + line + "\n");
      }
    } else {
      stdout.write(`\n  ${c.dim("This folder has no .kaizen/. Set it up, or just ask your agent for something —")}\n`);
      stdout.write(`  ${c.dim("the first run creates it.")}\n`);
    }

    stdout.write("\n");
    for (const [i, a] of acts.entries()) {
      const on = i === active;
      stdout.write(on
        ? `  ${c.cyan("›")} ${c.bold(a.label.padEnd(20))}${c.dim(a.hint)}\n`
        : `    ${c.dim(a.label)}\n`);
    }
    stdout.write(`\n  ${c.dim("↑↓ move · enter choose · q or backspace quit")}\n`);
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
  out.push(`${DIM}╰${"─".repeat(inner)}╯${OFF}`);
  return out;
}

// Run ids carry the date they started; the list is already in date order.
function short(id: string) { return id.replace(/^\d{4}-\d{2}-\d{2}-/, ""); }
