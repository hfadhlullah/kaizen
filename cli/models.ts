// The models each agent tool offers, read from the tool itself so a new model shows up
// without a kaizen release. Each tool has its own source: Claude Code and Codex keep a
// catalog cache in their home folders, Gemini CLI, Antigravity and OpenCode list them on
// a `models` command. Nothing here is required: a tool that lists nothing gives [] and
// the Settings field stays a free text. A listed id must still pass plainModel(), because
// it ends up in a launch line.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { commandOf } from "./agent-prefs.ts";
import { MODEL_FLAGS, onPath, plainModel } from "./state.ts";

export type ModelChoice = { id: string; name: string };

const dedupe = (rows: ModelChoice[]) => {
  const seen = new Set<string>();
  return rows.filter((m) => plainModel(m.id) && !seen.has(m.id) && !!seen.add(m.id));
};

// Claude Code's catalog (an undocumented cache, one file per account): the newest `*-cc.json`.
export function parseClaudeCatalog(files: string[]): ModelChoice[] {
  let best: any = null;
  for (const f of files) {
    try { const d = JSON.parse(f); if (Array.isArray(d?.catalog?.config?.models) && (!best || d.fetchedAt > best.fetchedAt)) best = d; } catch { /* not a catalog */ }
  }
  return (best?.catalog?.config?.models ?? [])
    .filter((m: any) => typeof m?.id === "string" && !m.hidden && !m.deprecated)
    .map((m: any) => ({ id: m.id, name: String(m.name ?? m.id) }));
}

// Codex's cache lists hidden models too (internal reviewers): only `list` ones are offered.
export function parseCodexCache(text: string): ModelChoice[] {
  try {
    return (JSON.parse(text).models ?? [])
      .filter((m: any) => typeof m?.slug === "string" && (m.visibility ?? "list") === "list")
      .map((m: any) => ({ id: m.slug, name: String(m.display_name ?? m.slug) }));
  } catch { return []; }
}

// `gemini models`: "id (Name)" lines, each followed by indented detail.
export const parseGemini = (out: string): ModelChoice[] =>
  [...out.matchAll(/^(\S+) \((.+)\)$/gm)].map((m) => ({ id: m[1]!, name: m[2]!.trim() === m[1] ? m[1]! : m[2]!.trim() }));

// `agy models`: "id<TAB>Name"; the first line says it is fetching.
export const parseAgy = (out: string): ModelChoice[] =>
  out.split("\n").filter((l) => l.includes("\t")).map((l) => { const [id, name] = l.split("\t"); return { id: id!.trim(), name: (name ?? id)!.trim() }; });

// `opencode models`: one provider/model id per line.
export const parseOpencode = (out: string): ModelChoice[] =>
  out.split("\n").map((l) => l.trim()).filter((l) => /^\S+\/\S+$/.test(l)).map((id) => ({ id, name: id }));

const CLAUDE_ALIASES: ModelChoice[] = [
  { id: "opus", name: "Opus (latest)" }, { id: "sonnet", name: "Sonnet (latest)" },
  { id: "haiku", name: "Haiku (latest)" }, { id: "fable", name: "Fable (latest)" },
];
const LIST_CMD: Record<string, { args: string[]; parse: (o: string) => ModelChoice[] }> = {
  gemini: { args: ["models"], parse: parseGemini }, agy: { args: ["models"], parse: parseAgy }, opencode: { args: ["models"], parse: parseOpencode },
};

async function run(cmd: string, args: string[]): Promise<string> {
  const bin = onPath(commandOf(cmd));
  if (!bin) return "";
  const p = Bun.spawn([bin, ...args], { stdin: "ignore", stdout: "pipe", stderr: "ignore", timeout: 20_000, windowsHide: true });
  const out = await new Response(p.stdout).text();
  return (await p.exited) === 0 ? out : "";
}

const readDir = (dir: string, ok: (f: string) => boolean) => {
  try { return readdirSync(dir).filter(ok).map((f) => readFileSync(join(dir, f), "utf8")); } catch { return []; }
};

async function load(cmd: string): Promise<ModelChoice[]> {
  if (cmd === "claude") {
    const dir = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "cache", "model-catalog");
    return [...CLAUDE_ALIASES, ...parseClaudeCatalog(readDir(dir, (f) => f.endsWith("-cc.json")))];
  }
  if (cmd === "codex") {
    const f = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "models_cache.json");
    return existsSync(f) ? parseCodexCache(readFileSync(f, "utf8")) : [];
  }
  const l = LIST_CMD[cmd];
  return l ? l.parse(await run(cmd, l.args)) : [];
}

// A model list changes rarely and some tools take seconds to print one: keep it ten minutes.
const kept = new Map<string, { at: number; rows: Promise<ModelChoice[]> }>();
export function modelsOf(cmd: string): Promise<ModelChoice[]> {
  if (!MODEL_FLAGS[cmd]) return Promise.resolve([]);
  const hit = kept.get(cmd);
  if (hit && Date.now() - hit.at < 600_000) return hit.rows;
  const rows = load(cmd).then(dedupe, () => []);
  kept.set(cmd, { at: Date.now(), rows });
  return rows;
}
