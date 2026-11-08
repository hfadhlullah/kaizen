// One tile per PTY across the all-project snapshot, including secondary stage agents.
// Only the primary session carries asking/busy state; other entries in `all` are live keys.
export function terminalSessions(cards: any[], shells: any[]) {
  const sessions = new Map<string, any>();
  for (const c of cards) {
    if (c.archived || !c.pty) continue;
    for (const key of c.pty.all?.length ? c.pty.all : [c.pty.key]) {
      const pty = key === c.pty.key ? c.pty : { key, alive: true, asking: false };
      sessions.set(key, { ...c, pty });
    }
  }
  for (const s of shells) sessions.set(s.key, { kind: "shell", text: s.title, where: s.dir.replace(/[\\/]\.kaizen$/, ""), state: s.dir, pty: { key: s.key, alive: true, asking: false } });
  return sessions;
}
