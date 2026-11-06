// Stage subagent models: `kaizen model <stage>`, the env a Claude launch carries, and the
// installer taking back an agent file an older workflow wrote `effort:` into.
// Everything runs in a child with HOME pointed at a scratch folder: state.ts reads the
// global config from the home it sees at import.
import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, lstatSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

const cli = dirname(import.meta.path), repo = dirname(cli);
const it = test.skipIf(process.platform === "win32");

const scratch = () => {
  const root = mkdtempSync(join(tmpdir(), "kz-subagent-")), home = join(root, "home"), project = join(root, "p");
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  mkdirSync(join(project, ".kaizen"), { recursive: true });
  const env = { PATH: process.env.PATH ?? "", HOME: home, USERPROFILE: home, TMPDIR: root };
  return { root, home, project, env };
};

it("a stage's own model wins, then subagents.model; inherit and default fall through to the global config", () => {
  const s = scratch();
  try {
    writeFileSync(join(s.home, ".kaizen", "config.yml"), "subagents:\n  # comment\n  model: sonnet\n  builder: haiku\n  reviewer: default\n  effort: medium\nagent:\n  default: claude\n");
    writeFileSync(join(s.project, ".kaizen", "config.yml"), "subagents:\n  model: inherit\n  reviewer: opus\n");
    const model = (...a: string[]) => {
      const p = Bun.spawnSync([process.execPath, join(cli, "install.ts"), "model", ...a], { cwd: s.project, env: s.env });
      return { out: p.stdout.toString().trim(), code: p.exitCode };
    };
    expect(model()).toEqual({ out: "sonnet", code: 0 });
    expect(model("planner")).toEqual({ out: "sonnet", code: 0 });
    expect(model("builder")).toEqual({ out: "haiku", code: 0 });
    expect(model("reviewer")).toEqual({ out: "opus", code: 0 });
    expect(model("bogus").code).toBe(1);

    const env = Bun.spawnSync([process.execPath, "-e",
      `import { subagentEnv } from ${JSON.stringify(join(cli, "state.ts"))}; console.log(JSON.stringify([subagentEnv(process.cwd(), "claude"), subagentEnv(process.cwd(), "codex")]))`],
      { cwd: s.project, env: s.env });
    expect(JSON.parse(env.stdout.toString())).toEqual([["CLAUDE_CODE_SUBAGENT_MODEL=sonnet", "CLAUDE_CODE_SUBAGENT_EFFORT=medium"], []]);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

it("nothing pinned: inherit, and a launch carries no subagent env", () => {
  const s = scratch();
  try {
    writeFileSync(join(s.home, ".kaizen", "config.yml"), readFileSync(join(repo, "skills", "kaizen", "config.default.yml"), "utf8"));
    const p = Bun.spawnSync([process.execPath, join(cli, "install.ts"), "model", "builder"], { cwd: s.project, env: s.env });
    expect(p.stdout.toString().trim()).toBe("inherit");
    const env = Bun.spawnSync([process.execPath, "-e",
      `import { subagentEnv } from ${JSON.stringify(join(cli, "state.ts"))}; console.log(JSON.stringify(subagentEnv(process.cwd(), "claude")))`],
      { cwd: s.project, env: s.env });
    expect(JSON.parse(env.stdout.toString())).toEqual([]);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

it("install relinks an agent file that differs only by an effort: line, and still skips one that is truly the user's", () => {
  const s = scratch();
  try {
    const agents = join(s.home, ".claude", "agents");
    mkdirSync(agents, { recursive: true });
    const src = readFileSync(join(repo, "agents", "kaizen-builder.md"), "utf8");
    writeFileSync(join(agents, "kaizen-builder.md"), src.replace(/^(name: .*\n)/m, "$1effort: low\n"));
    writeFileSync(join(agents, "kaizen-planner.md"), "the user's own planner\n");
    Bun.spawnSync([process.execPath, join(cli, "install.ts"), "--yes"], { cwd: s.home, env: s.env });
    expect(lstatSync(join(agents, "kaizen-builder.md")).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(agents, "kaizen-planner.md")).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(agents, "kaizen-planner.md"), "utf8")).toBe("the user's own planner\n");
  } finally { rmSync(s.root, { recursive: true, force: true }); }
}, 60_000);

it("the handoff agent takes agent.handoff_model for the run's own tool, project first; empty is the run's own model", () => {
  const s = scratch();
  try {
    writeFileSync(join(s.home, ".kaizen", "config.yml"), "agent:\n  handoff_model:\n    claude: haiku\n    codex: gpt-5-mini\n");
    writeFileSync(join(s.project, ".kaizen", "config.yml"), "agent:\n  handoff_model:\n    claude: opus\n    codex: \"\"\n");
    for (const [id, agent] of [["r-claude", "claude"], ["r-codex", "codex"], ["r-gemini", "gemini"]]) {
      mkdirSync(join(s.project, ".kaizen", "runs", id), { recursive: true });
      writeFileSync(join(s.project, ".kaizen", "runs", id, "state.json"), JSON.stringify({ id, agent, stage: "build" }));
    }
    const p = Bun.spawnSync([process.execPath, "-e",
      `import { handoffModel } from ${JSON.stringify(join(cli, "workers.ts"))}; console.log(JSON.stringify(["r-claude", "r-codex", "r-gemini"].map((r) => handoffModel(process.cwd(), r))))`],
      { cwd: s.project, env: s.env });
    expect(JSON.parse(p.stdout.toString())).toEqual(["opus", "gpt-5-mini", ""]);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

// The command lines themselves: handoff on sonnet, the own session on opus, from one config.
it("handoff_model sonnet puts --model sonnet on the handoff agent's command; agent.model opus puts --model opus on the own session's", () => {
  const s = scratch();
  try {
    writeFileSync(join(s.home, ".kaizen", "config.yml"), "agent:\n  model:\n    claude: opus\n  handoff_model:\n    claude: sonnet\n");
    mkdirSync(join(s.project, ".kaizen", "runs", "r1"), { recursive: true });
    writeFileSync(join(s.project, ".kaizen", "runs", "r1", "state.json"), JSON.stringify({ id: "r1", agent: "claude", stage: "build" }));
    const p = Bun.spawnSync([process.execPath, "-e", `
      import { agentLine, handoffModel } from ${JSON.stringify(join(cli, "workers.ts"))};
      import { agentFlags } from ${JSON.stringify(join(cli, "state.ts"))};
      const p = process.cwd(), l = agentLine(p, "r1", "go", "own", undefined, handoffModel(p, "r1"));
      console.log(JSON.stringify({ handoff: typeof l === "string" ? l : l.argv, own: agentFlags(p, "claude") }));`],
      { cwd: s.project, env: s.env });
    const out = JSON.parse(p.stdout.toString() || "{}");
    if (typeof out.handoff === "string") return console.log(`skipped: ${out.handoff}`); // claude not on PATH
    const at = out.handoff.indexOf("--model");
    expect(out.handoff[at + 1]).toBe("sonnet");
    expect(out.handoff).not.toContain("opus");
    expect(out.own).toEqual(["--model", "opus"]);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

it("every tool: agent.model on the own session, agent.handoff_model on the handoff agent, each in its own flag", () => {
  const s = scratch();
  try {
    const own: Record<string, string> = { claude: "opus", codex: "gpt-5", agy: "gemini-3.1-pro", gemini: "gemini-2.5-pro", opencode: "anthropic/claude-opus" };
    const hand: Record<string, string> = { claude: "sonnet", codex: "gpt-5-mini", agy: "gemini-3.1-flash", gemini: "gemini-2.5-flash", opencode: "anthropic/claude-sonnet" };
    const block = (m: Record<string, string>) => Object.entries(m).map(([t, v]) => `    ${t}: ${v}\n`).join("");
    writeFileSync(join(s.home, ".kaizen", "config.yml"), `agent:\n  model:\n${block(own)}  handoff_model:\n${block(hand)}`);
    for (const t of Object.keys(own)) {
      mkdirSync(join(s.project, ".kaizen", "runs", `r-${t}`), { recursive: true });
      writeFileSync(join(s.project, ".kaizen", "runs", `r-${t}`, "state.json"), JSON.stringify({ id: `r-${t}`, agent: t, stage: "build" }));
    }
    const p = Bun.spawnSync([process.execPath, "-e", `
      import { agentLine, handoffModel } from ${JSON.stringify(join(cli, "workers.ts"))};
      import { agentFlags, MODEL_FLAGS } from ${JSON.stringify(join(cli, "state.ts"))};
      const p = process.cwd(), out = {};
      for (const t of ${JSON.stringify(Object.keys(own))}) {
        const l = agentLine(p, "r-" + t, "go", "own", undefined, handoffModel(p, "r-" + t));
        out[t] = { own: agentFlags(p, t), handoff: typeof l === "string" ? null : l.argv, flag: MODEL_FLAGS[t]("x")[0] };
      }
      console.log(JSON.stringify(out));`], { cwd: s.project, env: s.env });
    const out = JSON.parse(p.stdout.toString());
    for (const t of Object.keys(own)) {
      const { own: o, handoff: h, flag } = out[t];
      expect(o).toEqual([flag, own[t]]);
      if (!h) continue; // that tool is not installed here
      expect(h[h.indexOf(flag) + 1]).toBe(hand[t]);
      expect(h).not.toContain(own[t]);
    }
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});
