// Two wire formats cover three providers: Anthropic Messages, and OpenAI Chat
// Completions (OpenAI itself, and Requesty, an OpenAI-compatible router).
// Both are normalised to { text, toolCalls } so the agent loop never knows which.

export type Provider = "anthropic" | "openai" | "requesty";
export type ModelConfig = { provider: Provider; model: string; key: string; baseUrl: string };

export type ToolDef = { name: string; description: string; schema: Record<string, unknown> };
export type ToolCall = { id: string; name: string; input: Record<string, unknown> };
export type Turn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: ToolCall[] }
  | { role: "tool"; results: { id: string; content: string }[] };
export type Reply = { text: string; toolCalls: ToolCall[] };
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const BASE: Record<Provider, string> = {
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1",
  requesty: "https://router.requesty.ai/v1",
};
const KEY: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  requesty: "REQUESTY_API_KEY",
};

// Throws a message fit to print at startup. Never includes a key.
export function configFromEnv(env: Record<string, string | undefined>): ModelConfig {
  const provider = (env.PROVIDER || "anthropic").trim().toLowerCase() as Provider;
  if (!(provider in BASE)) throw new Error(`PROVIDER must be anthropic, openai or requesty (got "${env.PROVIDER}")`);
  const key = env[KEY[provider]]?.trim();
  if (!key) throw new Error(`${KEY[provider]} is not set. Copy .env.example to .env and add your ${provider} key.`);
  const model = env.MODEL?.trim() || (provider === "anthropic" ? "claude-sonnet-5-5" : "");
  if (!model) throw new Error(`MODEL is not set. ${provider} needs a model id in .env.`);
  return { provider, model, key, baseUrl: BASE[provider] };
}

async function post(cfg: ModelConfig, url: string, headers: Record<string, string>, body: unknown, f: Fetch) {
  const res = await f(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  if (!res.ok) {
    let why = "";
    try { const j: any = await res.json(); why = j?.error?.message ?? ""; } catch {}
    throw new Error(`${cfg.provider} returned ${res.status}${why ? `: ${why}` : ""}`);
  }
  return res.json() as Promise<any>;
}

async function anthropic(cfg: ModelConfig, system: string, turns: Turn[], tools: ToolDef[], f: Fetch): Promise<Reply> {
  const messages = turns.map((t) =>
    t.role === "user" ? { role: "user", content: t.text }
    : t.role === "tool" ? { role: "user", content: t.results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.content })) }
    : { role: "assistant", content: [
        ...(t.text ? [{ type: "text", text: t.text }] : []),
        ...t.toolCalls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.input })),
      ] });
  const j = await post(cfg, `${cfg.baseUrl}/messages`, { "x-api-key": cfg.key, "anthropic-version": "2023-06-01" }, {
    model: cfg.model, max_tokens: 4096, system, messages,
    ...(tools.length && { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema })) }),
  }, f);
  const blocks: any[] = j.content ?? [];
  return {
    text: blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim(),
    toolCalls: blocks.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: b.input ?? {} })),
  };
}

async function openaiCompatible(cfg: ModelConfig, system: string, turns: Turn[], tools: ToolDef[], f: Fetch): Promise<Reply> {
  const messages: any[] = [{ role: "system", content: system }];
  for (const t of turns) {
    if (t.role === "user") messages.push({ role: "user", content: t.text });
    else if (t.role === "tool") for (const r of t.results) messages.push({ role: "tool", tool_call_id: r.id, content: r.content });
    else messages.push({
      role: "assistant", content: t.text || null,
      ...(t.toolCalls.length && { tool_calls: t.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.input) } })) }),
    });
  }
  const j = await post(cfg, `${cfg.baseUrl}/chat/completions`, { authorization: `Bearer ${cfg.key}` }, {
    model: cfg.model, messages,
    ...(tools.length && { tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.schema } })) }),
  }, f);
  const m = j.choices?.[0]?.message ?? {};
  return {
    text: (m.content ?? "").trim(),
    toolCalls: (m.tool_calls ?? []).map((c: any) => {
      let input = {};
      try { input = JSON.parse(c.function?.arguments || "{}"); } catch {}
      return { id: c.id, name: c.function?.name, input };
    }),
  };
}

export function chat(cfg: ModelConfig, system: string, turns: Turn[], tools: ToolDef[], f: Fetch = fetch): Promise<Reply> {
  return cfg.provider === "anthropic" ? anthropic(cfg, system, turns, tools, f) : openaiCompatible(cfg, system, turns, tools, f);
}

// Model ids the provider offers, for suggestions in Settings. Empty on any failure:
// the field stays free text.
export async function listModels(cfg: ModelConfig, f: Fetch = fetch): Promise<string[]> {
  try {
    const res = await f(`${cfg.baseUrl}/models`, {
      method: "GET",
      headers: cfg.provider === "anthropic" ? { "x-api-key": cfg.key, "anthropic-version": "2023-06-01" } : { authorization: `Bearer ${cfg.key}` },
    });
    if (!res.ok) return [];
    const j: any = await res.json();
    return (j.data ?? []).map((m: any) => String(m.id)).filter(Boolean).sort();
  } catch { return []; }
}

// One tiny call to prove a provider + model pair works before it is saved.
export async function probe(cfg: ModelConfig, f: Fetch = fetch) {
  await chat(cfg, "Reply with OK.", [{ role: "user", text: "ping" }], [], f);
}
