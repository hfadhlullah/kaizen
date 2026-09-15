// `kaizen web`: the board in a browser. A loopback HTTP server over state.ts and
// one HTML page; the page never sees the filesystem, only JSON.
import { existsSync, readFileSync, readdirSync, statSync, watch, type FSWatcher } from "node:fs";
import { join, dirname } from "node:path";
import {
  home, type Item, boardCards, knownProjects, remember, locate, label, tilde,
  readInbox, writeInbox, replaceIdea, abandonRun, launchRun, parseItem, short, setArchived, writeNotes,
  appendNote, saveAttachment,
} from "./state.ts";

const PAGE = join(dirname(import.meta.dir), "web", "board.html");
const DEFAULT_PORT = 7420;

type Opts = { port?: number; open?: boolean };

export async function web(repoDir: string, opts: Opts = {}) {
  const state = locate();
  if (state && dirname(state) !== home) remember(dirname(state));
  const project = state ? label(state) : null;

  const states = (all: boolean) => (all || !state
    ? [...knownProjects().map((d) => join(d, ".kaizen")), join(home, ".kaizen")]
    : [state]
  ).filter((d, i, arr) => arr.indexOf(d) === i && existsSync(d));

  // Any tab on this machine can reach loopback. GET only reads the user's own
  // files, but a POST from a page on the wider web must not write them.
  const local = (req: Request) => {
    const origin = req.headers.get("origin");
    if (!origin) return true;                      // curl, same-origin fetch on old browsers
    try {
      const h = new URL(origin).hostname;
      return h === "127.0.0.1" || h === "localhost" || h === "[::1]" || h === "::1";
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
  // Dev: the page reloads itself when board.html is saved. Server code needs
  // `bun --watch cli/install.ts web`; the page reconnects and reloads on hello.
  try { watch(PAGE, () => { for (const c of clients) { try { c.enqueue("data: reload\n\n"); } catch { clients.delete(c); } } }); } catch { /* no dev reload */ }
  const watchers: FSWatcher[] = [];
  const watchAll = () => {
    for (const w of watchers) { try { w.close(); } catch { /* gone */ } }
    watchers.length = 0;
    for (const dir of states(true)) {
      try { watchers.push(watch(dir, { recursive: true }, changed)); } catch { /* poll covers it */ }
    }
  };
  watchAll();
  // The poll only speaks when something moved: a board reloading every two
  // seconds for nothing is worse than no fallback at all.
  const fingerprint = () => {
    let sum = 0;
    for (const dir of states(true)) {
      for (const f of ["inbox.md", "backlog.md", "archive.md"]) { try { sum += statSync(join(dir, f)).mtimeMs; } catch { /* absent */ } }
      const runs = join(dir, "runs");
      if (!existsSync(runs)) continue;
      for (const id of readdirSync(runs)) { try { sum += statSync(join(runs, id, "state.json")).mtimeMs; } catch { /* absent */ } }
    }
    return sum;
  };
  let last = fingerprint();
  let seen = states(true).join("\n");
  const poll = setInterval(() => {
    // A project registered since start (a run launched into a fresh dir) gets a watcher too.
    const now = states(true).join("\n"); if (now !== seen) { seen = now; watchAll(); }
    const fp = fingerprint(); if (fp !== last) { last = fp; changed(); }
  }, 2000);

  const BOOT = Date.now().toString(36);
  const ping = setInterval(() => { for (const c of clients) { try { c.enqueue(": ping\n\n"); } catch { clients.delete(c); } } }, 8000);
  // A launcher clicked while a board is already up should show that board, not die.
  const port = opts.port ?? DEFAULT_PORT;
  const server = (() => { try { return serve(); } catch (e) {
    if ((e as { code?: string }).code !== "EADDRINUSE") throw e;
    return null;
  } })();
  if (!server) { const url = `http://127.0.0.1:${port}/`; console.log(`\n  kaizen web already at ${url}\n`); if (opts.open !== false) await openApp(url); return; }

  function serve() { return Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(req) {
      // Host first: a hostname rebound to 127.0.0.1 by an attacker's DNS still
      // arrives with that hostname in Host, and gets nothing.
      const hostname = (req.headers.get("host") ?? "").replace(/:\d+$/, "");
      if (hostname !== "127.0.0.1" && hostname !== "localhost") return new Response("forbidden", { status: 403 });
      const url = new URL(req.url);
      const path = url.pathname;

      if (req.method === "GET" && path === "/") {
        if (!existsSync(PAGE)) return new Response("web/board.html missing", { status: 500 });
        return new Response(readFileSync(PAGE), {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      }

      if (req.method === "GET" && path === "/state") {
        const all = url.searchParams.get("all") === "1";
        const dirs = states(all);
        return json({
          project, all,
          projects: states(true).map((d) => ({ dir: d, label: label(d) })),
          cards: boardCards(dirs, Date.now()),
          now: Date.now(),
        });
      }

      if (req.method === "GET" && path.startsWith("/run/")) {
        const id = decodeURIComponent(path.slice(5));
        const dir = url.searchParams.get("dir") ?? state;
        if (!dir || !states(true).includes(dir) || !/^[\w.-]+$/.test(id)) return bad("no such run", 404);
        const base = join(dir, "runs", id);
        if (!existsSync(base)) return bad("no such run", 404);
        const read = (f: string) => existsSync(join(base, f)) ? readFileSync(join(base, f), "utf8") : null;
        return json({
          id, short: short(id), state: read("state.json"),
          request: read("00-request.md"), plan: read("01-plan.md"), approval: read("02-approval.md"),
          impl: read("03-impl.md"), review: read("04-review.md"), backlog: read("06-backlog.md"),
          notes: read("notes.md"),
        });
      }

      if (req.method === "GET" && path === "/settings") {
        const { listSettings } = await import("./settings.ts");
        return json(listSettings(repoDir));
      }

      if (req.method === "POST" && path === "/settings") {
        if (!local(req)) return bad("cross-origin write refused", 403);
        let body: any;
        try { body = await req.json(); } catch { return bad("json body expected"); }
        const { setSetting } = await import("./settings.ts");
        const r = setSetting(repoDir, String(body.key ?? ""), String(body.value ?? ""));
        return "error" in r ? bad(r.error) : json(r);
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
        return new Response(Bun.file(f), { headers: { "cache-control": "private, max-age=3600" } });
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

      if (req.method === "POST") {
        if (!local(req)) return bad("cross-origin write refused", 403);
        let body: any;
        try { body = await req.json(); } catch { return bad("json body expected"); }
        // No project here means the global inbox, which is where the TUI puts ideas too.
        const dir: string = body.dir ?? state ?? join(home, ".kaizen");
        if (!dir || !states(true).includes(dir)) return bad("unknown state dir", 404);

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
          } else return bad("unknown op");
          changed();
          return json({ ok: true });
        }

        if (path === "/run") {
          const text = String(body.text ?? "").trim();
          const kind = body.kind === "full" || body.kind === "lite" ? body.kind : "";
          if (!text) return bad("empty idea");
          const it: Item = parseItem(`${kind} ${text}`.trim());
          it.notes = readInbox(dir).find((l) => l.status === "open" && l.text === text)?.notes;
          const r = launchRun(it, dir);
          if (r.ok) replaceIdea(dir, text, { status: "started", text });
          changed();
          return json(r.ok
            ? { ok: true, agent: r.agent, project: tilde(r.projectDir) }
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
          if (total > 20_000_000) return bad("attachments over 15MB");
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

  const url = `http://127.0.0.1:${server.port}/`;
  console.log(`\n  kaizen web  ${url}`);
  console.log(`  ${project ? `project  ${project}` : "no .kaizen here; showing every known project"}`);
  console.log(`  ctrl-c to stop\n`);
  if (opts.open !== false) await openApp(url);

  await new Promise<void>((resolve) => {
    const stop = () => { clearInterval(poll); clearInterval(ping); for (const w of watchers) { try { w.close(); } catch { /* gone */ } } server.stop(true); resolve(); };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

// A Chromium-family browser in --app mode is a window with no tabs or address bar,
// which is as close to a desktop app as a web page gets. Anything else gets a tab.
async function openApp(url: string) {
  const chromes = process.platform === "darwin"
    ? ["Google Chrome", "Chromium", "Microsoft Edge", "Brave Browser"]
    : process.platform === "win32"
      ? ["chrome.exe", "msedge.exe", "chromium.exe", "brave.exe"]
      : ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "microsoft-edge", "brave", "brave-browser"];
  try {
    if (process.platform === "darwin") {
      for (const app of chromes) {
        const r = await Bun.$`open -a ${app} --args --app=${url}`.quiet().nothrow();
        if (r.exitCode === 0) return true;
      }
    } else {
      for (const bin of chromes) {
        const found = Bun.which(bin) ?? (process.platform === "win32" ? winChrome(bin) : null);
        if (!found) continue;
        Bun.spawn([found, `--app=${url}`], { stdin: "ignore", stdout: "ignore", stderr: "ignore", detached: true }).unref();
        return true;
      }
    }
  } catch { /* fall through to a plain tab */ }
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  if (!Bun.which(opener)) return false;
  try { await Bun.$`${opener} ${url}`.quiet(); return true; } catch { return false; }
}

// Windows keeps browsers out of PATH; the usual install roots are the next best guess.
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
  const icon = join(dirname(import.meta.dir), "assets", "kaizen-logo.png");
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
    const lnk = join(home, "Desktop", "Kaizen.lnk");
    const ps = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${lnk}');$s.TargetPath='${bun}';$s.Arguments='"${script}" web --daemon';$s.WorkingDirectory='${home}';${hasIcon ? `$s.IconLocation='${icon}';` : ""}$s.Save()`;
    await Bun.$`powershell -NoProfile -Command ${ps}`.quiet();
    return lnk;
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
