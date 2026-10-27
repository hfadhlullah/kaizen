// `kaizen web`: the board in a browser. A loopback HTTP server over state.ts and
// one HTML page; the page never sees the filesystem, only JSON.
import { existsSync, readdirSync, statSync, watch, appendFileSync, mkdirSync, cpSync, rmSync, writeFileSync, type FSWatcher } from "node:fs";
import { join, dirname, resolve, sep, basename } from "node:path";
import {
  home, type Item, type Card, boardCards, knownProjects, remember, locate, label, tilde, searchRoots, findProjects,
  readInbox, writeInbox, replaceIdea, moveIdea, abandonRun, runToIdea, launchRun, parseItem, agentChoices, onPath, projectOf, KNOWN_AGENTS, plainModel, short, setArchived, writeNotes,
  appendNote, saveAttachment, pidOnPort, readText, cmdExe, sysExe, powershellExe, runGit, cardsGit, readCommit, commitPush, notice, notifier, LOGO,
  reviewFindings, pickFindings, backlogCards, backlogItem, startedBacklog, closeBacklog, markBacklogDone, fixPrompt, approvalPrompt, canApproveAwaiting, nativePath, closeSessions, sweepSessions, issueUrl,
  launchMode, readSessions, ownerOf, runIndex, resumePrompt, runAgent, firstSession, webHosts,
} from "./state.ts";
import { attachPty, writePty, resizePty, exitPty, ptyState, ptyKeys, adoptLoginEnv } from "./pty.ts";
import { readSources, addSource, removeSource, moveSource, setCategory, setWriteback, readIcebox, promote, dismiss, restore, addItem, githubRepo, markDone, markReplied, gatherSource, freshImages, gatherAll, gatherDirs, due, socialUrl, socialOf } from "./sources.ts";
import { projectLogo, LOGO_TYPES } from "./logo.ts";
import * as chatgpt from "./chatgpt.ts";
import * as google from "./google.ts";
import { writeBacks } from "./writeback.ts";
import { postLink, sendReply } from "./browser.ts";
import { listNotes, saveNote, renameNote, deleteNote, boardIndex, linksTo } from "./notes.ts";
import * as video from "./video.ts";
import * as localsend from "./localsend.ts";
import * as hermes from "./hermes.ts";
import { listChats, readChat, sendChat, stopChat, deleteChat, okId as okChatId, busy as chatBusy, type Event as ChatEvent, type Upload as ChatUpload } from "./chat.ts";

const PAGE = join(dirname(import.meta.dir), "web", "board.html");
// The board's script: web/board/*.ts, bundled into one file by `bun run build:web`.
const BOARD_JS = join(dirname(import.meta.dir), "web", "board.js");
const SOUNDS_DIR = join(dirname(import.meta.dir), "web", "sounds");
// The notebook: its page, and the CodeMirror bundle `bun run build:web` commits beside it.
const NOTES_PAGE = join(dirname(import.meta.dir), "web", "notes.html");
const ICO = join(dirname(import.meta.dir), "assets", "kaizen.ico");
const NOTES_JS = join(dirname(import.meta.dir), "web", "notebook.js");
// The in-card terminal (agent.launch: card): xterm.js, bundled the same way.
const TERM_JS = join(dirname(import.meta.dir), "web", "term.js");
const TERM_CSS = join(dirname(import.meta.dir), "web", "term.css");
// The Video page (kaizen-video's library, editor and renders) and its bundle.
const VIDEO_PAGE = join(dirname(import.meta.dir), "web", "video.html");
const POPUP_PAGE = join(dirname(import.meta.dir), "web", "popup.html");
// The chat the popup was on when its Back button was pressed, until Home takes it.
let popupChat: string | null = null;
const VIDEO_JS = join(dirname(import.meta.dir), "web", "video.js");
const DEFAULT_PORT = 7420;
// Gathered posts a reply is going out to right now: one send per item at a time.
const replying = new Set<string>();
type PtySock = { key: string; detach: (() => void) | null };
// Read once at start: a board keeps the code it started with, so this is what it
// runs, not what is installed now. `/` sends it; `current()` compares the two.
const installed = () => {
  try { return JSON.parse(readText(join(dirname(import.meta.dir), "package.json"))).version as string; }
  catch { return "unknown"; }
};
const VERSION = installed();
// An upgrade replaces the page files under a running board but not its code, and a
// page newer than its server sends ops the server does not know ("unknown op").
// So the pages are kept as they were at start, and read live (dev edits) only while
// the installed version is still the one this board runs.
const AT_START = new Map([PAGE, BOARD_JS, NOTES_PAGE, NOTES_JS, TERM_JS, TERM_CSS, VIDEO_PAGE, VIDEO_JS].map((f) => [f, existsSync(f) ? readText(f) : null]));
const served = (f: string) => installed() === VERSION && existsSync(f) ? readText(f) : AT_START.get(f) ?? null;

// A board answers at url and runs the installed version. A board from before the
// version header sends none, so it counts as stale too.
export async function current(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(1500) }).catch(() => null);
  return !!r?.ok && r.headers.get("x-kaizen-version") === VERSION;
}

// The newest kaizen on npm, asked at most every six hours; a failed ask is retried
// on the next one; fresh (Settings' Check for updates) skips the cache. Same registry
// call as npmLatest() in install.ts, which exports nothing.
let latest: { v: string | null; at: number } = { v: null, at: 0 };
async function npmLatest(fresh = false) {
  if (!fresh && latest.v && Date.now() - latest.at < 6 * 3600_000) return latest.v;
  try {
    const r = await fetch("https://registry.npmjs.org/kaizen-agent/latest", { signal: AbortSignal.timeout(10000) });
    const v = ((await r.json()) as { version?: string }).version ?? null;
    if (v) latest = { v, at: Date.now() };
    return v;
  } catch { return null; }
}
// a is a later release than b: dotted numbers compared in order, so 1.30.0 > 1.4.0.
// A dev checkout ahead of npm is not offered an "update" back down.
export function newer(a: string, b: string) {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

// What each newer release brings, for the update bar's What's new: the GitHub release
// titles ("v1.35.0: project logos, ...") above `from`, newest first. Cached like
// npmLatest; GitHub unreachable gives none and the bar shows no What's new.
let rel: { list: { v: string; text: string }[]; at: number } = { list: [], at: 0 };
async function releaseNotes(from: string, fresh = false) {
  if (fresh || !rel.list.length || Date.now() - rel.at > 6 * 3600_000) {
    try {
      const r = await fetch("https://api.github.com/repos/hfadhlullah/kaizen/releases?per_page=30", { signal: AbortSignal.timeout(10000) });
      const list = ((await r.json()) as { tag_name: string; name?: string }[])
        .map((x) => ({ v: x.tag_name.replace(/^v/, ""), text: (x.name || "").replace(/^v?[\d.]+:\s*/, "") }))
        .filter((x) => x.text);
      rel = { list, at: Date.now() };
    } catch {}
  }
  return rel.list.filter((x) => newer(x.v, from));
}

type Opts = { port?: number; open?: boolean };

export async function web(repoDir: string, opts: Opts = {}) {
  // A board started from the shortcut has no terminal to show a crash in, so any
  // crash is written where it can be read afterwards.
  const log = join(home, ".kaizen", "web.log");
  for (const ev of ["uncaughtException", "unhandledRejection"] as const) {
    process.on(ev, (err: unknown) => {
      const line = `${new Date().toISOString()} ${ev}: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`;
      try { appendFileSync(log, line); } catch { /* nowhere to write */ }
      console.error(line);
      if (ev === "uncaughtException") process.exit(1);
    });
  }
  // Before anything looks for an agent on PATH: the board starts agents itself, and
  // from a launcher it would otherwise have none of the user's shell setup.
  adoptLoginEnv();
  // Where the board started. Each page picks its own project and names it in the
  // x-kz-dir header, so a phone choosing another project never moves this tab.
  const boardState = locate();
  if (boardState && dirname(boardState) !== home) remember(dirname(boardState));
  // The "Projects folder" setting, resolved; empty when unset.
  const projectsRoot = async () => {
    const { listSettings } = await import("./settings.ts");
    let root = listSettings(repoDir).rows.find((r) => r.key === "board.projects_dir")?.value ?? "";
    if (root.startsWith("~")) root = home + root.slice(1);
    // Typed on Windows as d:\work, D:/work or Git Bash /d/work: one spelling, the one
    // remember() and the known-project check use, or /d/work reads as C:\d\work.
    return root ? resolve(nativePath(root)) : "";
  };
  // .kaizen is not a sign of one: a group folder that was chosen once has it, and
  // must keep showing what is inside.
  const isProject = (d: string) => [".git", "package.json"].some((m) => existsSync(join(d, m)));
  // A group holds projects: no project marker of its own, and folders inside. An empty
  // folder is a project not started yet (New project… makes one), never a group.
  const isGroup = (d: string) => {
    if (isProject(d)) return false;
    try { return readdirSync(d, { withFileTypes: true }).some((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules"); }
    catch { return false; }
  };
  // Folders under the "Projects folder" setting that have no .kaizen yet, offered in
  // the project list so one can be chosen without a terminal. A folder that does not
  // look like a project itself (no .git, no package.json) is taken for a group of
  // them, and its own folders are offered instead: ~/Projects/<client>/<project>.
  const fresh = async () => {
    const root = await projectsRoot();
    if (!root) return [];
    const dirs = (d: string) => {
      try {
        return readdirSync(d).filter((n) => !n.startsWith(".") && n !== "node_modules")
          .map((n) => join(d, n)).filter((p) => { try { return statSync(p).isDirectory(); } catch { return false; } });
      } catch { return []; }
    };
    // One already set up but never opened joins the known projects instead.
    return dirs(root).flatMap((d) => isGroup(d) ? dirs(d) : [d])
      .filter((d) => existsSync(join(d, ".kaizen")) ? (remember(d), false) : true).sort();
  };

  // New project…: a folder in the Projects folder setting (else ~/Projects) or at `to`,
  // empty or new, with .kaizen, registered. check: only say where it would go.
  async function makeProject(name: string, t = "", check = false): Promise<{ dir: string } | { to: string } | { error: string; status?: number }> {
    // Windows' rules on every platform, so a project made here also opens there:
    // no reserved device names (CON, NUL, COM1…), no trailing dot or space.
    const winBad = (n: string) => !n || /[\\/:*?"<>|\x00-\x1f]/.test(n) || /[. ]$/.test(n)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(n);
    const to = t ? resolve(home, nativePath(t.startsWith("~") ? home + t.slice(1) : t))
      : join((await projectsRoot()) || join(home, "Projects"), name);
    // The page asks while the name is typed: "con" on the way to "config" is no error yet.
    if (check) return { to };
    if (winBad(name)) return { error: "name the project: a folder name, without / \\ : * ? \" < > |, not ending in a dot or space, and not CON, NUL, COM1 or the like" };
    if (winBad(basename(to))) return { error: `${basename(to)} cannot be a folder name on Windows` };
    let used = false;
    try { used = readdirSync(to).length > 0; } catch (e) { used = existsSync(to); }
    if (used) return { error: `${to} already exists and is not empty`, status: 409 };
    // A drive that is not there, a read-only folder, a path too long: said in a toast, not a crash.
    try { mkdirSync(join(to, ".kaizen"), { recursive: true }); }
    catch (e) { return { error: `could not create ${to}: ${(e as Error).message}` }; }
    remember(to);
    changed();
    return { dir: join(to, ".kaizen") };
  }

  const states = (all: boolean, cur = boardState) => (all || !cur
    ? [...knownProjects().map((d) => join(d, ".kaizen")), join(home, ".kaizen")]
    : [cur]
  ).filter((d, i, arr) => arr.indexOf(d) === i && existsSync(d));

  // Hostnames the user opted into (KAIZEN_WEB_HOSTS or ~/.kaizen/web-hosts, e.g. a
  // `tailscale serve` name): matched exactly, empty when neither is set.
  const extraHosts = { has: (h: string) => webHosts().has(h) };

  // Any tab on this machine can reach loopback. GET only reads the user's own
  // files, but a POST from a page on the wider web must not write them.
  const local = (req: Request) => {
    const origin = req.headers.get("origin");
    if (!origin) return true;                      // curl, same-origin fetch on old browsers
    try {
      const h = new URL(origin).hostname;
      return h === "127.0.0.1" || h === "localhost" || h === "[::1]" || h === "::1" || extraHosts.has(h);
    } catch { return false; }
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const bad = (why: string, status = 400) => json({ error: why }, status);

  // Change notification: one SSE stream per open board, fed by fs.watch where it
  // works and a slow poll where it does not.
  const clients = new Set<ReadableStreamDefaultController>();
  let pending: ReturnType<typeof setTimeout> | null = null;
  const changed = () => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      for (const c of clients) { try { c.enqueue("data: changed\n\n"); } catch { clients.delete(c); } }
    }, 200);
  };
  // agent.launch: card runs what this board launches inside the board, shown on the card.
  const inCard = (dir: string) => ({ card: launchMode(projectOf(dir)) === "card", onChange: changed });

  // Start a run's agent again after it ended mid-stage (crashed, closed, a stalled run, or
  // the board restarting for an upgrade), in the conversation it had where the tool can
  // resume one. A run waiting for a decision, or done, gets its conversation back with
  // nothing sent to it -- the user talks to it -- and only when that conversation exists.
  // Never beside a live in-card agent, never on an abandoned run.
  const resumeRun = (dir: string, id: string) => {
    let run: any;
    try { run = JSON.parse(readText(join(dir, "runs", id, "state.json"))); } catch { return { error: "no such run", status: 404 }; }
    if (run.stage === "abandoned") return { error: "this run was abandoned", status: 409 };
    if (readSessions(dir).some((s) => ptyState(s.key)?.alive && ownerOf(dir, s) === id)) return { error: "its agent is still running in its card", status: 409 };
    const quiet = run.stage === "done" || !!run.awaiting;
    const own = quiet ? runAgent(dir, id) : null;
    if (quiet && !(own && firstSession(dir, id, own.cmd, projectOf(dir)))) return { error: "no conversation of this run to resume", status: 409 };
    const text = quiet ? "" : resumePrompt(id);
    const before = Date.now();
    const r = launchRun({ severity: null, where: null, text, raw: text }, dir, id, inCard(dir));
    if (r.ok) closeSessions(dir, id, { before });
    changed();
    return r;
  };

  // Runs whose in-card agent was live when Settings' Update restarted the board: the
  // agents end with the old board, so the new one starts them again (resumeRun). Each
  // entry keeps its session key, so an idea whose run had not written state.json yet is
  // matched to its run by the new board, once that run exists. The agents are ended here,
  // not left to the board's exit, so none outlives it beside its resumed self.
  const RESUME_LIST = join(home, ".kaizen", "resume-after-upgrade.json");
  const saveLive = () => {
    const live = new Set(ptyKeys().filter((k) => ptyState(k)?.alive));
    if (!live.size) return;
    const list: { dir: string; key: string; run: string | null }[] = [];
    for (const d of states(true)) {
      const idx = runIndex(d);
      for (const s of readSessions(d)) if (live.has(s.key)) list.push({ dir: d, key: s.key, run: ownerOf(d, s, idx) });
    }
    try { writeFileSync(RESUME_LIST, JSON.stringify({ at: Date.now(), list })); } catch { /* nothing resumes; the card offers Resume */ }
    for (const k of live) exitPty(k, 200);
  };
  // An idea's session, until its run exists and owns it (ownerOf).
  const ideaPty = new Map<string, string>();
  // Backlog items this board launched whose run has not written its state.json yet:
  // shown as starting, like a started idea. Forgotten on restart; the card then offers Run again.
  const backlogLaunched = new Set<string>();
  // The card's newest in-card session, live or recently ended. Sessions are only read
  // while this board has any, so /state costs nothing more for terminal launches.
  // Owners are worked out once per /state: per card it re-read every session and every
  // run's state.json, about a second on a board of 400 runs.
  const ptyOf = (cards: Card[]) => {
    const live = new Set(ptyKeys());
    if (!live.size) return () => undefined;
    const runs = new Map<string, string>();
    for (const d of new Set(cards.filter((c) => c.kind === "run").map((c) => c.state))) {
      const ids = runIndex(d);
      for (const s of readSessions(d)) if (live.has(s.key)) runs.set(`${d}\0${ownerOf(d, s, ids)}`, s.key); // oldest first: the newest wins
    }
    return (c: Card) => {
      const key = c.kind === "run" ? runs.get(`${c.state}\0${c.id}`) : ideaPty.get(`${c.state}\0${c.text}`);
      if (!key || !live.has(key)) return undefined;
      const st = ptyState(key)!;
      // A finished run's agent that has ended has nothing left to show or resume.
      if (!st.alive && (c.status === "done" || c.status === "abandoned")) return undefined;
      return { key, alive: st.alive, asking: st.asking };
    };
  };
  const watchers: FSWatcher[] = [];
  const watchAll = () => {
    for (const w of watchers) { try { w.close(); } catch { /* gone */ } }
    watchers.length = 0;
    for (const dir of states(true)) {
      // An unhandled 'error' on a watcher (Windows: a watched dir renamed, EPERM on
      // a locked file) would end the process; the poll covers what the watch misses.
      try { watchers.push(watch(dir, { recursive: true }, changed).on("error", () => {})); } catch { /* poll covers it */ }
    }
  };
  watchAll();
  // The poll only speaks when something moved: a board reloading every two
  // seconds for nothing is worse than no fallback at all.
  const fingerprint = () => {
    let sum = 0;
    for (const dir of states(true)) {
      for (const f of ["inbox.md", "backlog.md", "archive.md", "sources.json", "icebox.json"]) { try { sum += statSync(join(dir, f)).mtimeMs; } catch { /* absent */ } }
      const runs = join(dir, "runs");
      if (!existsSync(runs)) continue;
      for (const id of readdirSync(runs)) { try { sum += statSync(join(runs, id, "state.json")).mtimeMs; } catch { /* absent */ } }
    }
    return sum;
  };
  let last = fingerprint();
  let seen = states(true).join("\n");
  let ticks = 0;
  const poll = setInterval(() => {
    // Once a minute: windows of runs finished or abandoned past the grace are closed.
    if (++ticks % 30 === 0) for (const dir of states(true)) sweepSessions(dir, Date.now());
    // A project registered since start (a run launched into a fresh dir) gets a watcher too.
    const now = states(true).join("\n"); if (now !== seen) { seen = now; watchAll(); }
    const fp = fingerprint(); if (fp !== last) { last = fp; changed(); }
  }, 2000);

  // The schedule: once a minute, gather every request source that is due. It writes
  // icebox.json and sources.json only, never a state.json, and starts nothing. All of
  // it sits in a try: an uncaught error here would end the board.
  const setting = async (key: string) => {
    const { listSettings } = await import("./settings.ts");
    return listSettings(repoDir).rows.find((r) => r.key === key)?.value ?? "";
  };
  const every = async () => (await setting("sources.every")) || "off";
  // Where videos live: the library folder (board.video_dir, default ~/.kaizen), then
  // every known project with a videos/ folder. The page names one by its index.
  const videoPlaces = async () => {
    let d = await setting("board.video_dir");
    if (d.startsWith("~")) d = home + d.slice(1);
    return video.places(d ? resolve(nativePath(d)) : join(home, ".kaizen"), knownProjects());
  };
  video.onJobChange(() => changed());
  // Send targets as last listed: a send may only go to a device the last search found
  // or a chat Hermes listed, never to an address the page makes up.
  let devices: { at: number; list: localsend.Device[]; note: string | null } = { at: 0, list: [], note: null };
  let chats: hermes.Chat[] = [];
  let busy = false;
  const gather = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const ms = (parseInt(await every()) || 0) * 3600_000;   // "off" parses to nothing
      if (ms) for (const dir of states(true)) {
        let list;
        try { list = readSources(dir); } catch { continue; }   // unreadable: left as it is
        // Social sources need a reader that picks posts: only ChatGPT can do that unattended.
        const gpt = await setting("sources.agent") === "chatgpt" && chatgpt.status().connected;
        for (const s of list) {
          if (!due(s, ms, Date.now())) continue;
          if (!socialOf(s.url)) { if ((await gatherSource(dir, s.url)).added) changed(); }
          else if (gpt) { await chatgpt.gatherSource(dir, s.url, await setting("sources.model"), (await setting("sources.effort")) || "low"); changed(); }
        }
      }
    } catch { /* the next tick tries again */ }
    busy = false;
  }, 60_000);

  // Done requests are reported back to their sources here, on the board's own clock: a
  // page load only reads, so opening the Icebox never closes an issue.
  const loop = setInterval(async () => {
    for (const dir of states(true)) { try { markDone(dir); markBacklogDone(dir); await writeBacks(dir); } catch { /* the next tick tries again */ } }
  }, 60_000);

  const BOOT = Date.now().toString(36);
  const ping = setInterval(() => { for (const c of clients) { try { c.enqueue(": ping\n\n"); } catch { clients.delete(c); } } }, 8000);
  // A launcher clicked while a board is already up should show that board, not die.
  // A bind can fail because a board is already there, or because the OS will not
  // hand out the port at all (Windows reserves whole ranges for Hyper-V and WSL,
  // and reports either as "in use"). Only a board that answers is "already
  // running"; otherwise walk up to the next port that binds.
  let port = opts.port ?? DEFAULT_PORT;
  let server: ReturnType<typeof serve> | null = null;
  for (let tries = 0; tries < 10 && !server; tries++, port++) {
    try { server = serve(port); } catch (e) {
      if (!["EADDRINUSE", "EACCES"].includes((e as { code?: string }).code ?? "")) throw e;
      const url = `http://127.0.0.1:${port}/`;
      const up = await fetch(url, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false);
      if (up && await current(url)) { console.log(`\n  kaizen web already at ${url}\n`); if (opts.open !== false) await openApp(url); return; }
      // A listener that does not answer is a board that hung, and one running an
      // older kaizen serves 404 for whatever came since; both are ours to stop.
      const pid = await pidOnPort(port);
      if (pid && pid !== process.pid) {
        try { process.kill(pid, "SIGTERM"); console.log(`  stopped a ${up ? "stale" : "hung"} board on ${port} (pid ${pid})`); } catch { /* not ours to kill */ }
        await Bun.sleep(300);
        try { server = serve(port); continue; } catch { /* still held */ }
      }
      console.log(`  port ${port} refused by the OS and nothing answers there; trying ${port + 1}`);
    }
  }
  if (!server) { console.log(`\n  kaizen web could not bind any port from ${opts.port ?? DEFAULT_PORT}\n`); return; }

  function serve(port: number) { return Bun.serve({
    hostname: "127.0.0.1",
    port,
    // Local only, so attachments may be large: Bun's 128 MB default would cut them.
    maxRequestBodySize: 512 * 1024 * 1024,
    // Bun drops a request after 10s idle by default. A slow /state (git status in a
    // big repo, on Windows) then comes back as nothing, and the page shows an empty
    // board. Loopback only, so nothing waits on us but our own page.
    idleTimeout: 0,
    // The in-card terminal: output out as text frames, the page's keys and size in as
    // {t:"i",d} and {t:"r",c,r}. A null from the session means the agent ended.
    websocket: {
      open(ws: Bun.ServerWebSocket<PtySock>) {
        ws.data.detach = attachPty(ws.data.key, (d) => { if (d === null) ws.close(1000, "ended"); else ws.send(d); });
      },
      message(ws: Bun.ServerWebSocket<PtySock>, raw) {
        let m: any;
        try { m = JSON.parse(String(raw)); } catch { return; }
        if (m?.t === "i" && typeof m.d === "string") writePty(ws.data.key, m.d);
        else if (m?.t === "r") resizePty(ws.data.key, Number(m.c), Number(m.r));
      },
      close(ws: Bun.ServerWebSocket<PtySock>) { ws.data.detach?.(); },
    },
    async fetch(req, srv) {
      // Host first: a hostname rebound to 127.0.0.1 by an attacker's DNS still
      // arrives with that hostname in Host, and gets nothing.
      const hostname = (req.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
      if (hostname !== "127.0.0.1" && hostname !== "localhost" && !extraHosts.has(hostname)) return new Response("forbidden", { status: 403 });
      const url = new URL(req.url);
      const path = url.pathname;
      const asked = req.headers.get("x-kz-dir");
      const state = asked && states(true).includes(asked) ? asked : boardState;
      const project = state ? label(state) : null;

      if (req.method === "GET" && path === "/") {
        const page = served(PAGE);
        if (page === null) return new Response("web/board.html missing", { status: 500 });
        // The page gets the notify rule from state.ts rather than keeping its own copy.
        return new Response(page.replace("/*notifier*/", () => notifier.toString()), {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-kaizen-version": VERSION },
        });
      }

      if (req.method === "GET" && path === "/board.js") {
        const body = served(BOARD_JS);
        if (body === null) return new Response(`${path} missing; run bun run build:web`, { status: 500 });
        return new Response(body, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" } });
      }

      if (req.method === "GET" && path.startsWith("/sounds/")) {
        const name = /^\/sounds\/([A-Za-z]+)\.mp3$/.exec(path)?.[1];
        const file = name && join(SOUNDS_DIR, `${name}.mp3`);
        if (!file || !existsSync(file)) return new Response("not found", { status: 404 });
        return new Response(Bun.file(file), { headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=86400" } });
      }

      if (req.method === "GET" && (path === "/notebook" || path === "/notebook.js")) {
        const [f, type] = path === "/notebook" ? [NOTES_PAGE, "text/html; charset=utf-8"] : [NOTES_JS, "application/javascript; charset=utf-8"];
        const body = served(f);
        if (body === null) return new Response(`${path} missing; run bun run build:web`, { status: 500 });
        return new Response(body, { headers: { "content-type": type, "cache-control": "no-store" } });
      }

      // `kaizen chat`: the small chat window over the desktop.
      if (req.method === "GET" && path === "/popup") {
        const body = served(POPUP_PAGE);
        if (body === null) return new Response("web/popup.html missing", { status: 500 });
        return new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
      }

      // Handing the chat between Home and the popup (`kaizen chat`). /popup/open:
      // open the popup on Home's chat and hide the board's browser window in a
      // special workspace. /popup/board: bring that window back, focus it (open the
      // board when no window shows it) and close the popup. Hyprland moves windows;
      // elsewhere only the popup opens and closes.
      if (req.method === "POST" && (path === "/popup/open" || path === "/popup/board")) {
        const body = await req.json().catch(() => ({}));
        const chat = (...a: string[]) => Bun.spawn([process.execPath, join(import.meta.dir, "install.ts"), "chat", "--port", String(new URL(req.url).port || DEFAULT_PORT), ...a], { stdout: "ignore", stderr: "ignore" }).exited;
        const hypr = !!process.env.HYPRLAND_INSTANCE_SIGNATURE && !!Bun.which("hyprctl");
        const json = async (cmd: string) => await Bun.$`hyprctl ${cmd} -j`.quiet().nothrow().json().catch(() => null);
        // Several windows can show a board: Pop out takes the one clicked in (the active
        // one), Back the one Pop out hid.
        const isBoard = (c: any) => c && /(^|\) )kaizen( [—-] |$)/.test(String(c.title));
        const all: any[] = hypr ? (await json("clients")) || [] : [];
        const active = hypr ? await json("activewindow") : null;
        const board = path === "/popup/open" ? (isBoard(active) ? active : all.find(isBoard))
          : all.find((c) => isBoard(c) && c.workspace?.name === "special:kaizen") ?? all.find(isBoard);
        const w = board && `address:${board.address}`;
        // Lua grammar first (Hyprland 0.55+ with a Lua config), the classic words after.
        const dispatch = async (lua: string, legacy: string[]) => {
          if ((await Bun.$`hyprctl dispatch ${lua}`.quiet().nothrow().text()).trim() !== "ok") await Bun.$`hyprctl dispatch ${legacy}`.quiet().nothrow();
        };
        if (path === "/popup/open") {
          const id = typeof body.id === "string" && /^[\w.-]+$/.test(body.id) ? body.id : "";
          await chat("--show", ...(id ? ["--chat", id] : []));
          if (w) await dispatch(`hl.dsp.window.move({ workspace = "special:kaizen", follow = false, window = "${w}" })`, ["movetoworkspacesilent", `special:kaizen,${w}`]);
          // Typing goes to the popup, not to whatever was under the hidden board.
          const pop = hypr && ((await json("clients")) || []).find((c: any) => c.class === "kaizen-chat" || String(c.class).startsWith("chrome-127.0.0.1__popup"));
          if (pop) await dispatch(`hl.dsp.focus({ window = "address:${pop.address}" })`, ["focuswindow", `address:${pop.address}`]);
          return Response.json({ ok: true, hidden: !!w });
        }
        if (!w) Bun.spawn([process.platform === "darwin" ? "open" : "xdg-open", new URL("/", req.url).href], { stdout: "ignore", stderr: "ignore" });
        else {
          if (String(board.workspace?.name).startsWith("special:")) {
            const ws = (await json("activeworkspace"))?.id ?? 1;
            await dispatch(`hl.dsp.window.move({ workspace = "${ws}", window = "${w}" })`, ["movetoworkspace", `${ws},${w}`]);
          }
          await dispatch(`hl.dsp.focus({ window = "${w}" })`, ["focuswindow", w]);
        }
        if (typeof body.id === "string") popupChat = body.id;
        await chat("--close");
        return Response.json({ ok: true });
      }
      // Home, refocused after Back, takes the popup's chat once.
      if (req.method === "GET" && path === "/popup/handoff") {
        const id = popupChat;
        popupChat = null;
        return Response.json({ id });
      }

      if (req.method === "GET" && (path === "/video" || path === "/video.js")) {
        const [f, type] = path === "/video" ? [VIDEO_PAGE, "text/html; charset=utf-8"] : [VIDEO_JS, "application/javascript; charset=utf-8"];
        const body = served(f);
        if (body === null) return new Response(`${path} missing; run bun run build:web`, { status: 500 });
        return new Response(body, { headers: { "content-type": type, "cache-control": "no-store" } });
      }

      if (req.method === "GET" && path.startsWith("/video/")) {
        const all = await videoPlaces();
        const at = (v: { place: string }) => all.findIndex((p) => p.dir === v.place);
        if (path === "/video/presets") {
          const place = all[Number(url.searchParams.get("p") ?? 0)] ?? all[0]!;
          return json({ presets: video.presets(place.dir), limits: video.LIMITS });
        }
        // Agents the page started, while the board still holds their terminal.
        const agents = video.agentsOf().flatMap((a) => {
          const s = ptyState(a.key), p = at(a);
          return s && p >= 0 ? [{ place: p, name: a.name, pty: a.key, alive: s.alive, asking: !!s.asking, at: a.at }] : [];
        });
        if (path === "/video/list")
          return json({ places: all.map((p, i) => ({ i, label: p.label, dir: tilde(p.dir) })), agents, jobs: video.jobList().map((j) => ({ ...j, place: at(j) })),
            videos: video.listVideos(all).map((v) => ({ ...v, place: at(v), job: v.job && { ...v.job, place: at(v) },
              send: video.sendOf(v.place, v.name), sends: video.sendLog(v.place, v.name).slice(-5).reverse() })) });
        if (path === "/video/film") {
          const place = all[Number(url.searchParams.get("p"))], name = url.searchParams.get("name");
          if (!place || !video.okName(name)) return bad("unknown video", 404);
          const film = video.readFilm(place.dir, name);
          if (!film) return bad("not a film", 404);
          return json({ ...film, stills: video.stills(place.dir, name), job: video.jobOf(place.dir, name), log: video.logOf(place.dir, name) });
        }
        if (path.startsWith("/video/f/")) return video.serveFile(all, path.slice("/video/f/".length).split("/"), req);
        // LocalSend devices, searched again on ?fresh=1 or after two minutes.
        if (path === "/video/devices") {
          if (url.searchParams.get("fresh") === "1" || Date.now() - devices.at > 120_000) {
            const r = await localsend.discover();
            devices = { at: Date.now(), list: r.devices, note: r.note };
          }
          return json({ devices: devices.list.map(({ fingerprint, alias, deviceModel, deviceType }) => ({ id: fingerprint, alias, deviceModel, deviceType })), note: devices.note });
        }
        if (path === "/video/chats") {
          const r = await hermes.targets();
          if ("error" in r) return json({ chats: [], error: r.error });
          chats = r.chats;
          return json({ chats });
        }
        return bad("not found", 404);
      }

      if (req.method === "GET" && (path === "/term.js" || path === "/term.css")) {
        const [f, type] = path === "/term.js" ? [TERM_JS, "application/javascript; charset=utf-8"] : [TERM_CSS, "text/css; charset=utf-8"];
        const body = served(f);
        if (body === null) return new Response(`${path} missing; run bun run build:web`, { status: 500 });
        return new Response(body, { headers: { "content-type": type, "cache-control": "no-store" } });
      }

      // An in-card agent's terminal. Whoever connects here types into an agent that
      // can run anything, and a page on the wider web may open a WebSocket to
      // loopback freely, so the Origin is required and must be this board's.
      if (req.method === "GET" && path === "/pty") {
        // Same origin exactly, port included: another local server's page is not the board.
        let same = false;
        try { same = new URL(req.headers.get("origin") ?? "").host === req.headers.get("host"); } catch { /* no origin */ }
        if (!same) return bad("cross-origin terminal refused", 403);
        const key = url.searchParams.get("key") ?? "";
        if (!/^[\w-]+$/.test(key) || !ptyState(key)) return bad("no such terminal", 404);
        if (srv.upgrade(req, { data: { key, detach: null } })) return undefined as unknown as Response;
        return bad("websocket expected", 426);
      }

      // The Terminal page's ×: the agent is asked to /exit, and ended if it will not.
      if (req.method === "POST" && path === "/pty/exit") {
        if (!local(req)) return bad("cross-origin write refused", 403);
        let body: any;
        try { body = await req.json(); } catch { return bad("json body expected"); }
        const key = String(body.key ?? "");
        if (!/^[\w-]+$/.test(key) || !ptyState(key)) return bad("no such terminal", 404);
        return json({ ok: exitPty(key) });
      }

      // Every note of one project, text included: search, tags and backlinks are the page's.
      if (req.method === "GET" && path === "/vault") {
        const dir = url.searchParams.get("dir") ?? state ?? join(home, ".kaizen");
        if (!states(true).includes(dir)) return bad("unknown state dir", 404);
        return json({ dir, notes: listNotes(dir) });
      }

      // What a note can link to on this project's board: runs, findings, backlog, ideas.
      if (req.method === "GET" && path === "/links") {
        const dir = url.searchParams.get("dir") ?? state ?? join(home, ".kaizen");
        if (!states(true).includes(dir)) return bad("unknown state dir", 404);
        return json(boardIndex(dir));
      }

      // The tab's icon: small sizes from the .ico, the logo for anything bigger.
      if (req.method === "GET" && path === "/favicon.ico") {
        if (!existsSync(ICO)) return bad("no icon", 404);
        return new Response(Bun.file(ICO), { headers: { "content-type": "image/x-icon", "cache-control": "max-age=86400" } });
      }

      // The icon on a web notification and the large app icon.
      if (req.method === "GET" && path === "/logo.png") {
        if (!existsSync(LOGO)) return bad("no logo", 404);
        return new Response(Bun.file(LOGO), { headers: { "content-type": "image/png", "cache-control": "max-age=86400" } });
      }

      // A project's own logo, for the project pickers: only a known project, only the fixed
      // names in LOGOS, sandboxed so an SVG opened directly runs nothing on this origin.
      if (req.method === "GET" && path === "/project-logo") {
        const dir = url.searchParams.get("dir") ?? "";
        const f = states(true).includes(dir) ? projectLogo(dir) : null;
        if (!f) return bad("no logo", 404);
        const ext = f.slice(f.lastIndexOf(".") + 1).toLowerCase();
        return new Response(Bun.file(f), { headers: { "content-type": LOGO_TYPES[ext], "content-security-policy": "sandbox", "x-content-type-options": "nosniff", "cache-control": "max-age=300" } });
      }

      // Lets a phone add the board to its home screen as a standalone app.
      if (req.method === "GET" && path === "/manifest.webmanifest") {
        return new Response(JSON.stringify({
          name: "kaizen", short_name: "kaizen", start_url: "/", scope: "/", display: "standalone",
          background_color: "#0c162f", theme_color: "#0c162f",
          icons: [{ src: "/logo.png", sizes: "1024x1024", type: "image/png", purpose: "any" }],
        }), { headers: { "content-type": "application/manifest+json" } });
      }

      if (req.method === "GET" && path === "/state") {
        const all = url.searchParams.get("all") === "1";
        // Before the project list: it registers folders that turn out to be set up.
        const unset = await fresh();
        const dirs = states(all, state);
        // With a projects folder set, the picker offers only real projects inside it,
        // and always the one open now so it never hides where the board is.
        const root = await projectsRoot();
        // Windows paths compare without case: c:\users\me\projects holds C:\Users\me\Projects\app.
        // A group folder is what fresh() takes for one, a folder right inside the projects
        // folder with no .git or package.json and folders inside; with an empty .kaizen it was chosen once and
        // is hidden. Anything else is a project, a writing one included, even before its
        // first run. A drive or filesystem root already ends in a separator.
        const fold = (p: string) => process.platform === "win32" ? p.toLowerCase() : p;
        const filled = (d: string) => { try { return readdirSync(d).length > 0; } catch { return false; } };
        const inside = fold(root.endsWith(sep) ? root : root + sep);
        const picker = states(true).filter((d) => {
          const p = dirname(d);
          return !root || d === state || (fold(p).startsWith(inside)
            && (!isGroup(p) || filled(d) || fold(dirname(p)) !== fold(root)));
        });
        const cards = boardCards(dirs, Date.now()), pty = ptyOf(cards);
        // The git mark, for the cards whose panel offers commit and push: one status per project.
        const marks = new Map<string, Record<string, string>>();
        const markable = (c: Card) => c.kind === "run" && !c.archived && (c.status === "done" || c.awaiting === "approvals.review") && c.state !== join(home, ".kaizen");
        for (const d of new Set(cards.filter(markable).map((c) => c.state)))
          marks.set(d, cardsGit(d, cards.filter((c) => markable(c) && c.state === d).map((c) => c.id!)));
        // Open findings the panel's Fix findings form would offer, on the same runs.
        const openFindings = (c: Card) => c.kind === "run" && !c.archived && (c.status === "done" || c.awaiting === "findings" || c.awaiting === "approvals.review") && c.state !== join(home, ".kaizen")
          ? reviewFindings(c.state, c.id!).filter((f) => !f.done).length || undefined : undefined;
        return json({
          project, all, dir: state,
          projects: picker.map((d) => ({ dir: d, label: label(d), logo: !!projectLogo(d) })),
          fresh: unset.map((d) => ({ dir: join(d, ".kaizen"), label: tilde(d) })),
          cards: cards.map((c) => ({ ...c, notice: notice(c), git: markable(c) ? marks.get(c.state)?.[c.id!] : undefined, open: openFindings(c), pty: pty(c) })),
          backlog: backlogCards(dirs).map((b) => ({ ...b, starting: backlogLaunched.has(`${b.state}\0${b.source}#${b.n}`) || undefined })),
          now: Date.now(),
        });
      }

      if (req.method === "GET" && path.startsWith("/run/")) {
        const id = decodeURIComponent(path.slice(5));
        const dir = url.searchParams.get("dir") ?? state;
        if (!dir || !states(true).includes(dir) || !/^[\w.-]+$/.test(id)) return bad("no such run", 404);
        const base = join(dir, "runs", id);
        if (!existsSync(base)) return bad("no such run", 404);
        const read = (f: string) => existsSync(join(base, f)) ? readText(join(base, f)) : null;
        return json({
          id, short: short(id), state: read("state.json"),
          request: read("00-request.md"), plan: read("01-plan.md"), approval: read("02-approval.md"),
          impl: read("03-impl.md"), review: read("04-review.md"), backlog: read("06-backlog.md"),
          notes: read("notes.md"), progress: read("progress.md"),
          // Notebook notes whose [[run:…]] links name this run.
          linkedFrom: linksTo(dir, id),
          // Nothing to pick in the global state dir: /fix refuses it.
          findings: dir === join(home, ".kaizen") ? [] : reviewFindings(dir, id),
          // The global state dir sits in $HOME, which is not a project to commit.
          commit: readCommit(dir, id), git: dir === join(home, ".kaizen") ? { repo: false } : runGit(dir, id),
        });
      }

      if (req.method === "GET" && path === "/sources") {
        // One project's sources, or with no dir every known project's: each entry
        // says which project it belongs to. Nothing is assumed from where the board started.
        const dir = url.searchParams.get("dir");
        if (dir && !states(true).includes(dir)) return bad("unknown state dir", 404);
        const sources = [], icebox = [], dismissed = [], failed = [];
        for (const d of dir ? [dir] : states(true)) {
          // The seen list is bookkeeping, not something the page shows.
          try { sources.push(...readSources(d).map(({ seen, ...s }) => ({ ...s, social: socialOf(s.url), dir: d, project: label(d) }))); }
          catch { failed.push(label(d)); }
          // Waiting and promoted items stay in the list; dismissed and done ones come apart,
          // for their own categories.
          try {
            markDone(d);
            const all = readIcebox(d).map((s) => ({ ...s, post: postLink(s.notes), dir: d, project: label(d) }));
            icebox.push(...all.filter((s) => s.status === "new" || s.status === "promoted"));
            dismissed.push(...all.filter((s) => s.status === "dismissed" || s.status === "done"));
          }
          catch { failed.push(label(d) + " (icebox)"); }
        }
        return json({ sources, icebox, dismissed, failed, every: await every(), gatherer: { use: await setting("sources.agent"), ...chatgpt.status() }, google: google.status() });
      }

      // The Run form's choices for one project: installed tools and their models.
      // A prefilled GitHub bug form. A redirect, so a plain link opens it with no script
      // and no popup blocker in the way.
      if (req.method === "GET" && path === "/issue") {
        return Response.redirect(issueUrl({ title: url.searchParams.get("title") ?? "", what: url.searchParams.get("what") ?? "" }), 302);
      }

      if (req.method === "GET" && path === "/agents") {
        const dir = url.searchParams.get("dir");
        if (!dir || !states(true).includes(dir)) return bad("unknown state dir", 404);
        return json(agentChoices(projectOf(dir)));
      }

      if (req.method === "GET" && path === "/settings") {
        const { listSettings } = await import("./settings.ts");
        const cfg = listSettings(repoDir);
        // Connected, the model is chosen from what the plan offers rather than typed.
        const m = cfg.rows.find((r) => r.key === "sources.model");
        if (m && chatgpt.status().connected) {
          try {
            const slugs = (await chatgpt.models()).map((x) => x.slug);
            Object.assign(m, { text: false, values: ["", ...slugs, ...(m.value && !slugs.includes(m.value) ? [m.value] : [])] });
          } catch { /* stays a text field */ }
        }
        return json(cfg);
      }

      // Sign in with ChatGPT comes back here, in the browser tab the Icebox opened.
      if (req.method === "GET" && path === "/callback") {
        const why = await chatgpt.callback(url.searchParams);
        if (!why) {
          const { setSetting } = await import("./settings.ts");
          setSetting(repoDir, "sources.agent", "chatgpt");
          changed();
        }
        const msg = why ? `Could not connect ChatGPT: ${why}` : `ChatGPT connected${chatgpt.status().email ? ` as ${chatgpt.status().email}` : ""}. Gather now reads social sources with your plan. You can close this tab.`;
        return new Response(`<!doctype html><meta charset="utf-8"><title>kaizen</title><body style="font:15px system-ui;padding:40px;max-width:560px;margin:auto">${msg.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)}</body>`, { headers: { "content-type": "text/html; charset=utf-8" } });
      }

      // Sign in with Google comes back here, for writing a done request into its sheet.
      if (req.method === "GET" && path === "/google-callback") {
        const why = await google.callback(url.searchParams);
        if (!why) changed();
        const msg = why ? `Could not connect Google: ${why}` : "Google connected. Done requests are written back to sheets that have Write back on. You can close this tab.";
        return new Response(`<!doctype html><meta charset="utf-8"><title>kaizen</title><body style="font:15px system-ui;padding:40px;max-width:560px;margin:auto">${msg.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)}</body>`, { headers: { "content-type": "text/html; charset=utf-8" } });
      }

      // What this board runs and what npm has: the page shows an Update button on a newer one.
      if (req.method === "GET" && path === "/version") {
        const v = await npmLatest(url.searchParams.has("fresh"));
        const update = !!v && newer(v, VERSION);
        const notes = update ? await releaseNotes(VERSION, url.searchParams.has("fresh")) : [];
        return json({ version: VERSION, latest: v, update, notes, failed: upgradeFailed });
      }

      // `kaizen upgrade`, run here with no window, then a new board on this port: it
      // finds this one serving the old version and stops it (the stale-board path in
      // web()), and open pages reload on its new boot id. A failed upgrade leaves
      // this board running and says why.
      if (req.method === "POST" && path === "/upgrade") {
        if (!local(req)) return bad("cross-origin write refused", 403);
        if (upgrading) return bad("an upgrade is already running", 409);
        // Windows will not rename ~/kaizen while this board holds files in it, so the
        // upgrade waits in its own process for this one to exit, then starts the board
        // again; ~/.kaizen/upgrade.log keeps what it said. It runs from a copy of cli/,
        // so nothing runs out of ~/kaizen while it is renamed.
        if (process.platform === "win32") {
          const helper = join(home, ".kaizen", "upgrader");
          rmSync(helper, { recursive: true, force: true });
          cpSync(join(repoDir, "cli"), join(helper, "cli"), { recursive: true });
          const log = Bun.file(UPGRADE_LOG);
          Bun.spawn([process.execPath, join(helper, "cli", "install.ts"), "upgrade", "--wait", String(process.pid), "--restart", String(srv.port)], {
            cwd: home, detached: true, stdio: ["ignore", log, log], windowsHide: true,
          }).unref();
          saveLive();
          setTimeout(() => process.exit(0), 300);
          return json({ ok: true });
        }
        upgrading = true;
        try {
          const p = Bun.spawn([process.execPath, join(repoDir, "cli", "install.ts"), "upgrade"], { stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true });
          const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
          const why = (out + err).replace(/\x1b\[[0-9;]*m/g, "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("+")).slice(-2).join(" — ");
          if (code !== 0) return bad(why || `kaizen upgrade exited ${code}`, 500);
          if (installed() === VERSION) return bad(why || "Already up to date");
          const port = srv.port;
          saveLive();
          setTimeout(() => {
            Bun.spawn([process.execPath, join(repoDir, "cli", "install.ts"), "web", "--port", String(port), "--no-open", "--foreground"], {
              detached: true, stdio: ["ignore", "ignore", "ignore"], windowsHide: true,
            }).unref();
          }, 300);
          return json({ ok: true, version: installed() });
        } finally { upgrading = false; }
      }

      if (req.method === "GET" && path === "/google") return json(google.status());

      // The Google client the user created, and connecting or disconnecting Google.
      if (req.method === "POST" && path === "/google") {
        if (!local(req)) return bad("cross-origin write refused", 403);
        let body: any;
        try { body = await req.json(); } catch { return bad("json body expected"); }
        if (body.op === "client") {
          if (typeof body.id !== "string" || typeof body.secret !== "string" || !body.id.trim() || !body.secret.trim()) return bad("client id and secret expected");
          google.setClient(body.id, body.secret); changed(); return json({ ok: true });
        }
        if (body.op === "connect") { try { return json({ ok: true, url: await google.authorizeUrl(Number(url.port)) }); } catch (e) { return bad((e as Error).message); } }
        if (body.op === "disconnect") { google.signOut(); changed(); return json({ ok: true }); }
        return bad("unknown op");
      }

      // Connect or disconnect the ChatGPT plan. The page opens the URL it is handed.
      if (req.method === "POST" && path === "/chatgpt") {
        if (!local(req)) return bad("cross-origin write refused", 403);
        let body: any;
        try { body = await req.json(); } catch { return bad("json body expected"); }
        const { setSetting } = await import("./settings.ts");
        if (body.op === "connect") return json({ ok: true, url: await chatgpt.authorizeUrl(Number(url.port)) });
        if (body.op === "disconnect") { chatgpt.signOut(); setSetting(repoDir, "sources.agent", "agent"); changed(); return json({ ok: true }); }
        if (body.op === "skip") { setSetting(repoDir, "sources.agent", "agent"); changed(); return json({ ok: true }); }
        return bad("unknown op");
      }

      if (req.method === "POST" && path === "/settings") {
        if (!local(req)) return bad("cross-origin write refused", 403);
        let body: any;
        try { body = await req.json(); } catch { return bad("json body expected"); }
        const { setSetting } = await import("./settings.ts");
        const r = setSetting(repoDir, String(body.key ?? ""), String(body.value ?? ""));
        return "error" in r ? bad(r.error) : json(r);
      }

      // A page cannot learn a real path from a file input, so the board, which runs
      // on the user's machine, opens the system's own folder dialog and answers it.
      if (req.method === "POST" && path === "/pick-folder") {
        if (!local(req)) return bad("cross-origin write refused", 403);
        if (picking) return bad("a folder dialog is already open", 409);
        const cmd = folderDialog();
        if (!cmd) return bad("No folder dialog found: install zenity or kdialog, or type the path");
        picking = true;
        try {
          const p = Bun.spawn(cmd, { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
          const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
          // osascript ends a folder with "/"; a bare root (/, C:\) keeps its own.
          const picked = /^([A-Za-z]:)?[\\/]$/.test(out.trim()) ? out.trim() : out.trim().replace(/[\\/]+$/, "");
          if (code === 0 && picked) return json({ path: picked });
          // Cancel: exit 1 with nothing said (zenity, kdialog), -128 (osascript), or exit 0 with no path (PowerShell).
          if (code === 0 || !err.trim() || err.includes("-128")) return json({ cancelled: true });
          return bad(err.trim().split("\n")[0]);
        } catch (e) {
          return bad(e instanceof Error ? e.message : String(e));
        } finally { picking = false; }
      }

      // Attachments only, never a run's own files: the path must sit under an
      // attachments/ directory of a known state dir, with no way back up.
      if (req.method === "GET" && path === "/file") {
        const dir = url.searchParams.get("dir") ?? state;
        const p = url.searchParams.get("p") ?? "";
        if (!dir || !states(true).includes(dir)) return bad("unknown state dir", 404);
        if (!/^(runs\/[\w.-]+\/)?attachments\/[\w.-]+$/.test(p)) return bad("bad path");
        const f = join(dir, p);
        if (!existsSync(f)) return bad("no such file", 404);
        // no-cache: a revise retakes a screenshot under the same name, and the browser must ask again.
        return new Response(Bun.file(f), { headers: { "cache-control": "private, no-cache" } });
      }

      // An icebox image, sent on to a link read fresh from its source: the one kept
      // since the gather may have expired. Only an https link the item holds is followed.
      if (req.method === "GET" && path === "/ice-image") {
        const dir = url.searchParams.get("dir") ?? "";
        if (!states(true).includes(dir)) return bad("unknown state dir", 404);
        const u = (await freshImages(dir, url.searchParams.get("id") ?? ""))[Number(url.searchParams.get("i"))];
        if (!u || !/^https:\/\//.test(u)) return bad("no such image", 404);
        return new Response(null, { status: 302, headers: { location: u, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
      }

      if (req.method === "GET" && path === "/events") {
        let ctrl: ReadableStreamDefaultController;
        const stream = new ReadableStream({
          // The boot id lets the page tell a server restart from a dropped
          // connection; only the former means new code. The ping keeps Bun's
          // idle timeout from closing the stream every ten seconds.
          start(c) { ctrl = c; clients.add(c); c.enqueue(`data: hello ${BOOT}\n\n`); },
          cancel() { clients.delete(ctrl); },
        });
        return new Response(stream, {
          headers: { "content-type": "text/event-stream", "cache-control": "no-store", "connection": "keep-alive" },
        });
      }

      // Home's chat: chats live in ~/.kaizen/chats, each in a project of the board or in none.
      // A send answers with the turn as NDJSON.
      if (path === "/chats" || path === "/chat" || path === "/chat/stop" || path === "/chat/delete") {
        const base = join(home, ".kaizen");
        if (req.method === "GET" && path === "/chats") return json({ chats: listChats(base) });
        if (req.method === "GET" && path === "/chat") {
          const c = readChat(base, url.searchParams.get("id") ?? "");
          return c ? json({ ...c, busy: chatBusy(base, c.id) }) : bad("no such chat", 404);
        }
        if (req.method !== "POST") return bad("method not allowed", 405);
        if (!local(req)) return bad("cross-origin write refused", 403);
        let body: any;
        let uploads: ChatUpload[] = [];
        if (path === "/chat" && req.headers.get("content-type")?.startsWith("multipart/form-data")) {
          if (Number(req.headers.get("content-length")) > 320 * 1024 * 1024) return bad("attachments too large", 413);
          let form: FormData;
          try { form = await req.formData(); } catch { return bad("form data expected"); }
          const files = form.getAll("files");
          if (files.length > 20 || files.some((f) => !(f instanceof File) || f.size > 100 * 1024 * 1024) || files.reduce((n, f) => n + (f instanceof File ? f.size : 0), 0) > 300 * 1024 * 1024) return bad("up to 20 files, 100 MB each and 300 MB total", 413);
          body = { id: form.get("id"), text: form.get("text") ?? "", project: form.get("project") };
          uploads = await Promise.all(files.map(async (f) => ({ name: (f as File).name, bytes: new Uint8Array(await (f as File).arrayBuffer()) })));
        } else try { body = await req.json(); } catch { return bad("json body expected"); }
        const id = body.id == null || body.id === "" ? null : body.id;
        if (id !== null && !okChatId(id)) return bad("bad chat id");
        if (path === "/chat/stop") return stopChat(base, id ?? "") ? json({ ok: true }) : bad("not working", 409);
        if (path === "/chat/delete") { const why = deleteChat(base, id ?? ""); return why ? bad(why, 409) : json({ ok: true }); }
        const text = String(body.text ?? "").trim();
        if (!text && !uploads.length) return bad("empty message");
        if (text.length > 20000) return bad("message too long");
        const board = {
          projects: states(true).filter((d) => d !== base).map((d) => ({ dir: d, label: basename(dirname(d)) })),
          create: async (name: string) => {
            const r = await makeProject(name);
            return "error" in r ? { error: r.error } : { dir: (r as { dir: string }).dir };
          },
          agents: KNOWN_AGENTS.filter((a) => onPath(a.cmd)).map((a) => a.cmd),
          // As POST /run starts an idea, without one on the inbox.
          run: async (d: string, runner: "lite" | "full", agent: string, text: string) => {
            const r = launchRun(parseItem(`${runner} ${text}`), d, undefined, { agent, ...inCard(d) });
            changed();
            return r.ok ? { agent: r.agent.cmd } : { error: r.why };
          },
        };
        let ctl!: ReadableStreamDefaultController;
        const stream = new ReadableStream({ start: (c) => { ctl = c; } });
        const enc = new TextEncoder();
        let chatId = id, moved = false, continued = false;
        const emitChat = (e: ChatEvent) => {
          if (e.t === "chat") chatId = e.id;
          if (e.t === "project") moved = true;
          if (e.t === "done" && moved && !continued && chatId) {
            continued = true;
            const why = sendChat(base, chatId, "Continue the user's pending request now that this chat is in the new project. Use the conversation context; finish the task without asking the user to repeat it. If they only asked to switch projects, stop after acknowledging the switch.", null, board, emitChat, true);
            if (!why) return;
            emitChat({ t: "error", error: why });
          }
          try { ctl.enqueue(enc.encode(JSON.stringify(e) + "\n")); if (e.t === "done") ctl.close(); } catch {}
          // A turn often starts a run or edits the board's files.
          if (e.t === "done") changed();
        };
        const why = sendChat(base, id, text, typeof body.project === "string" ? body.project : null, board, emitChat, false, uploads);
        if (why) return bad(why, why === "no such chat" ? 404 : 409);
        return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
      }

      if (req.method === "POST") {
        if (!local(req)) return bad("cross-origin write refused", 403);
        let body: any;
        try { body = await req.json(); } catch { return bad("json body expected"); }

        // The Video page: a place by index, a video folder by name, both checked in video.ts.
        if (path.startsWith("/video/")) {
          const all = await videoPlaces();
          if (path === "/video/cancel") return video.cancelJob(Number(body.id)) ? json({ ok: true }) : bad("no such job", 404);
          // New video and Ask Claude: kaizen-video in a board terminal, in the place's folder.
          if (path === "/video/new" || path === "/video/ask") {
            const place = all[Number(body.p)];
            if (!place || !Number.isInteger(Number(body.p))) return bad("unknown place", 404);
            if (path === "/video/ask" && !video.okName(body.name)) return bad("unknown video", 404);
            const r = path === "/video/new" ? video.requestFor(place.dir, body) : video.askFor(place.dir, body.name, body.text);
            if ("error" in r) return bad(r.error);
            const name = "name" in r ? r.name : body.name as string;
            const launched = launchRun({ severity: null, where: null, text: r.text, raw: r.text }, place.dir, undefined,
              { skill: "kaizen-video", cwd: place.dir, card: true, onChange: changed });
            if (!launched.ok) return json({ ok: false, why: launched.why, manual: launched.manual }, 500);
            if (launched.pty) video.noteAgent(launched.pty, place.dir, name);
            changed();
            return json({ ok: true, name, pty: launched.pty ?? null, agent: launched.agent.name });
          }
          const place = all[Number(body.p)];
          if (!place || !Number.isInteger(Number(body.p)) || !video.okName(body.name)) return bad("unknown video", 404);
          if (path === "/video/save") {
            const err = video.saveFilm(place.dir, body.name, body.edits ?? [], body.platforms);
            if (err) return bad(err);
            const job = body.build === false ? null : video.startJob(place.dir, body.name, "build");
            changed();
            return json({ ok: true, job: typeof job === "string" ? null : { ...job, place: Number(body.p) }, note: typeof job === "string" ? job : null });
          }
          // Versions: revise, keep, revert, restore, delete (a version or one history revision), new.
          if (path === "/video/version") {
            const r = video.versionAction(place.dir, body.name, body);
            if ("error" in r) return bad(r.error);
            changed();
            const job = r.job;
            return json({ ok: true, job: job && typeof job !== "string" ? { ...job, place: Number(body.p) } : null, note: typeof job === "string" ? job : null });
          }
          // Delete a rendered version (deleteOutput checks it is one of this video's finished files).
          if (path === "/video/delete") {
            const err = video.deleteOutput(place.dir, body.name, body.file);
            if (err) return bad(err);
            changed();
            return json({ ok: true });
          }
          // A finished file to a device the last search found, or a chat Hermes listed.
          if (path === "/video/send") {
            const file = video.outputFile(place.dir, body.name, body.file);
            if (!file) return bad("not one of this video's finished files", 404);
            let err: string | null;
            if (body.via === "localsend") {
              const dev = devices.list.find((d) => d.fingerprint === body.to);
              if (!dev) return bad("that device is not in the last search; search again", 404);
              err = video.startSend(place.dir, body.name, { via: "localsend", to: dev.alias, file: body.file }, (step) => localsend.sendFile(dev, file, step));
            } else if (body.via === "whatsapp") {
              const chat = chats.find((c) => c.id === body.to);
              if (!chat) return bad("that chat is not in Hermes' list", 404);
              const text = typeof body.text === "string" ? body.text : "";
              const m = hermes.message(text, file);
              if (typeof m !== "string") return bad(m.error);
              err = video.startSend(place.dir, body.name, { via: "whatsapp", to: chat.name, file: body.file }, () => hermes.sendMedia(chat.id, text, file));
            } else return bad("send by localsend or whatsapp");
            if (err) return bad(err, 409);
            changed();
            return json({ ok: true });
          }
          if (path === "/video/job") {
            if (!["build", "preview", "render"].includes(body.kind)) return bad("unknown job");
            const formats = Array.isArray(body.formats) ? body.formats : video.formatsFor(Array.isArray(body.platforms) ? body.platforms : []);
            const job = video.startJob(place.dir, body.name, body.kind, formats);
            if (typeof job === "string") return bad(job, 409);
            changed();
            return json({ ok: true, job: { ...job, place: Number(body.p) } });
          }
          return bad("not found", 404);
        }

        // The same search as the TUI's "find more": every .kaizen under $HOME, the
        // drives, and where the board was started, added to the registry.
        // ponytail: synchronous walk, the board stalls for its length; move to a worker if a big disk makes that seconds.
        if (path === "/find") {
          const before = knownProjects().length;
          const roots = searchRoots([dirname(state ?? process.cwd()), process.cwd()]);
          for (const d of new Set(roots.flatMap((r) => findProjects(r)))) remember(d);
          changed();
          return json({ ok: true, added: knownProjects().length - before });
        }

        // A new, empty project: a folder in the projects folder (else ~/Projects), or
        // where the page names, set up at once. /find only sees folders that already
        // have a .kaizen, so a folder made by hand never shows there.
        if (path === "/new-project") {
          const r = await makeProject(typeof body.name === "string" ? body.name.trim() : "", typeof body.to === "string" ? body.to.trim() : "", !!body.check);
          return "error" in r ? bad(r.error, r.status) : json({ ok: true, ...r });
        }

        // Clone a GitHub repository into the projects folder (else ~/Projects) and
        // set it up as a project. Arguments go to git as an array: no shell.
        if (path === "/clone") {
          const link = typeof body.url === "string" ? body.url.trim() : "";
          const name = githubRepo(link);
          if (!name) return bad("paste a GitHub link: https://github.com/owner/repo or git@github.com:owner/repo.git");
          const root = (await projectsRoot()) || join(home, "Projects");
          // The page may name the folder: typed (~ allowed, relative to home) or picked.
          // A new one is made, parents too; an empty one is used; anything else refused.
          let to = join(root, name);
          if (typeof body.to === "string" && body.to.trim()) {
            const t = body.to.trim();
            to = resolve(home, nativePath(t.startsWith("~") ? home + t.slice(1) : t));
          }
          if (body.check) return json({ ok: true, to, name });
          let used = false;
          try { used = readdirSync(to).length > 0; } catch (e) { used = existsSync(to); }
          if (used) return bad(`${to} already exists and is not empty`, 409);
          mkdirSync(to, { recursive: true });
          const p = Bun.spawn(["git", "clone", "--", link, to], { stdin: "ignore", stdout: "ignore", stderr: "pipe", env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes" } });
          const [err, code] = await Promise.all([new Response(p.stderr).text(), p.exited]);
          if (code !== 0) return bad(err.trim().split("\n").filter(Boolean).pop() || "git clone failed", 500);
          mkdirSync(join(to, ".kaizen"), { recursive: true });
          remember(to);
          changed();
          return json({ ok: true, dir: join(to, ".kaizen") });
        }

        // No project here means the global inbox, which is where the TUI puts ideas too.
        const dir: string = body.dir ?? state ?? join(home, ".kaizen");
        // Choosing a folder from the projects folder is what sets it up: an empty
        // .kaizen, which the first run fills in. Only folders the board offered.
        if (path === "/cd" && dir === join(dirname(dir), ".kaizen") && (await fresh()).includes(dirname(dir))) {
          mkdirSync(dir, { recursive: true });
          remember(dirname(dir));
        }
        if (!dir || !states(true).includes(dir)) return bad("unknown state dir", 404);

        // Only checks the project: the page that picked it sends it back in x-kz-dir.
        if (path === "/cd") {
          changed();
          return json({ ok: true, project: label(dir) });
        }

        // "Not doing this" on a backlog card: the line is closed in place with the reason,
        // never removed, so a notebook link to it keeps its number.
        if (path === "/backlog") {
          if (body.op !== "reject") return bad("unknown op");
          const why = String(body.reason ?? "").trim();
          if (!why) return bad("a rejection needs a reason");
          const err = closeBacklog(dir, String(body.source ?? ""), Number(body.n), "rejected", why);
          if (err) return bad(err, err === "that item is already closed" ? 409 : 404);
          changed();
          return json({ ok: true });
        }

        if (path === "/inbox") {
          const text = String(body.text ?? "").trim();
          // Absent means untouched; an empty string clears. replaceIdea keeps the
          // old notes for any op that does not send them.
          const notes = typeof body.notes === "string" ? body.notes.trim() : undefined;
          if (body.op === "add") {
            if (!text) return bad("empty idea");
            writeInbox(dir, [...readInbox(dir), { status: "open", text, notes }]);
          } else if (body.op === "edit") {
            const next = String(body.next ?? "").trim();
            if (!text || !next) return bad("empty idea");
            replaceIdea(dir, text, notes === undefined ? { status: "open", text: next } : { status: "open", text: next, notes });
          } else if (body.op === "reject") {
            const why = String(body.reason ?? "").trim();
            if (!why) return bad("a rejection needs a reason");
            replaceIdea(dir, text, { status: "rejected", text: `${text} | ${why}` });
          } else if (body.op === "delete") {
            replaceIdea(dir, text, null);
          } else if (body.op === "move") {
            if (typeof body.to !== "string" || !states(true).includes(body.to)) return bad("unknown state dir", 404);
            const why = moveIdea(dir, body.to, text);
            if (why) return bad(why, why === "no such idea" ? 404 : 409);
          } else return bad("unknown op");
          changed();
          return json({ ok: true });
        }

        // Request sources. Gathering fills the icebox and nothing else: no idea is
        // made and no run starts here.
        if (path === "/sources") {
          // A social source arrives as a platform and what to follow; the link is built here.
          const link = body.op === "add" && typeof body.platform === "string" ? socialUrl(body.platform, String(body.query ?? "")) ?? "" : String(body.url ?? "").trim();
          if (body.op === "add" && typeof body.platform === "string" && !link) return bad("type a keyword, #hashtag or @account to follow");
          // A source belongs to the project the request names. The fallback above
          // (where the board started, or the global dir) is a guess, and a guess
          // here puts someone's requests in the wrong project.
          const named = typeof body.dir === "string" && body.dir !== "";
          try {
            let results;
            if (body.op === "gather" && !named && !link) {
              results = await gatherDirs(states(true));
              changed();
              return json({ ok: true, results });
            }
            if (!named) return bad(body.op === "add" ? "choose the project this source belongs to" : "say which project's source this is");
            if (body.op === "add") {
              const why = addSource(dir, link, typeof body.label === "string" ? body.label : undefined, typeof body.category === "string" ? body.category : undefined);
              if (why) return bad(why);
            } else if (body.op === "category") {
              const why = setCategory(dir, link, String(body.category ?? ""));
              if (why) return bad(why, 404);
            } else if (body.op === "writeback") {
              const why = setWriteback(dir, link, body.on === true);
              if (why) return bad(why, 404);
            } else if (body.op === "remove") {
              const why = removeSource(dir, link);
              if (why) return bad(why, 404);
            } else if (body.op === "move") {
              if (typeof body.to !== "string" || !states(true).includes(body.to)) return bad("unknown state dir", 404);
              const why = moveSource(dir, body.to, link);
              if (why) return bad(why, why === "no such source" ? 404 : 409);
            } else if (body.op === "agent") {
              // Kaizen's browser reads a social source's posts; the ChatGPT plan picks the
              // ones that fit when connected and chosen. Otherwise the agent opens on
              // /kaizen gather, in a terminal, since there is no card to run it in.
              if (await setting("sources.agent") === "chatgpt" && chatgpt.status().connected) {
                if (!readSources(dir).some((s) => s.url === link)) return bad("no such source", 404);
                results = [await chatgpt.gatherSource(dir, link, await setting("sources.model"), (await setting("sources.effort")) || "low")];
                changed();
                return json({ ok: true, via: "chatgpt", results });
              }
              if (dir === join(home, ".kaizen")) return bad("no project to gather in", 409);
              const r = launchRun({ severity: null, where: null, text: "gather", raw: "gather" }, dir);
              return json(r.ok ? { ok: true, agent: r.agent } : { ok: false, why: r.why, manual: r.manual, agent: r.agent }, r.ok ? 200 : 500);
            } else if (body.op === "gather") {
              if (link && !readSources(dir).some((s) => s.url === link)) return bad("no such source", 404);
              results = link ? [await gatherSource(dir, link)] : await gatherAll(dir);
            } else return bad("unknown op");
            changed();
            return json({ ok: true, sources: readSources(dir).map(({ seen, ...s }) => s), results });
          } catch (e) { return bad((e as Error).message, 500); }
        }

        // Files added with a hand-written icebox item: saved beside the state, linked in its notes.
        const iceFiles = (state: string, files: unknown) => {
          const fs: { name: string; data: string }[] = Array.isArray(files) ? files : [];
          if (fs.reduce((t, f) => t + (f.data?.length ?? 0), 0) > 400_000_000) throw new Error("attachments over 300MB");
          return fs.map((f) => {
            const rel = saveAttachment(state, null, String(f.name ?? "file"), Buffer.from(String(f.data).replace(/^data:[^,]*,/, ""), "base64"));
            return (/\.(png|jpe?g|gif|webp|svg)$/i.test(rel) ? "!" : "") + `[${String(f.name ?? "file")}](${rel})`;
          });
        };
        // The icebox: the only way gathered text becomes an idea, one explicit click
        // (or agent call) at a time. An idea is made; no run starts.
        if (path === "/icebox") {
          if (typeof body.dir !== "string" || !states(true).includes(body.dir)) return bad("say which project's icebox this is");
          const ids = Array.isArray(body.ids) ? body.ids.filter((i: unknown) => typeof i === "string") : [];
          try {
            const why = body.op === "promote" ? promote(body.dir, ids, typeof body.text === "string" ? body.text : undefined, typeof body.details === "string" ? body.details : undefined)
              : body.op === "add" ? addItem(body.dir, typeof body.text === "string" ? body.text : "", [typeof body.details === "string" ? body.details : "", ...iceFiles(body.dir, body.files)].filter(Boolean).join("\n"))
              : body.op === "dismiss" ? dismiss(body.dir, ids) : body.op === "restore" ? restore(body.dir, ids) : "unknown op";
            if (why) return bad(why, why === "no such item" ? 404 : why === "unknown op" ? 400 : 409);
          } catch (e) { return bad((e as Error).message, 500); }
          changed();
          return json({ ok: true });
        }

        // A reply to a gathered post. `draft` only writes text for the user to read; only
        // `send`, carrying the text they approved, posts anything, once per item.
        if (path === "/reply") {
          if (typeof body.dir !== "string" || !states(true).includes(body.dir)) return bad("say which project's icebox this is");
          const it = readIcebox(body.dir).find((s) => s.id === body.id);
          if (!it) return bad("no such item", 404);
          const link = postLink(it.notes);
          if (!link) return bad("this item is not a social post");
          if (body.op === "draft") {
            if (!chatgpt.status().connected) return json({ ok: true, text: "", note: "Connect ChatGPT to get a draft, or write the reply yourself." });
            const style = typeof body.style === "string" && Object.hasOwn(chatgpt.REPLY_STYLES, body.style) ? body.style : "casual";
            const avoid = typeof body.avoid === "string" ? body.avoid.slice(0, 600) : "";
            const d = await chatgpt.draftReply(body.dir, it.text, await setting("sources.model"), (await setting("sources.effort")) || "low", style, avoid);
            return json(d.ok ? d : { ok: true, text: "", note: d.note });
          }
          if (body.op !== "send") return bad("unknown op");
          const text = typeof body.text === "string" ? body.text.trim() : "";
          if (!text) return bad("write the reply first");
          if (text.length > 2000) return bad("the reply is too long");
          if (it.replied) return bad("already replied", 409);
          const key = body.dir + " " + it.id;
          if (replying.has(key)) return bad("already sending", 409);
          replying.add(key);
          try {
            const r = await sendReply(link, text);
            // Pressed send counts as sent, confirmed or not: a second press could post twice.
            if (r.ok || r.sent) { markReplied(body.dir, it.id); changed(); }
            return json(r.ok ? { ok: true } : { ok: false, why: r.note, sent: !!r.sent }, r.ok ? 200 : 502);
          } finally { replying.delete(key); }
        }

        if (path === "/run") {
          const text = String(body.text ?? "").trim();
          const kind = body.kind === "full" || body.kind === "lite" ? body.kind : "";
          if (!text && !body.backlog) return bad("empty idea");
          const agent = typeof body.agent === "string" && body.agent ? body.agent : undefined;
          if (agent && !KNOWN_AGENTS.some((a) => a.cmd === agent)) return bad("unknown agent");
          const model = typeof body.model === "string" ? body.model.trim() : "";
          if (model && !plainModel(model)) return bad("A model name is letters, digits and . : / @ _ - only");
          // A backlog item runs as an idea would, its text read here from the file, never
          // from the page. The request names its source, which is how the board finds the
          // line again: to hide the card while the run lives, and to close it when done.
          if (body.backlog) {
            const source = String(body.backlog.source ?? ""), n = Number(body.backlog.n);
            const line = backlogItem(dir, source, n);
            if (!line) return bad("no such backlog item", 404);
            if (line.status !== "open") return bad("that item is already closed", 409);
            if ((startedBacklog(dir).get(`${source}#${n}`) ?? []).some((c) => c.stage !== "abandoned")) return bad("a run was already started from that item", 409);
            const p = parseItem(line.text);
            const it: Item = { ...p, text: kind ? `${kind} ${p.text}` : p.text };
            it.notes = [source !== "orphan" ? `Parent: ${source}` : "", `Backlog: ${source}#${n}`, p.text !== line.text ? `Backlog item: ${line.text}` : ""].filter(Boolean).join("\n");
            const r = launchRun(it, dir, undefined, { agent, model: model || undefined, yolo: body.yolo === true, ...inCard(dir) });
            if (r.ok) backlogLaunched.add(`${dir}\0${source}#${n}`);
            changed();
            return json(r.ok
              ? { ok: true, agent: r.agent, project: tilde(r.projectDir), pty: r.pty }
              : { ok: false, why: r.why, manual: r.manual, agent: r.agent }, r.ok ? 200 : 500);
          }
          const it: Item = parseItem(`${kind} ${text}`.trim());
          // A `started` idea may be run again: the terminal the first launch opened
          // can come up empty, and nothing else tells the board a run never began.
          it.notes = readInbox(dir).find((l) => (l.status === "open" || l.status === "started") && l.text === text)?.notes;
          const r = launchRun(it, dir, undefined, { agent, model: model || undefined, yolo: body.yolo === true, ...inCard(dir) });
          if (r.ok) replaceIdea(dir, text, { status: "started", text });
          if (r.ok && r.pty) {
            for (const [k, v] of ideaPty) if (!ptyState(v)) ideaPty.delete(k);   // sessions already dropped
            ideaPty.set(`${dir}\0${text}`, r.pty);
          }
          changed();
          return json(r.ok
            ? { ok: true, agent: r.agent, project: tilde(r.projectDir), pty: r.pty }
            : { ok: false, why: r.why, manual: r.manual, agent: r.agent }, r.ok ? 200 : 500);
        }

        // Archive is a list beside the runs, never a move: a run keeps its directory
        // and its state, and the board simply stops showing it.
        if (path === "/archive") {
          const archived = body.archived !== false;
          if (typeof body.id === "string") {
            if (!/^[\w.-]+$/.test(body.id)) return bad("bad run id");
            setArchived(dir, body.id, archived);
          } else if (typeof body.text === "string") {
            const text = body.text.trim();
            const lines = readInbox(dir);
            const at = lines.findIndex((l) => l.text === text && (archived ? l.status === "open" : l.status === "archived"));
            if (at < 0) return bad("no such idea", 404);
            lines[at] = { ...lines[at]!, status: archived ? "archived" : "open" };
            writeInbox(dir, lines);
          } else return bad("id or text required");
          changed();
          return json({ ok: true });
        }

        // One chat message: text plus files (base64), each file saved and linked
        // from the message so the note carries its own attachments.
        if (path === "/note") {
          const id = typeof body.id === "string" ? body.id : null;
          if (id !== null && !/^[\w.-]+$/.test(id)) return bad("bad run id");
          const text = typeof body.text === "string" ? body.text.trim() : "";
          const files: { name: string; data: string }[] = Array.isArray(body.files) ? body.files : [];
          let total = 0;
          for (const f of files) total += (f.data?.length ?? 0);
          if (total > 400_000_000) return bad("attachments over 300MB");
          const links = files.map((f) => {
            const bytes = Buffer.from(String(f.data).replace(/^data:[^,]*,/, ""), "base64");
            const rel = saveAttachment(dir, id, String(f.name ?? "file"), bytes).replace(/\\/g, "/");
            return (/\.(png|jpe?g|gif|webp|svg)$/i.test(rel) ? "!" : "") + `[${String(f.name ?? "file")}](${rel.replace(/^runs\/[^/]+\//, "")})`;
          });
          const note = [text, ...links].filter(Boolean).join("\n");
          const failed = appendNote(dir, id !== null ? { id } : { text: String(body.for ?? "").trim() }, note);
          changed();
          return failed ? bad(failed, 404) : json({ ok: true });
        }

        if (path === "/notes") {
          const id = String(body.id ?? "");
          if (!/^[\w.-]+$/.test(id)) return bad("bad run id");
          const failed = writeNotes(dir, id, String(body.text ?? ""));
          changed();
          return failed ? bad(failed, 404) : json({ ok: true });
        }

        // A save names the mtime it loaded; a different one on disk is a 409 carrying
        // what is there, so the page can keep the typed text and let the user choose.
        if (path === "/vault") {
          if (body.op === "save") {
            if (typeof body.text !== "string") return bad("text required");
            const r = saveNote(dir, body.name, body.text, Number(body.base) || 0);
            changed();
            return r.ok ? json(r) : r.why === "conflict" ? json(r, 409) : bad(r.why);
          }
          const why = body.op === "rename" ? renameNote(dir, body.name, body.to)
            : body.op === "delete" ? deleteNote(dir, body.name) : "unknown op";
          changed();
          return why ? bad(why, why === "no such note" ? 404 : why === "a note with that name exists" ? 409 : 400) : json({ ok: true });
        }

        // Only a finished run, or one waiting at the final approval, and never the
        // global state dir: $HOME may be a repository, and it is not the run's project.
        if (path === "/commit") {
          const id = String(body.id ?? "");
          if (!/^[\w.-]+$/.test(id)) return bad("bad run id");
          if (dir === join(home, ".kaizen")) return bad("no project to commit", 409);
          let run: any;
          try { run = JSON.parse(readText(join(dir, "runs", id, "state.json"))); } catch { return bad("no such run", 404); }
          if (run.stage !== "done" && run.awaiting !== "approvals.review") return bad("this run is not finished", 409);
          const r = await commitPush(dir, id, String(body.message ?? ""), Array.isArray(body.files) ? body.files.map(String) : []);
          changed();
          return json(r, r.ok ? 200 : 409);
        }

        // Fix picked findings, on the same runs /commit takes and for the same reason
        // never in the global state dir: the agent starts in a project, and the run is
        // not there. Only numbers the review itself holds reach the prompt.
        if (path === "/fix") {
          const id = String(body.id ?? "");
          if (!/^[\w.-]+$/.test(id)) return bad("bad run id");
          if (dir === join(home, ".kaizen")) return bad("no project to fix in", 409);
          let run: any;
          try { run = JSON.parse(readText(join(dir, "runs", id, "state.json"))); } catch { return bad("no such run", 404); }
          if (run.stage !== "done" && run.awaiting !== "approvals.review" && run.awaiting !== "findings") return bad("this run is still being worked on", 409);
          const nums = pickFindings(dir, id, body.nums);
          if (!nums) return bad("pick open findings of this review");
          const text = fixPrompt(id, nums);
          // The run's conversation picks the fix up, and once that window is open the
          // waiting one ends. A failed launch leaves it: the decision has nowhere else.
          const before = Date.now();
          const r = launchRun({ severity: null, where: null, text, raw: text }, dir, id, inCard(dir));
          if (r.ok) closeSessions(dir, id, { before });
          changed();
          return json(r.ok
            ? { ok: true, agent: r.agent, pty: r.pty }
            : { ok: false, why: r.why, manual: r.manual, agent: r.agent }, r.ok ? 200 : 500);
        }

        // Approve or send back what a run is waiting on, from its panel. The page names
        // the approval it saw: one already answered elsewhere is not answered twice.
        if (path === "/decide") {
          const id = String(body.id ?? "");
          if (!/^[\w.-]+$/.test(id)) return bad("bad run id");
          if (dir === join(home, ".kaizen")) return bad("no project to run in", 409);
          let run: any;
          try { run = JSON.parse(readText(join(dir, "runs", id, "state.json"))); } catch { return bad("no such run", 404); }
          if (!canApproveAwaiting(run.awaiting) || run.awaiting !== body.awaiting) return bad("this run is not waiting on that approval", 409);
          if (run.awaiting === "findings" && body.why !== undefined) return bad("open findings can only be approved as-is or fixed individually", 409);
          if (body.why !== undefined && !String(body.why).trim()) return bad("a revise needs a comment");
          const answers = body.answers;
          if (answers !== undefined && (run.awaiting !== "approvals.plan" || body.why !== undefined || !Array.isArray(answers)
            || !answers.length || answers.length > 20 || answers.some((a: unknown) => typeof a !== "string" || !a.trim()))) return bad("bad answers");
          const text = approvalPrompt(id, run.awaiting, body.why === undefined ? undefined : String(body.why), answers);
          // The run is stopped at this approval, so its window is idle: the same
          // conversation continues in one new window, and then the idle one ends. A
          // failed launch leaves it open, since the decision went nowhere.
          const before = Date.now();
          const r = launchRun({ severity: null, where: null, text, raw: text }, dir, id, inCard(dir));
          if (r.ok) closeSessions(dir, id, { before });
          changed();
          return json(r.ok
            ? { ok: true, agent: r.agent, pty: r.pty }
            : { ok: false, why: r.why, manual: r.manual, agent: r.agent }, r.ok ? 200 : 500);
        }

        // Start a run's agent again after it ended mid-stage (resumeRun).
        if (path === "/resume") {
          const id = String(body.id ?? "");
          if (!/^[\w.-]+$/.test(id)) return bad("bad run id");
          if (dir === join(home, ".kaizen")) return bad("no project to run in", 409);
          const r = resumeRun(dir, id);
          if ("error" in r) return bad(r.error, r.status);
          return json(r.ok
            ? { ok: true, agent: r.agent, pty: r.pty }
            : { ok: false, why: r.why, manual: r.manual, agent: r.agent }, r.ok ? 200 : 500);
        }

        if (path === "/to-idea") {
          const id = String(body.id ?? "");
          if (!/^[\w.-]+$/.test(id)) return bad("bad run id");
          const failed = runToIdea(dir, id);
          changed();
          return failed ? bad(failed, 409) : json({ ok: true });
        }

        if (path === "/abort") {
          const id = String(body.id ?? "");
          const why = String(body.why ?? "").trim() || "abandoned from the web board";
          if (!/^[\w.-]+$/.test(id)) return bad("bad run id");
          const failed = abandonRun(dir, id, why);
          changed();
          return failed ? bad(failed, 409) : json({ ok: true });
        }
      }

      return new Response("not found", { status: 404 });
    },
  }); }

  // Read once and removed first, so a board that fails to start one does not retry it
  // forever. A list older than an hour is from an upgrade whose board never came back
  // (a failed Windows hand-off): too late to pick its runs up unasked.
  if (existsSync(RESUME_LIST)) {
    let saved: { at?: number; list?: { dir: string; key: string; run: string | null }[] } = {};
    try { saved = JSON.parse(readText(RESUME_LIST)); } catch { /* unreadable: nothing to resume */ }
    rmSync(RESUME_LIST, { force: true });
    const done = new Set<string>();
    for (const { dir, key, run } of Date.now() - (saved.at ?? 0) < 3600_000 ? saved.list ?? [] : []) {
      const s = run ? null : readSessions(dir).find((x) => x.key === key);
      const id = run ?? (s ? ownerOf(dir, s) : null);
      if (!id || done.has(`${dir}\0${id}`)) continue;
      done.add(`${dir}\0${id}`);
      const r = resumeRun(dir, id);
      console.log(`  ${"error" in r || !r.ok ? "could not resume" : "resumed"} ${id}${"error" in r ? ` (${r.error})` : !r.ok ? ` (${r.why})` : ""}`);
    }
  }

  const url = `http://127.0.0.1:${server.port}/`;
  console.log(`\n  kaizen web  ${url}`);
  console.log(`  ${boardState ? `project  ${label(boardState)}` : "no .kaizen here; showing every known project"}`);
  console.log(`  ctrl-c to stop\n`);
  if (opts.open !== false) await openApp(url);

  await new Promise<void>((resolve) => {
    const stop = () => { clearInterval(poll); clearInterval(ping); clearInterval(gather); clearInterval(loop); for (const w of watchers) { try { w.close(); } catch { /* gone */ } } server.stop(true); resolve(); };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

// A Chromium-family browser in --app mode is a window with no tabs or address bar,
// which is as close to a desktop app as a web page gets. Anything else gets a tab.
// A profile folder gives the window a browser instance of its own (Kaizen Bot's app);
// on macOS that takes -n, as `open` otherwise hands the args to a running browser.
export async function openApp(url: string, profile?: string) {
  // Kaizen Bot's window (a profile) is always an app; the board asks the setting.
  if (!profile) {
    const { listSettings } = await import("./settings.ts");
    if (listSettings(join(import.meta.dir, "..")).rows.find((r) => r.key === "board.open")?.value !== "app") return openDefault(url);
  }
  const args = [`--app=${url}`, ...(profile ? [`--user-data-dir=${profile}`] : [])];
  const chromes = process.platform === "darwin"
    ? ["Google Chrome", "Chromium", "Microsoft Edge", "Brave Browser"]
    : process.platform === "win32"
      ? ["chrome.exe", "msedge.exe", "chromium.exe", "brave.exe"]
      : ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "microsoft-edge", "brave", "brave-browser"];
  try {
    if (process.platform === "darwin") {
      for (const app of chromes) {
        const r = await Bun.$`open ${profile ? "-na" : "-a"} ${app} --args ${args}`.quiet().nothrow();
        if (r.exitCode === 0) return true;
      }
    } else {
      for (const bin of chromes) {
        const found = Bun.which(bin) ?? (process.platform === "win32" ? winChrome(bin) : null);
        if (!found) continue;
        Bun.spawn([found, ...args], { stdin: "ignore", stdout: "ignore", stderr: "ignore", detached: true }).unref();
        return true;
      }
    }
  } catch { /* fall through to a plain tab */ }
  return openDefault(url);
}

async function openDefault(url: string) {
  // `start` is a cmd builtin, not a program, so it has to go through cmd.
  if (process.platform === "win32") {
    try { await Bun.$`${cmdExe()} /c start "" ${url}`.quiet(); return true; } catch { return false; }
  }
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  if (!Bun.which(opener)) return false;
  try { await Bun.$`${opener} ${url}`.quiet(); return true; } catch { return false; }
}

// Windows keeps browsers out of PATH; the usual install roots are the next best guess.
// One dialog at a time: a second click while one is open would stack another.
let picking = false;
// One `kaizen upgrade` at a time, from any page.
let upgrading = false;
// What a Windows hand-off upgrade said (see POST /upgrade). Read once at start: no
// "Upgraded" or "Up to date" line means it failed, and its last lines say why.
const UPGRADE_LOG = join(home, ".kaizen", "upgrade.log");
const upgradeFailed = (() => {
  if (!existsSync(UPGRADE_LOG)) return null;
  const lines = readText(UPGRADE_LOG).replace(/\x1b\[[0-9;]*m/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  try { rmSync(UPGRADE_LOG, { force: true }); } catch { /* shown again next start */ }
  if (lines.some((l) => /^(Upgraded|Up to date)\b/.test(l))) return null;
  // "kept ~/kaizen (in use …)" is the reason when there is one; else the closing lines.
  const kept = lines.find((l) => /^\+?\s*kept\b/.test(l));
  return kept?.replace(/^\+\s*/, "") ?? (lines.filter((l) => !l.startsWith("+")).slice(-2).join(" — ") || "kaizen upgrade said nothing");
})();

// The system folder picker for this platform, printing the chosen path on stdout.
// macOS and Windows always have one; on Linux it is whichever desktop tool exists.
export function folderDialog(platform: string = process.platform): string[] | null {
  const prompt = "Choose your projects folder";
  // osascript is a background process: without `activate` its dialog can open behind
  // the browser. Plain `activate` targets osascript itself, so no Automation prompt.
  if (platform === "darwin") return ["osascript", "-e", "activate", "-e", `POSIX path of (choose folder with prompt "${prompt}")`];
  if (platform === "win32") {
    // An owner form kept on top, or the dialog opens behind the browser.
    const ps = `[Console]::OutputEncoding=[Text.Encoding]::UTF8;Add-Type -AssemblyName System.Windows.Forms;`
      + `$o=New-Object System.Windows.Forms.Form -Property @{TopMost=$true};$d=New-Object System.Windows.Forms.FolderBrowserDialog;`
      + `$d.Description='${prompt}';if($d.ShowDialog($o) -eq 'OK'){[Console]::Out.Write($d.SelectedPath)}`;
    return [powershellExe(), "-NoProfile", "-STA", "-Command", ps];
  }
  const zenity = Bun.which("zenity", { PATH: process.env.PATH });
  if (zenity) return [zenity, "--file-selection", "--directory", `--title=${prompt}`];
  const kdialog = Bun.which("kdialog", { PATH: process.env.PATH });
  return kdialog ? [kdialog, "--getexistingdirectory", home, "--title", prompt] : null;
}

function winChrome(exe: string) {
  const roots = [process.env["ProgramFiles"], process.env["ProgramFiles(x86)"], process.env["LOCALAPPDATA"]].filter(Boolean) as string[];
  const sub: Record<string, string> = {
    "chrome.exe": "Google\\Chrome\\Application\\chrome.exe",
    "msedge.exe": "Microsoft\\Edge\\Application\\msedge.exe",
    "chromium.exe": "Chromium\\Application\\chrome.exe",
    "brave.exe": "BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  };
  for (const r of roots) { const p = join(r, sub[exe] ?? exe); if (existsSync(p)) return p; }
  return null;
}

// `kaizen web --shortcut`: a launcher the OS can find — Spotlight on macOS, the app
// menu / super-space on Linux, the Desktop on Windows. Each one runs `kaizen web` with
// the bun and script that ran this command, so it works for a git checkout and a
// bunx install alike.
export async function shortcut() {
  const bun = process.execPath;
  const script = Bun.argv[1]!;
  const icon = LOGO;
  const hasIcon = existsSync(icon);
  const { mkdirSync, writeFileSync, chmodSync } = await import("node:fs");

  if (process.platform === "darwin") {
    const app = join(home, "Applications", "Kaizen.app", "Contents");
    mkdirSync(join(app, "MacOS"), { recursive: true });
    writeFileSync(join(app, "MacOS", "kaizen"), `#!/bin/sh\nexec ${q(bun)} ${q(script)} web --daemon\n`);
    chmodSync(join(app, "MacOS", "kaizen"), 0o755);
    writeFileSync(join(app, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Kaizen</string>
  <key>CFBundleIdentifier</key><string>dev.kaizen.web</string>
  <key>CFBundleExecutable</key><string>kaizen</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
</dict></plist>
`);
    return `${tilde(join(home, "Applications", "Kaizen.app"))} — Spotlight finds it once indexed`;
  }

  if (process.platform === "win32") {
    // bun.exe is a console program, so a .lnk aimed straight at it always opens a
    // console window. The shortcut therefore aims at wscript, whose Run with window
    // style 0 starts `kaizen web --daemon` with no window at all; the daemon outlives
    // that launcher and `kaizen web --stop` ends it. A crash has no console to land
    // in, so web() writes it to ~/.kaizen/web.log instead. A .lnk icon must be an .ico.
    // OneDrive moves the Desktop (C:\Users\x\OneDrive\Desktop), so ask Windows for it.
    const desk = (await Bun.$`${powershellExe()} -NoProfile -Command [Environment]::GetFolderPath('Desktop')`.quiet().nothrow().text()).trim();
    const lnk = join(desk || join(home, "Desktop"), "Kaizen.lnk");
    const ico = join(dirname(import.meta.dir), "assets", "kaizen.ico");
    const vbs = join(home, ".kaizen", "kaizen-web.vbs");
    mkdirSync(dirname(vbs), { recursive: true });
    const vq = (s: string) => `""${s}""`;                       // a quoted arg inside a VBScript string
    writeFileSync(vbs, `CreateObject("WScript.Shell").Run "${vq(bun)} ${vq(script)} web --daemon", 0, False\r\n`);
    const ps = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${lnk}');$s.TargetPath='${sysExe("wscript.exe")}';$s.Arguments='"${vbs}"';$s.WorkingDirectory='${home}';${existsSync(ico) ? `$s.IconLocation='${ico}';` : ""}$s.Save()`;
    await Bun.$`${powershellExe()} -NoProfile -Command ${ps}`.quiet();
    return `${lnk} — double-click starts the board in the background and opens it; kaizen web --stop ends it`;
  }

  const dir = join(process.env["XDG_DATA_HOME"] ?? join(home, ".local", "share"), "applications");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "kaizen.desktop");
  writeFileSync(file, `[Desktop Entry]
Type=Application
Name=Kaizen
Comment=Kaizen board
Exec=${q(bun)} ${q(script)} web --daemon
${hasIcon ? `Icon=${icon}\n` : ""}Terminal=false
Categories=Development;
`);
  return tilde(file);
}

const q = (s: string) => (/[\s"']/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
