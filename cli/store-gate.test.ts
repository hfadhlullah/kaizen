import { expect, test } from "bun:test";
import { gate } from "./store-gate.ts";

test("an install needs the inspect's token, for the same thing, once, in time, and risky when careful", () => {
  let now = 0;
  const g = gate(() => now);
  const want = { kind: "skill" as const, source: "anthropics/skills", name: "pdf", risky: false };
  expect(g.take(undefined, want)).toContain("inspect required");
  expect(g.take("made-up", want)).toContain("inspect required");
  const t = g.issue({ kind: "skill", source: "anthropics/skills", name: "pdf", careful: false });
  expect(g.take(t, { ...want, name: "docx" })).toContain("inspect required"); // another name
  const t2 = g.issue({ kind: "skill", source: "anthropics/skills", name: "pdf", careful: false });
  expect(g.take(t2, { ...want, source: "evil/skills" })).toContain("inspect required"); // another repo
  const t3 = g.issue({ kind: "skill", source: "anthropics/skills", name: "pdf", careful: false });
  expect(g.take(t3, { ...want, kind: "plugin" })).toContain("inspect required"); // another kind
  const t4 = g.issue({ kind: "skill", source: "anthropics/skills", name: "pdf", careful: false });
  expect(g.take(t4, want)).toBeNull();
  expect(g.take(t4, want)).toContain("inspect required"); // spent
  const c = g.issue({ kind: "plugin", source: "", name: "github", careful: true });
  expect(g.take(c, { kind: "plugin", source: "", name: "github", risky: false })).toContain("second confirm");
  const c2 = g.issue({ kind: "plugin", source: "", name: "github", careful: true });
  expect(g.take(c2, { kind: "plugin", source: "", name: "github", risky: true })).toBeNull();
  const old = g.issue({ kind: "skill", source: "anthropics/skills", name: "pdf", careful: false });
  now += 16 * 60_000;
  expect(g.take(old, want)).toContain("inspect required"); // expired
});
