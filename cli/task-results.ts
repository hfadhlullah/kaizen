// A result is published only after every regular output has been copied, hashed,
// and atomically renamed into its own private directory. Live URLs remain mutable.
import { constants, closeSync, fstatSync, mkdirSync, openSync, readSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { basename, extname, join, resolve, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { taskDir, TaskError, taskId, acquireTaskLock } from "./tasks.ts";

export type ArtifactKind = "website" | "text" | "markdown" | "pdf" | "image" | "video" | "audio" | "download";
export type ResultArtifact = { id: string; name: string; kind: ArtifactKind; mediaType: string; preview: "live" | "text" | "pdf" | "image" | "video" | "audio" | "download"; source: string; size: number; hash: string | null; file?: string; url?: string; mutable?: boolean; video?: { name: string; letter: string; revision: number } };
export type TaskResult = { schema: 1; id: string; taskId: string; runId: string; iteration: number; version: number; created: number; title: string; summary: string; artifacts: ResultArtifact[]; checks: string[]; limitations: string[]; size: number };
export type ArtifactInput = { path?: string; url?: string; name?: string; kind?: ArtifactKind; mediaType?: string; video?: ResultArtifact["video"] };
export type PublishResult = { runId: string; iteration?: number; title: string; summary: string; artifacts: ArtifactInput[]; checks?: string[]; limitations?: string[]; roots: string[]; id?: string; settleMs?: number; maxBytes?: number };
const json = (file: string) => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } };
const validResult = (id: string) => taskId(id);
const rootOf = (state: string, task: string) => join(taskDir(state, task), "results");
const below = (root: string, file: string) => file !== root && file.startsWith(root + sep);
const mime: Record<string, [ArtifactKind, string, ResultArtifact["preview"]]> = {
  ".txt": ["text", "text/plain; charset=utf-8", "text"], ".md": ["markdown", "text/plain; charset=utf-8", "text"], ".markdown": ["markdown", "text/plain; charset=utf-8", "text"], ".json": ["text", "text/plain; charset=utf-8", "text"], ".csv": ["text", "text/plain; charset=utf-8", "text"],
  ".pdf": ["pdf", "application/pdf", "pdf"], ".png": ["image", "image/png", "image"], ".jpg": ["image", "image/jpeg", "image"], ".jpeg": ["image", "image/jpeg", "image"], ".webp": ["image", "image/webp", "image"], ".gif": ["image", "image/gif", "image"],
  ".mp4": ["video", "video/mp4", "video"], ".webm": ["video", "video/webm", "video"], ".mov": ["video", "video/quicktime", "video"], ".mp3": ["audio", "audio/mpeg", "audio"], ".wav": ["audio", "audio/wav", "audio"], ".ogg": ["audio", "audio/ogg", "audio"], ".m4a": ["audio", "audio/mp4", "audio"],
};
export function artifactType(name: string): { kind: ArtifactKind; mediaType: string; preview: ResultArtifact["preview"] } {
  const [kind, mediaType, preview] = mime[extname(name).toLowerCase()] ?? ["download", "application/octet-stream", "download"];
  return { kind, mediaType, preview };
}
export function liveUrl(value: string): string | null {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
// A path must be lexically below an allowed root AND resolve below it. Relative
// paths use the first root; neither symlink traversal nor ../ aliases are accepted.
export function resultSource(roots: string[], file: string): string | null {
  if (!file || file.includes("\0") || file.replace(/\\/g, "/").split("/").includes("..")) return null;
  const want = resolve(roots[0] || ".", file);
  for (const root of roots) {
    const top = resolve(root); if (!below(top, want)) continue;
    try { const real = realpathSync(want), realRoot = realpathSync(top); if (below(realRoot, real) && statSync(real).isFile()) return real; } catch { /* not a settled file */ }
  }
  return null;
}
export function readResult(state: string, task: string, id: string): TaskResult | null {
  if (!validResult(id)) return null;
  try {
    const root = taskDir(state, task), dir = join(rootOf(state, task), id);
    if (!below(realpathSync(root), realpathSync(dir))) return null;
    const manifest = resultSource([dir], "result.json"); if (!manifest) return null;
    const result = json(manifest);
    return result?.schema === 1 && result.id === id && result.taskId === task && Array.isArray(result.artifacts) ? result : null;
  } catch { return null; }
}
export function listResults(state: string, task: string): TaskResult[] {
  try { return readdirSync(rootOf(state, task)).filter(validResult).map((id) => readResult(state, task, id)).filter((r): r is TaskResult => !!r).sort((a, b) => b.version - a.version); } catch { return []; }
}
export function publishResult(state: string, task: string, input: PublishResult): TaskResult {
  const id = input.id ?? randomUUID(); if (!validResult(id)) throw new TaskError("Invalid result id", 400);
  const previous = readResult(state, task, id); if (previous) return previous;
  if (!input.artifacts?.length || input.artifacts.length > 100) throw new TaskError("Publish between one and 100 named outputs", 400);
  if (!input.roots.length) throw new TaskError("Result source roots are required", 400);
  const results = rootOf(state, task); mkdirSync(results, { recursive: true, mode: 0o700 });
  const release = acquireTaskLock(join(results, "publication.lock"));
  const temp = join(results, `.pending-${id}-${randomUUID()}`); mkdirSync(temp, { mode: 0o700 });
  try {
    const artifacts: ResultArtifact[] = []; let size = 0;
    for (const item of input.artifacts) {
      if (!!item.path === !!item.url) throw new TaskError("An output needs one file or live URL", 400);
      const artifactId = randomUUID();
      if (item.url) {
        const url = liveUrl(item.url); if (!url) throw new TaskError("Only HTTP and HTTPS preview links are supported", 400);
        artifacts.push({ id: artifactId, name: item.name || "Live preview", kind: "website", preview: "live", mediaType: "text/html", source: url, url, mutable: true, size: 0, hash: null }); continue;
      }
      const source = resultSource(input.roots, item.path!); if (!source) throw new TaskError(`Cannot preserve output: ${basename(item.path!)} is missing or outside the project`, 400);
      const before = statSync(source), settle = input.settleMs ?? 500;
      if (settle > 0 && Date.now() - before.mtimeMs < settle) throw new TaskError(`Output is still changing: ${basename(source)}. Wait and publish again.`);
      size += before.size; if (size > (input.maxBytes ?? 2_000_000_000)) throw new TaskError("Saved result exceeds the 2GB copy limit. Publish smaller deliverable files.", 413);
      const name = basename(item.name || source).replace(/[\0-\x1f\x7f]/g, "_").slice(0, 240) || "download";
      const file = artifactId + extname(source).replace(/[^.\w-]/g, "").slice(0, 12);
      const target = join(temp, file);
      // Open without following a final symlink; compare inode/size after copy so
      // an actively replaced source never becomes a purported immutable result.
      const fd = openSync(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      let saved: number | undefined; const digest = createHash("sha256"); let copied = 0;
      try {
        const opened = fstatSync(fd); if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev) throw new TaskError("Output changed during preservation. Publish again.");
        saved = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
        const chunk = Buffer.allocUnsafe(1024 * 1024); let bytes = 0;
        while ((bytes = readSync(fd, chunk, 0, chunk.length, null)) > 0) {
          copied += bytes; if (copied > before.size) throw new TaskError("Output grew during preservation. Publish again.");
          digest.update(chunk.subarray(0, bytes)); let written = 0;
          while (written < bytes) written += writeSync(saved, chunk, written, bytes - written);
        }
        const after = statSync(source), held = fstatSync(fd);
        if (after.ino !== before.ino || after.size !== before.size || after.mtimeMs !== before.mtimeMs || held.size !== before.size || held.mtimeMs !== before.mtimeMs) throw new TaskError("Output changed during preservation. Publish again.");
      } finally { closeSync(fd); if (saved !== undefined) closeSync(saved); }
      if (copied !== before.size) throw new TaskError("Incomplete saved output. Publish again.");
      const type = artifactType(source);
      // Claimed types never upgrade active formats such as HTML/SVG to same-origin previews.
      artifacts.push({ id: artifactId, name, ...type, source: item.path!, size: copied, hash: digest.digest("hex"), file, ...(item.video ? { video: item.video } : {}) });
    }
    const result: TaskResult = { schema: 1, id, taskId: task, runId: input.runId, iteration: input.iteration ?? 0, version: (listResults(state, task)[0]?.version ?? 0) + 1, created: Date.now(), title: input.title, summary: input.summary, artifacts, checks: input.checks ?? [], limitations: input.limitations ?? [], size };
    writeFileSync(join(temp, "result.json"), JSON.stringify(result, null, 2), { mode: 0o600 });
    renameSync(temp, join(results, id)); return result;
  } catch (error) {
    if (error instanceof TaskError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    throw new TaskError(code === "ENOSPC" ? "Not enough disk space to preserve this result. Free space and retry; earlier results remain available." : `Could not preserve the result (${code || "copy failed"}). Earlier results remain available.`, 507);
  } finally { rmSync(temp, { recursive: true, force: true }); release(); }
}
export function resolveArtifact(state: string, task: string, resultId: string, artifactId: string): { result: TaskResult; artifact: ResultArtifact; path: string | null } | null {
  if (!taskId(artifactId)) return null;
  const result = readResult(state, task, resultId), artifact = result?.artifacts.find((a) => a.id === artifactId); if (!result || !artifact) return null;
  if (artifact.url) return { result, artifact, path: null };
  if (!artifact.file || basename(artifact.file) !== artifact.file) return null;
  const dir = join(rootOf(state, task), resultId), path = resultSource([dir], artifact.file); if (!path) return null;
  // Corruption is a missing output, never a different file served under a saved id.
  try { if (statSync(path).size !== artifact.size) return null; } catch { return null; }
  return { result, artifact, path };
}
export function artifactResponse(state: string, task: string, result: string, artifact: string, request: Request, download = false): Response {
  const found = resolveArtifact(state, task, result, artifact); if (!found?.path) return new Response("Saved output is unavailable. Choose another result or retry preservation.", { status: 404 });
  const a = found.artifact, forceDownload = download || a.preview === "download";
  const name = a.name.replace(/["\\\r\n]/g, "_");
  const headers = new Headers({ "Content-Type": a.mediaType, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; media-src 'self'; img-src 'self' data:", "Content-Disposition": `${forceDownload ? "attachment" : "inline"}; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=31536000, immutable" });
  const file = Bun.file(found.path), range = request.headers.get("Range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range); let start = 0, end = a.size - 1;
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${a.size}` } });
    if (!match[1]) start = Math.max(0, a.size - Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (start > end || start >= a.size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${a.size}` } });
    headers.set("Content-Range", `bytes ${start}-${end}/${a.size}`); headers.set("Content-Length", String(end - start + 1));
    return new Response(request.method === "HEAD" ? null : file.slice(start, end + 1), { status: 206, headers });
  }
  headers.set("Content-Length", String(a.size)); return new Response(request.method === "HEAD" ? null : file, { headers });
}
