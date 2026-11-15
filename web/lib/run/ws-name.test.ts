import { expect, test } from "bun:test";
import { branchSlug } from "./ws-tabs.ts";

test("branchSlug turns plain words into a branch name git accepts", () => {
  for (const [input, want] of [["Fix login bug!", "fix-login-bug"], ["feature/My Thing", "feature/my-thing"], ["  ..a..b.  ", "a.b"], ["--x--", "x"], ["日本語", ""], ["a.lock", "a-lock"], ["a//b/", "a/b"]]) expect(branchSlug(input)).toBe(want);
  for (const s of ["x".repeat(59) + " y z", "a/.b", "a-/b"]) {
    const r = Bun.spawnSync(["git", "check-ref-format", "--branch", branchSlug(s)]);
    expect(r.exitCode).toBe(0);
  }
});
