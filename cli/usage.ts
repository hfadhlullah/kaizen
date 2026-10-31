// The board footer's agent usage and phone status. Usage is the agent's own plan
// windows (5 hours, a week): Codex writes them into its session logs, Claude answers
// them from its OAuth usage endpoint. The Claude token is read here, sent only to
// api.anthropic.com, and never returned or logged.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type Window = { pct: number; resetsAt: number | null };
export type Usage = { agent: string; five: Window | null; week: Window | null } | { agent: string; error: string; expired?: boolean };

const win = (pct: unknown, resets: unknown): Window | null =>
  typeof pct === "number" ? { pct: Math.round(pct), resetsAt: typeof resets === "number" ? resets * 1000 : typeof resets === "string" ? Date.parse(resets) || null : null } : null;

// The last rate_limits in the newest ~/.codex/sessions/**/rollout-*.jsonl that has one, or null.
export const codexUsage = (home: string) => codexUsageAt(join(home, ".codex"));
export function codexUsageAt(dir: string): Usage | null {
  const root = join(dir, "sessions");
  if (!existsSync(root)) return null;
  // Newest first: a session that has only just started has no rate_limits line yet.
  const files = [...new Bun.Glob("**/rollout-*.jsonl").scanSync({ cwd: root })]
    .map((f) => ({ f, t: statSync(join(root, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    // ponytail: batch tools start dozens of sessions at once with no limits in them; 300 files covers that, a cursor file would scale further.
    .slice(0, 300);
  for (const { f } of files) {
    const lines = readFileSync(join(root, f), "utf8").split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i]!.includes('"rate_limits"')) continue;
      try {
        const find = (o: any): any => o && typeof o === "object" ? ("rate_limits" in o ? o.rate_limits : Object.values(o).map(find).find(Boolean)) : null;
        const rl = find(JSON.parse(lines[i]!));
        if (!rl) continue;
        const by = (m: number) => [rl.primary, rl.secondary].find((w) => w?.window_minutes === m);
        const five = by(300), week = by(10080);
        if (!five && !week) continue;
        return { agent: "codex", five: win(five?.used_percent, five?.resets_at), week: win(week?.used_percent, week?.resets_at) };
      } catch { /* a torn last line: try the one before */ }
    }
  }
  return null;
}

// Claude's plan usage, or null when there is no Claude login. A failure is an error
// entry, so the footer says "usage unavailable" instead of showing 0%.
export const claudeUsage = (home: string, get: typeof fetch = fetch) => claudeUsageAt(join(home, ".claude"), get);
export async function claudeUsageAt(dir: string, get: typeof fetch = fetch): Promise<Usage | null> {
  let token = "";
  try { token = JSON.parse(readFileSync(join(dir, ".credentials.json"), "utf8"))?.claudeAiOauth?.accessToken ?? ""; } catch { return null; }
  if (!token) return null;
  try {
    const r = await get("https://api.anthropic.com/api/oauth/usage", { headers: { authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { agent: "claude", error: `HTTP ${r.status}`, ...(r.status === 401 ? { expired: true } : {}) };
    const d: any = await r.json();
    return { agent: "claude", five: win(d?.five_hour?.utilization, d?.five_hour?.resets_at), week: win(d?.seven_day?.utilization, d?.seven_day?.resets_at) };
  } catch (e) {
    // The message is the fetch's own; scrub the token in case a client ever echoes it.
    return { agent: "claude", error: String((e as Error)?.name === "TimeoutError" ? "timed out" : (e as Error)?.message ?? e).split(token).join("…") };
  }
}

// Phones on the tailnet from `tailscale status --json`: iOS and Android peers.
export type Computer = { name: string; dns: string; os: string; online: boolean };
export function phonePeers(json: string): { running: boolean; phones: { name: string; online: boolean }[]; computers: Computer[]; self: Computer | null } {
  try {
    const s = JSON.parse(json);
    const peers = Object.values<any>(s?.Peer ?? {});
    const isPhone = (p) => /^(ios|android)$/i.test(p?.OS ?? "");
    const phones = peers.filter(isPhone).map((p) => ({ name: String(p.HostName ?? p.DNSName ?? ""), online: !!p.Online }));
    // The other computers on the tailnet: the phone's Home lists them, a tap opens their board.
    const comp = (p, online = !!p.Online): Computer => ({ name: String(p.HostName ?? ""), dns: String(p.DNSName ?? "").replace(/\.$/, ""), os: String(p.OS ?? ""), online });
    const computers = peers.filter((p) => p?.OS && !isPhone(p)).map((p) => comp(p));
    return { running: s?.BackendState === "Running", phones, computers, self: s?.Self ? comp(s.Self, true) : null };
  } catch { return { running: false, phones: [], computers: [], self: null }; }
}
