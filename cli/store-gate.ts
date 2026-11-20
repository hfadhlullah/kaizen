// The gate between "kaizen looked at it" and "kaizen installs it": POST /skills/inspect issues a one-time token bound to
// what it looked at (kind, source, name) and whether it was careful; an install must bring that token, for that same
// thing, within 15 minutes, and `risky: true` when it was careful. A token is spent by any attempt.
export type Look = { kind: "skill" | "plugin"; source: string; name: string; careful: boolean; at: number };
const TTL = 15 * 60_000;
export function gate(now: () => number = Date.now) {
  const looked = new Map<string, Look>();
  return {
    issue(l: Omit<Look, "at">): string {
      for (const [t, v] of looked) if (now() - v.at > TTL) looked.delete(t);
      const token = crypto.randomUUID();
      looked.set(token, { ...l, at: now() });
      return token;
    },
    // null: allowed; otherwise why not.
    take(token: unknown, want: { kind: "skill" | "plugin"; source: string; name: string; risky: boolean }): string | null {
      const t = typeof token === "string" ? token : "";
      const l = looked.get(t);
      looked.delete(t);
      if (!l || now() - l.at > TTL || l.kind !== want.kind || l.name !== want.name || (want.kind === "skill" && l.source !== want.source))
        return "look at it first: inspect required";
      if (l.careful && !want.risky) return "this one needs your second confirm first";
      return null;
    },
  };
}
