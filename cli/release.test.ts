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
