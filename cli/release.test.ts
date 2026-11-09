import { test, expect } from "bun:test";
import { nextVersion, levelOf, summaryOf } from "./release.ts";

test("release picks the bump from the commits and names it from them", () => {
  expect(levelOf("fix(board): x\ndocs: y")).toBe("patch");
  expect(levelOf("docs: y\nfeat(board): x")).toBe("minor");
  expect(levelOf("feat: x\n\nBREAKING: config moved")).toBe("major");
  expect(nextVersion("1.43.3", "patch")).toBe("1.43.4");
  expect(nextVersion("1.43.3", "minor")).toBe("1.44.0");
  expect(nextVersion("1.43.3", "major")).toBe("2.0.0");
  expect(summaryOf(["feat(board): a", "docs(notes): b", "fix: c"])).toBe("a; c");
});

// release.sh against a fake gh: the release is made as a draft (desktop.yml publishes
// it once its installers are attached), and a draft the desktop job made first is filled in.
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runRelease(view: string) {
  const dir = mkdtempSync(join(tmpdir(), "kz-release-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  mkdirSync(join(dir, "cli"));
  copyFileSync(join(import.meta.dir, "release.sh"), join(dir, "cli", "release.sh"));
  // The fake gh logs every call; `release view` answers with the given isDraft, or fails as "no release".
  writeFileSync(
    join(bin, "gh"),
    `#!/bin/sh\necho "$*" >> "${join(dir, "gh.log")}"\ncase "$1 $2" in\n  "release view") ${view ? `echo ${view}` : "exit 1"} ;;\nesac\nexit 0\n`,
  );
  chmodSync(join(bin, "gh"), 0o755);
  const git = (...a: string[]) => Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: dir });
  git("init", "-q");
  git("commit", "-q", "--allow-empty", "-m", "Release 9.9.9: a thing");
  const r = Bun.spawnSync(["sh", "cli/release.sh"], {
    cwd: dir,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, npm_package_version: "9.9.9" },
  });
  return { out: r.stdout.toString(), gh: readFileSync(join(dir, "gh.log"), "utf8") };
}

test.skipIf(process.platform === "win32")("release.sh drafts the release, and fills in a draft already there", () => {
  const made = runRelease("");
  expect(made.gh).toMatch(/^release create v9\.9\.9 --draft --title v9\.9\.9: a thing /m);
  expect(made.out).toContain("release: drafted v9.9.9");

  const filled = runRelease("true");
  expect(filled.gh).toMatch(/^release edit v9\.9\.9 --title v9\.9\.9: a thing /m);
  expect(filled.gh).not.toContain("release create");

  const done = runRelease("false");
  expect(done.out).toContain("already released");
  expect(done.gh).not.toMatch(/release (create|edit)/);
});
