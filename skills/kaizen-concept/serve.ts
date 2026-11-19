#!/usr/bin/env bun
// The review server for kaizen-concept: serves the project folder (the pick page, themes, prototypes) and saves the
// user's reference picks, so pressing Done on the pick page hands them to the agent with no copy and paste.
//   bun serve.ts [project folder] [--port 8780]
// POST /api/picks {liked:[{n,name,note}], avoid:[{n,name,note}], notes, themes, skills}
//   -> .preview/references/picks.md (what the agent reads) and picks.json. Local only: binds 127.0.0.1,
// answers only Host 127.0.0.1/localhost on its own port, takes picks only as JSON from its own page, and serves only
// .preview/ (never .env, .git or the rest of the project), with symlinks resolved before the check.
import { mkdirSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const args = Bun.argv.slice(2);
const portAt = args.indexOf("--port");
const port = portAt >= 0 ? Number(args[portAt + 1]) : 8780;
const root = resolve(args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--port") ?? ".");
const picksDir = join(root, ".preview", "references");
const webRoot = join(root, ".preview");
const ownHost = (h: string | null) => h === `127.0.0.1:${port}` || h === `localhost:${port}`;

const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\0-\x1f\x7f]/g, " ").trim().slice(0, max);
type Pick = { n: string; name: string; note: string };
const list = (v: unknown): Pick[] =>
  (Array.isArray(v) ? v : []).slice(0, 20).map((p: any) => ({ n: clean(p?.n, 4), name: clean(p?.name, 120), note: clean(p?.note, 400) }));
const line = (p: Pick) => `${p.n} ${p.name}${p.note ? ` — ${p.note}` : ""}`;

function savePicks(body: any) {
  const liked = list(body?.liked), avoid = list(body?.avoid), notes = clean(body?.notes, 2000), themes = clean(body?.themes, 200), skills = clean(body?.skills, 200);
  const md = [
    `# Picks, ${new Date().toISOString().slice(0, 10)}`,
    ...(liked.length ? liked.map((p) => `Liked: ${line(p)}`) : ["Liked: none"]),
    ...(avoid.length ? avoid.map((p) => `Avoid: ${line(p)}`) : ["Avoid: none"]),
    `Notes: ${notes || "-"}`,
    ...(themes ? [`Dealt themes: ${themes}`] : []),
    ...(skills ? [`Design skills: ${skills}`] : []),
    "",
  ].join("\n");
  mkdirSync(picksDir, { recursive: true });
  for (const [name, text] of [["picks.json", JSON.stringify({ liked, avoid, notes, themes, skills }, null, 2) + "\n"], ["picks.md", md]] as const) {
    const tmp = join(picksDir, `.${name}.tmp`);
    writeFileSync(tmp, text);
    renameSync(tmp, join(picksDir, name)); // picks.md last: its arrival is the agent's signal
  }
  return md;
}

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(req) {
    // Another site in the same browser, or a DNS name pointed at 127.0.0.1, is not this page.
    if (!ownHost(req.headers.get("host"))) return new Response("wrong host", { status: 421 });
    const url = new URL(req.url);
    if (url.pathname === "/api/picks") {
      if (req.method !== "POST") return new Response("POST only", { status: 405 });
      const origin = req.headers.get("origin");
      if (origin !== null && !ownHost(origin.replace(/^https?:\/\//, ""))) return new Response("cross-origin", { status: 403 });
      if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) return new Response("JSON only", { status: 415 });
      const text = await req.text();
      if (text.length > 64_000) return new Response("too large", { status: 413 });
      try {
        return Response.json({ ok: true, saved: ".preview/references/picks.md", text: savePicks(JSON.parse(text)) });
      } catch {
        return new Response("bad JSON", { status: 400 });
      }
    }
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405 });
    // Only files under .preview/, after symlinks are resolved, so a link cannot point outside it.
    let path: string;
    try {
      path = resolve(root, "." + decodeURIComponent(url.pathname));
      if (url.pathname.endsWith("/")) path = join(path, "index.html");
      path = realpathSync(path);
    } catch {
      return new Response("not found", { status: 404 });
    }
    const base = realpathSync(webRoot);
    if (!path.startsWith(base + sep) || !statSync(path).isFile()) return new Response("not found", { status: 404 });
    return new Response(Bun.file(path));
  },
});
mkdirSync(webRoot, { recursive: true });
console.log(`kaizen-concept review server: http://127.0.0.1:${port}/.preview/ serving ${webRoot}`);
