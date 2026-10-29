// The search palette's matcher, apart from the page so a test can load it.
export type Item = { group: string; title: string; sub?: string; when?: string; hay: string; at?: number; dot?: string; ico: string; act: () => void };

// Every word of the query in the item; a title that starts with it ranks first, then a title
// holding it, then the rest by recency.
export function match(list: Item[], q: string): Item[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  const lq = q.trim().toLowerCase();
  const score = (i: Item) => {
    const t = i.title.toLowerCase();
    return t.startsWith(lq) ? 0 : t.includes(lq) ? 1 : 2;
  };
  return list
    .filter((i) => {
      const h = (i.title + " " + (i.sub ?? "") + " " + i.hay).toLowerCase();
      return words.every((w) => h.includes(w));
    })
    .sort((a, b) => score(a) - score(b) || (b.at ?? 0) - (a.at ?? 0));
}
