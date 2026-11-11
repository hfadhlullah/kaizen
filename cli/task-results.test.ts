import { test, expect, spyOn } from "bun:test";
import * as fs from "node:fs";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createTask } from "./tasks.ts";
import * as r from "./task-results.ts";

function place() { const root = mkdtempSync(join(tmpdir(), "kaizen-results-")), state = join(root, ".kaizen"), task = createTask(state, { goal: "Workshop", project: root }); return { root, state, task }; }
const publish = (p: ReturnType<typeof place>, artifacts: r.ArtifactInput[], extra: Partial<r.PublishResult> = {}) => r.publishResult(p.state, p.task.id, { runId: "run-1", title: "Workshop result", summary: "Removed phone field", artifacts, checks: ["Form rendered"], limitations: ["Registration backend unverified"], roots: [p.root], settleMs: 0, ...extra });

test("saved result bytes and specialized version link survive source changes/deletion", async () => {
  const p = place(), src = join(p.root, "clip.mp4"); writeFileSync(src, "original video");
  const result = publish(p, [{ path: src, video: { name: "clip", letter: "a", revision: 2 } }, { url: "http://localhost:3000", name: "Live workshop" }]);
  writeFileSync(src, "changed"); rmSync(src);
  const a = result.artifacts[0]!, found = r.resolveArtifact(p.state, p.task.id, result.id, a.id)!;
  expect(readFileSync(found.path!, "utf8")).toBe("original video"); expect(a.hash).toHaveLength(64);
  expect(a.video).toEqual({ name: "clip", letter: "a", revision: 2 });
  expect(result.artifacts[1]?.mutable).toBe(true); expect(result.limitations).toEqual(["Registration backend unverified"]);
  const response = r.artifactResponse(p.state, p.task.id, result.id, a.id, new Request("http://localhost/file", { headers: { Range: "bytes=0-7" } }));
  expect(response.status).toBe(206); expect(await response.text()).toBe("original"); expect(response.headers.get("Content-Range")).toBe("bytes 0-7/14");
});

test("failed preservation never publishes a completed entry or removes an earlier result", () => {
  const p = place(); writeFileSync(join(p.root, "one.txt"), "one");
  const first = publish(p, [{ path: "one.txt" }]);
  expect(() => publish(p, [{ path: "one.txt" }, { path: "missing.txt" }])).toThrow("missing or outside");
  expect(() => publish(p, [{ path: "one.txt" }], { maxBytes: 1 })).toThrow("copy limit");
  expect(r.listResults(p.state, p.task.id).map((x) => x.id)).toEqual([first.id]);
  expect(readdirSync(join(p.state, "tasks", p.task.id, "results")).some((n) => n.startsWith(".pending"))).toBe(false);
  // A caller retries the same publication id without duplicating its history entry.
  expect(publish(p, [{ path: "missing.txt" }], { id: first.id }).id).toBe(first.id);
});

test("path traversal, external symlinks and unsafe URL schemes are rejected", () => {
  const p = place(), outside = mkdtempSync(join(tmpdir(), "outside-result-")); writeFileSync(join(outside, "secret"), "secret");
  symlinkSync(outside, join(p.root, "escape-dir"), process.platform === "win32" ? "junction" : undefined);
  for (const path of ["../secret", join(outside, "secret"), "escape-dir/secret", "one\0.txt"]) expect(() => publish(p, [{ path }])).toThrow();
  for (const url of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "https://user:pass@example.com"]) expect(() => publish(p, [{ url }])).toThrow("Only HTTP");
  expect(r.resolveArtifact(p.state, p.task.id, randomUUID(), "../../secret")).toBe(null);
});

test("active HTML/SVG outputs download with isolation headers regardless of claimed MIME", async () => {
  const p = place(); writeFileSync(join(p.root, "hostile.html"), "<script>fetch('/accept')</script>"); writeFileSync(join(p.root, "hostile.svg"), "<svg onload=alert(1)></svg>");
  const result = publish(p, [{ path: "hostile.html", kind: "image", mediaType: "image/png" }, { path: "hostile.svg" }]);
  for (const a of result.artifacts) {
    expect(a.preview).toBe("download");
    const response = r.artifactResponse(p.state, p.task.id, result.id, a.id, new Request("http://localhost/file"));
    expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(response.headers.get("Content-Disposition")).toStartWith("attachment;");
    expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  }
});

test("mixed viewer kinds retain named downloads; missing/corrupt artifact is explicit", () => {
  const p = place(); const names = ["notes.md", "paper.pdf", "photo.png", "voice.mp3", "sheet.xlsx"];
  for (const name of names) writeFileSync(join(p.root, name), "output");
  const result = publish(p, names.map((path) => ({ path })));
  expect(result.artifacts.map((a) => a.preview)).toEqual(["text", "pdf", "image", "audio", "download"]);
  const a = result.artifacts[0]!, found = r.resolveArtifact(p.state, p.task.id, result.id, a.id)!; rmSync(found.path!);
  expect(r.artifactResponse(p.state, p.task.id, result.id, a.id, new Request("http://localhost/file")).status).toBe(404);
});

test("ranges handle suffix/open end and reject malformed/out-of-bounds intervals", async () => {
  const p = place(); writeFileSync(join(p.root, "voice.mp3"), "0123456789"); const result = publish(p, [{ path: "voice.mp3" }]), a = result.artifacts[0]!;
  const get = (range: string) => r.artifactResponse(p.state, p.task.id, result.id, a.id, new Request("http://localhost/file", { headers: { Range: range } }));
  expect(await get("bytes=-3").text()).toBe("789"); expect(await get("bytes=8-").text()).toBe("89");
  for (const range of ["bytes=99-100", "bytes=8-2", "bytes=0-1,3-4", "bytes=-", "bytes=-0"]) expect(get(range).status).toBe(416);
});

test("disk-full and copy errors preserve old history and remove incomplete snapshots", () => {
  const p = place(); writeFileSync(join(p.root, "one.txt"), "one"); const first = publish(p, [{ path: "one.txt" }]);
  for (const code of ["ENOSPC", "EIO"]) {
    const write = spyOn(fs, "writeSync").mockImplementation(() => { throw Object.assign(new Error("injected storage failure"), { code }); });
    try { expect(() => publish(p, [{ path: "one.txt" }])).toThrow(code === "ENOSPC" ? "Not enough disk space" : "Could not preserve"); }
    finally { write.mockRestore(); }
    expect(r.listResults(p.state, p.task.id).map((x) => x.id)).toEqual([first.id]);
    expect(r.resolveArtifact(p.state, p.task.id, first.id, first.artifacts[0]!.id)?.path).not.toBe(null);
  }
});

test("snapshot and task directory symlink escapes cannot be served", () => {
  const p = place(); writeFileSync(join(p.root, "one.txt"), "one"); const result = publish(p, [{ path: "one.txt" }]);
  const external = mkdtempSync(join(tmpdir(), "external-snapshot-")), resultDir = join(p.state, "tasks", p.task.id, "results", result.id);
  fs.renameSync(resultDir, join(external, "saved")); symlinkSync(join(external, "saved"), resultDir, process.platform === "win32" ? "junction" : undefined);
  expect(r.readResult(p.state, p.task.id, result.id)).toBe(null);
  expect(r.resolveArtifact(p.state, p.task.id, result.id, result.artifacts[0]!.id)).toBe(null);
});
