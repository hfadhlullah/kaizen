// What a pasted or dropped image becomes in a terminal: the saved file's path, typed in, which
// is how Claude Code and Codex take an image. Kept apart from term.ts so it is testable.
export const imageFiles = <F extends { type: string }>(files: ArrayLike<F> | null | undefined): F[] =>
  [...(files ?? [])].filter((f) => f.type.startsWith("image/"));

// Paths with spaces (C:\Users\Jane Doe\...) are quoted; empty ones, from a refused upload, dropped.
export function pathsText(paths: string[]): string {
  const ok = paths.filter(Boolean).map((p) => (/\s/.test(p) ? `"${p}"` : p));
  return ok.length ? ok.join(" ") + " " : "";
}
