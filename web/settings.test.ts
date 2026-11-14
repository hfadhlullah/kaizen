import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { pageId, placeOf, SETTINGS_NAV } from "./lib/settings.ts";

const pages = new Set(SETTINGS_NAV.flatMap(([, ps]) => ps.map((p) => p.id)));
const keys = [
  ...readFileSync(new URL("../cli/settings.ts", import.meta.url), "utf8").matchAll(/\{ key: "([\w.]+)", label:/g),
].map((m) => m[1]);

test("every setting lands on a real page, under a named subsection", () => {
  expect(keys.length).toBeGreaterThan(30);
  for (const k of keys) {
    const [page, sub] = placeOf(k);
    expect(pages.has(page)).toBe(true);
    expect([k, sub === "Other"]).toEqual([k, false]);
  }
});

test("a setting not placed yet falls back to General", () => {
  expect(placeOf("new.thing")).toEqual(["general", "Other"]);
});

test("the Orchestration page exists and holds its three settings", () => {
  expect(pages.has("orchestration")).toBe(true);
  for (const k of ["enabled", "max_workers", "permissions", "worker_model.claude"])
    expect(placeOf(`orchestration.${k}`)).toEqual(["orchestration", "Workers"]);
});

test("the Automations page sits under Workflow", () => {
  expect(SETTINGS_NAV.find(([g]) => g === "Workflow")![1].some((p) => p.id === "automations")).toBe(true);
});

test("models, the run's workflow and dictation each have their own page", () => {
  for (const k of ["subagents.model", "subagents.reviewer", "agent.model.codex"])
    expect(placeOf(k)).toEqual(["models", "Models"]);
  expect(placeOf("agent.handoff_model.claude")).toEqual(["models", "Handoff session"]);
  for (const k of ["preset", "runner", "explore.enabled", "build.executor", "review.executor"])
    expect(placeOf(k)).toEqual(["runs", "Workflow"]);
  for (const k of ["review.write_memory", "review.memory_max_lines"]) expect(placeOf(k)).toEqual(["runs", "Memory"]);
  expect(placeOf("dictation.model")).toEqual(["keyboard", "Dictation"]);
  expect(placeOf("board.chat_hotkey")).toEqual(["keyboard", "Shortcuts"]);
  expect(placeOf("state.keep_runs")).toEqual(["general", "Storage"]);
  expect(placeOf("board.projects_dir")).toEqual(["general", "Folders"]);
  expect(placeOf("board.open")).toEqual(["general", "App"]);
});

test("old page addresses open the page they were merged into", () => {
  expect(pageId("voice")).toBe("keyboard");
  expect(pageId("shortcuts")).toBe("keyboard");
  expect(pageId("mobile")).toBe("mobile");
  expect(pages.has("mobile")).toBe(true);
});

test("every page has a tile icon that exists in the board's icon set", () => {
  const board = readFileSync(new URL("./board.html", import.meta.url), "utf8");
  for (const p of SETTINGS_NAV.flatMap(([, ps]) => ps))
    expect([p.id, board.includes(`id="i-${p.ico}"`)]).toEqual([p.id, true]);
});

// ---- the page's rules (web/lib/settings.ts)
import {
  accountTools,
  addableTools,
  clampFont,
  controlOf,
  filterSections,
  genericSections,
  notifyHelp,
  pageHasMatch,
  pageSections,
  shownPage,
  usageText,
  visibleRows,
  whoText,
  type Data,
  type Row,
} from "./lib/settings.ts";

const row = (key: string, values: string[], extra: Partial<Row> = {}): Row => ({
  key,
  label: key,
  values,
  value: values[0] ?? "",
  ...extra,
});
const data = (rows: Row[], extra: Partial<Data> = {}): Data => ({
  cfg: { scope: "all", projects: [], rows },
  google: {},
  research: null,
  agents: null,
  accounts: null,
  skills: null,
  automations: null,
  cleanup: null,
  ...extra,
});
const env = { notifyHelp: "", notifyOn: true, scoped: false, agentCount: 0 };

test("a row is drawn with the control its values call for", () => {
  expect(controlOf(row("preset", ["low", "medium", "ultra", "custom"]))).toBe("preset");
  expect(controlOf(row("explore.enabled", ["true", "false"]))).toBe("switch");
  expect(controlOf(row("state.keep_runs", ["5", "10", "20", "50"]))).toBe("segments");
  expect(controlOf(row("runner", ["full", "lite"]))).toBe("segments");
  expect(controlOf(row("long", ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"]))).toBe("stepper");
  expect(controlOf(row("empty", ["", "a"]))).toBe("stepper");
  expect(controlOf(row("board.projects_dir", [], { text: true, folder: true }))).toBe("folder");
  expect(controlOf(row("sources.model", [], { text: true }))).toBe("text");
  expect(controlOf(row("agent.model.claude", [], { text: true }))).toBe("model");
  expect(controlOf(row("orchestration.worker_model.codex", [], { text: true }))).toBe("model");
});

test("a model row shows only for a tool on this machine, and the default agent only where it is not drawn as chips", () => {
  const rows = [
    row("agent.default", ["auto", "claude"]),
    row("agent.model.claude", [], { text: true }),
    row("agent.model.codex", [], { text: true }),
    row("agent.handoff_model.codex", [], { text: true }),
  ];
  const ap = {
    permissions: "own",
    envWorks: true,
    agents: [
      { cmd: "claude", installed: true },
      { cmd: "codex", installed: false },
    ],
  } as any;
  expect(visibleRows(data(rows).cfg, null).length).toBe(4);
  expect(visibleRows(data(rows).cfg, ap).map((r) => r.key)).toEqual(["agent.model.claude"]);
  expect(visibleRows(null, null)).toEqual([]);
});

test("rows sit on their page in the order the page asks for, with the project-only note on Board rows", () => {
  const g = genericSections(
    data([
      row("state.keep_runs", ["5"]),
      row("board.open", ["a"], { group: "Board" }),
      row("board.projects_dir", [], { text: true }),
    ]),
    { ...env, scoped: true },
  );
  // the pre-seeded subsections come first; a Board row, when a project is being edited, goes under its own note
  expect([...g.get("general")!.keys()]).toEqual(["Storage", "Folders", "App", "App · all projects"]);
  expect(g.get("general")!.get("Storage")![0]!.id).toBe("s-state-keep_runs");
  // this browser's own choices live on their pages whatever the config holds
  expect(
    g
      .get("appearance")!
      .get("Browser")!
      .map((i) => i.kind),
  ).toEqual(["theme", "color", "motion"]);
  expect(
    g
      .get("notifications")!
      .get("Browser")!
      .map((i) => i.kind),
  ).toEqual(["notify", "haptic", "sound"]);
  expect(
    g
      .get("keyboard")!
      .get("Dictation")!
      .map((i) => i.kind),
  ).toEqual(["mic"]);
  expect(
    g
      .get("terminal")!
      .get("Browser")!
      .map((i) => i.kind),
  ).toEqual(["font"]);
  expect(
    g
      .get("mobile")!
      .get("Phone")!
      .map((i) => i.kind),
  ).toEqual(["phone", "whatsapp"]);
});

test("Google keeps its connect row last; Research and Storage appear only when the server sent them", () => {
  const bare = genericSections(data([]), env).get("integrations")!;
  expect([...bare.keys()]).toEqual(["Google"]);
  expect(bare.get("Google")!.map((i) => i.kind)).toEqual(["google-id", "google-secret", "google-conn"]);
  const full = genericSections(data([], { research: { set: false }, cleanup: {} }), env);
  expect(
    full
      .get("integrations")!
      .get("Research")!
      .map((i) => i.kind),
  ).toEqual(["fc-key", "fc-test"]);
  expect(
    full
      .get("general")!
      .get("Storage")!
      .map((i) => i.id),
  ).toEqual(["s-clean-records", "s-clean-runs"]);
});

test("a search keeps the rows whose words hold it, drops empty sections and pages, and never touches an untitled section", () => {
  const d = data([
    row("preset", ["low", "medium"], { help: "How much kaizen does", group: "Preset" }),
    row("runner", ["full", "lite"]),
  ]);
  const all = pageSections("runs", d, env);
  expect(all.map((s) => s.title)).toEqual(["Workflow"]);
  expect(filterSections(all, "").length).toBe(1);
  expect(filterSections(all, "  HOW much ")[0]!.items.map((i) => i.id)).toEqual(["s-preset"]);
  expect(filterSections(all, "nothing like it")).toEqual([]);
  expect(pageHasMatch(filterSections(all, "runner"))).toBe(true);
  expect(pageHasMatch(filterSections(all, "zzz"))).toBe(false);
  const orch = pageSections("orchestration", d, env);
  expect(filterSections(orch, "zzz").length).toBe(1);
  expect(pageHasMatch(orch)).toBe(false);
});

test("which page shows: the one picked if it matches, the first match while searching, none on a phone's list", () => {
  const o = { picked: null, hits: ["general", "agents"], query: "", narrow: false, typing: false };
  expect(shownPage(o)).toBe("general");
  expect(shownPage({ ...o, picked: "agents" })).toBe("agents");
  expect(shownPage({ ...o, picked: "git" })).toBe("general");
  expect(shownPage({ ...o, narrow: true })).toBe(null);
  expect(shownPage({ ...o, narrow: true, picked: "agents" })).toBe("agents");
  expect(shownPage({ ...o, narrow: true, query: "x" })).toBe("general");
  expect(shownPage({ ...o, narrow: true, query: "x", typing: true, picked: "agents" })).toBe(null);
  expect(shownPage({ ...o, hits: [] })).toBe(null);
});

test("pages with their own rows: agents, accounts, skills and automations", () => {
  const ap = {
    permissions: "own",
    envWorks: true,
    agents: [
      { cmd: "claude", name: "Claude Code", installed: true, enabled: true },
      { cmd: "codex", name: "Codex", installed: false, enabled: true },
    ],
  } as any;
  const a = pageSections("agents", data([row("agent.default", ["auto"])], { agents: ap }), { ...env, agentCount: 1 });
  expect(a.map((s) => s.title)).toEqual(["Default agent", "Permissions", "Installed · 1 detected"]);
  expect(a[2]!.extra).toBe("refresh");
  expect(a[2]!.items.map((i) => i.ref)).toEqual(["claude", "codex"]);
  const ac = {
    accounts: [{ id: "a1", tool: "claude", name: "Work" }],
    normal: [{ tool: "claude", who: "me@x" }, { tool: "gemini" }],
  };
  expect(accountTools(ac)).toEqual(["claude", "gemini"]);
  expect(addableTools(ac)).toEqual(["claude", "codex", "gemini"]);
  expect(addableTools({ accounts: [], normal: [] })).toEqual(["claude", "codex"]);
  const acc = pageSections("accounts", data([], { accounts: ac }), env);
  expect(acc.map((s) => s.title)).toEqual(["Claude", "Gemini CLI", "Add an account"]);
  expect(acc[0]!.items.map((i) => i.kind)).toEqual(["account-normal", "account"]);
  const sk = {
    skills: [
      { id: "k", title: "K", description: "d", group: "core" },
      { id: "b", title: "B", description: "d", group: "media" },
    ],
  };
  const s = pageSections("skills", data([], { skills: sk }), env);
  expect(s.map((x) => [x.title, x.extra])).toEqual([
    ["Core", "recheck"],
    ["Media", undefined],
  ]);
  const au = pageSections(
    "automations",
    data([], { automations: { rules: [{ id: "r1", name: "Nightly", text: "t", cron: "0 9 * * *" }] } }),
    env,
  );
  expect(au[0]!.items.map((i) => i.kind)).toEqual(["automation", "automation-form"]);
  expect(pageSections("automations", data([]), env)[0]!.items.map((i) => i.kind)).toEqual(["automation-none"]);
});

test("small rules: notification help, font size, who is signed in, usage", () => {
  expect(notifyHelp("granted", true)).toBe("");
  expect(notifyHelp("granted", false)).toBe("Off in this browser");
  expect(notifyHelp("denied", true)).toContain("blocked");
  expect(notifyHelp("default", true)).toContain("wait for the browser");
  expect(notifyHelp(null, true)).toContain("not supported");
  expect(clampFont("30", 12, 8, 24)).toBe(24);
  expect(clampFont("3", 12, 8, 24)).toBe(8);
  expect(clampFont("13.6", 12, 8, 24)).toBe(14);
  expect(clampFont("", 12, 8, 24)).toBe(12);
  expect(whoText({ signedIn: true, who: "a@b", plan: "Pro" })).toBe("a@b · Pro");
  expect(whoText({ signedIn: true, via: "ChatGPT" })).toBe("via ChatGPT");
  expect(whoText({ signedIn: false, who: "a@b" })).toBe("");
  expect(usageText(null, false)).toEqual({ text: "Not signed in", bad: true });
  expect(usageText(null, true, false)).toEqual({ text: "Signed in", bad: false });
  expect(usageText({ expired: true }, true).bad).toBe(true);
  expect(usageText({ five: { pct: 10 }, week: { pct: 40 } }, true).text).toBe("10% of 5 hours · 40% of the week");
});
