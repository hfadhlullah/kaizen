// Splits a request that is written as `Label: … Label: …` into its head and labelled parts.
// A task is one inbox line, so a structured request arrives as one wall:
// "Fix x Problem: … Scope: … Acceptance criteria: (1) … (2) …". Split it, for display
// only, into the text before the first label and one part per label; inline (1) (2)
// become a numbered list. Fewer than two labels is plain text and is left whole.
export function brief(t: string) {
  // A label opens a sentence; only the first may follow the head without punctuation,
  // and then only as one word ("… previews Problem:"), so "the Board shows: x" is prose.
  const re =
      /(^|[.!?)]\s+|\s)((?:[A-Z][A-Z-]+(?: [A-Z][A-Z-]+){1,3}|[A-Z][\w-]*(?: [a-z][\w-]*){0,3})(?: \([^)]*\))?):\s+/g,
    cut = [];
  let m;
  while ((m = re.exec(t)))
    if (!/^\s+$/.test(m[1]) || (!cut.length && !m[2].includes(" ")))
      cut.push([m.index + m[1].length, m[2], re.lastIndex]);
  if (cut.length < 2) return { head: t, parts: [] };
  // Inline (1) (2) … become a list; numbers that do not run 1, 2, 3 keep their own text.
  const parts = cut.map(([, label, from], i) => {
    const body = t.slice(from, i + 1 < cut.length ? cut[i + 1][0] : t.length).trim(),
      n = body.split(/\s*\((\d+)\)\s+/);
    if (n.length < 5) return { label, body };
    const its = [];
    for (let k = 1; k < n.length; k += 2) its.push([n[k], n[k + 1]]);
    const seq = its.every(([d], k) => +d === k + 1);
    return {
      label,
      body: (n[0] ? n[0] + "\n" : "") + its.map(([d, x], k) => (seq ? `${k + 1}. ${x}` : `- (${d}) ${x}`)).join("\n"),
    };
  });
  return { head: t.slice(0, cut[0][0]).trim() || `${parts[0].label}: ${t.slice(cut[0][2], cut[1][0]).trim()}`, parts };
}
