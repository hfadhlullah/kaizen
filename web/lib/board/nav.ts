// Arrows and hjkl on the Board, as on the terminal board: up/down within a column, left/right to the nearest column with
// cards, at the same row or its last card. The Board registers its element; nothing here looks one up by id.
export const boardRoot: { el: HTMLElement | null } = { el: null };

export const cardEl = (k: string | null | undefined) =>
  k ? (boardRoot.el?.querySelector<HTMLElement>('.card[data-k="' + CSS.escape(k) + '"]') ?? null) : null;
export const focusedKey = () =>
  (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("#board .card")?.dataset.k;
export function nav(dx: number, dy: number) {
  const cols = [...(boardRoot.el?.querySelectorAll("section") ?? [])]
    .map((s) => [...s.querySelectorAll<HTMLElement>(".card")])
    .filter((l) => l.length);
  if (!cols.length) return;
  const cur = (document.activeElement as HTMLElement).closest(".card") as HTMLElement | null;
  let ci = cols.findIndex((l) => cur && l.includes(cur)),
    ri = 0;
  if (ci < 0) ci = 0;
  else {
    ri = cols[ci]!.indexOf(cur!);
    if (dy) ri = Math.max(0, Math.min(cols[ci]!.length - 1, ri + dy));
    else {
      ci = Math.max(0, Math.min(cols.length - 1, ci + dx));
      ri = Math.min(ri, cols[ci]!.length - 1);
    }
  }
  const t = cols[ci]![ri]!;
  t.focus({ preventScroll: true });
  t.scrollIntoView({ block: "nearest", inline: "nearest" });
}
