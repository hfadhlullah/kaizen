// The only URLs a note may open or embed: web, mail, and relative paths. Everything
// else (javascript:, data:, vbscript:, file:) is null and the page leaves it as text.
export function safeUrl(u: string): string | null {
  const s = u.trim();
  if (!s || /[\x00-\x1f]/.test(s)) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  if (!scheme) return s.startsWith("//") ? null : s;
  return ["http", "https", "mailto"].includes(scheme[1]!.toLowerCase()) ? s : null;
}
