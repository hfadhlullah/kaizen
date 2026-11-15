// The search palette's matcher, apart from the page so a test can load it.
export type Item = {
  group: string;
  title: string;
  sub?: string;
  when?: string;
  hay: string;
  at?: number;
  dot?: string;
  ico: string;
  act: () => void;
};

// One edit away: a letter missing, extra, wrong, or two swapped ("tsaks" for "tasks").
export function near(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // one letter wrong
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // two swapped
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  return s.slice(i) === l.slice(i + 1); // one letter extra
}

// Whether `w` is in the text: as typed, or (from 4 letters) one typo away from a word of it.
const has = (text: string, w: string) => text.includes(w) || (w.length >= 4 && text.split(/[^\p{L}\p{N}]+/u).some((t) => near(w, t.slice(0, w.length)) || near(w, t)));

// Every word of the query in the item (a typo allowed in the longer words). Ranked: the title is the query, starts with it, has a
// word that starts with it, holds it, else the rest; then what waits on you, then recency.
export function match(list: Item[], q: string): Item[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  const lq = q.trim().toLowerCase();
  const score = (i: Item) => {
    const t = i.title.toLowerCase();
    return t === lq ? 0 : t.startsWith(lq) ? 1 : t.split(/[^\p{L}\p{N}]+/u).some((x) => x.startsWith(lq)) ? 2 : t.includes(lq) ? 3 : 4;
  };
  return list
    .filter((i) => {
      const h = (i.title + " " + (i.sub ?? "") + " " + i.hay).toLowerCase();
      return words.every((w) => has(h, w));
    })
    .sort((a, b) => score(a) - score(b) || +(b.dot === "wait") - +(a.dot === "wait") || (b.at ?? 0) - (a.at ?? 0));
}
