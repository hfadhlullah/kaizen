// The marks of the first three request sources, in the side menu's Icebox item: a social platform's sprite, a sheet's
// grid, else the site's favicon. Drawn by components/rail/source-marks.tsx.
export type SourceMark = { kind: "social" | "sheet" | "icon"; id: string };
export const sourceMark = (s: { social?: string; url: string }): SourceMark | null => {
  if (s.social) return { kind: "social", id: `#i-b-${s.social}` };
  if (/docs\.google\.com\/spreadsheets|\.(csv|tsv)$/.test(s.url)) return { kind: "sheet", id: "#i-sheet" };
  try {
    return { kind: "icon", id: `${new URL(s.url).origin}/favicon.ico` };
  } catch {
    return null;
  }
};
export const marksOf = (sources: { social?: string; url: string }[] | undefined): SourceMark[] =>
  (sources ?? [])
    .slice(0, 3)
    .map(sourceMark)
    .filter((m): m is SourceMark => !!m);
