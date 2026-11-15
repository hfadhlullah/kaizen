// When a notice is worth sending, for both UIs: each keeps one of these, and the
// web board's bundle carries this very file, so it must stand on its own -- no
// imports, no outer names. A run never seen before says nothing, which covers first
// load and a run arriving already waiting. A `done` within a minute of the run
// leaving a wait was finished by the person's own decision, so that one stays quiet.
// ponytail: a fixed minute; an approval whose last writes take longer still pings.
export function notifier() {
  const said = new Map<string, string | null>(), left = new Map<string, number>();
  return (key: string, say: string | null, done: boolean, now: number) => {
    const before = said.get(key);
    said.set(key, say);
    if (before && say !== before) left.set(key, now);
    return before !== undefined && !!say && say !== before && !(done && now - (left.get(key) ?? -Infinity) < 60_000);
  };
}
