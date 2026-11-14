import { expect, test } from "bun:test";
import { branchSlug } from "./lib/branch.ts";
import { childPath, folderName, workspaceBranch } from "./lib/add-project.ts";

test("the folder a picked parent and a name make keeps the parent's separator", () => {
  expect(childPath("/home/me/Projects/", "app")).toBe("/home/me/Projects/app");
  expect(childPath("/home/me/Projects", "app")).toBe("/home/me/Projects/app");
  expect(childPath("C:\\Users\\me\\", "app")).toBe("C:\\Users\\me\\app");
});

test("a project name is a folder name: no slashes, colons or wildcards", () => {
  expect(folderName("my-project")).toBe(true);
  for (const bad of ["", "a/b", "a\\b", "a:b", "a*b", 'a"b', "a<b", "a|b", "a?b"]) expect([bad, folderName(bad)]).toEqual([bad, false]);
});

test("a new workspace's branch: the typed one, else one from its name, else a random one", () => {
  expect(workspaceBranch(" feature/x ", "Anything")).toBe("feature/x");
  expect(workspaceBranch("", "Try the thing")).toBe("try-the-thing");
  expect(workspaceBranch("", "???", () => "ab12")).toBe("workspace-ab12");
  expect(branchSlug("Try the thing")).toBe("try-the-thing");
});
