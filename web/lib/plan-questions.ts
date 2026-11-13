// A plan's Open questions as a pick list: `Q: question` lines with `- option` lines under
// each, "(recommended)" marking the default and "multi-select" in the question allowing
// several. A blank or other line ends a question's options. The format is pinned in
// spec-plan.md; a section with content in any other shape is null, none at all is [].
export type PlanQuestion = { q: string; multi: boolean; options: { text: string; rec: boolean; label: string }[] };
export function planQuestions(src: string | undefined): PlanQuestion[] | null {
  const lines = (src || "").split("\n"),
    at = lines.findIndex((l) => /^#+\s*(\d+\.\s*)?open questions/i.test(l.trim()));
  if (at < 0) return [];
  const lvl = /^#+/.exec(lines[at]!.trim())![0].length,
    out: PlanQuestion[] = [];
  let cur: PlanQuestion | null = null,
    said = false;
  for (const raw of lines.slice(at + 1)) {
    const l = raw.trim(),
      h = /^#+(?=\s)/.exec(l);
    if (h && h[0].length <= lvl) break;
    if (!h && l && !/^```/.test(l) && !/^none\.?$/i.test(l)) said = true;
    const q = /^\**Q\d*\s*[:.)]\**\s*(.+)$/.exec(l);
    if (q) {
      out.push((cur = { q: q[1].trim(), multi: /multi-?select/i.test(q[1]), options: [] }));
      continue;
    }
    const o = /^[-*]\s+(.+)$/.exec(l);
    if (o && cur) {
      const t = o[1].trim();
      cur.options.push({
        text: t,
        rec: /\(recommended\)/i.test(t),
        label: t
          .replace(/\s*\(recommended\)/i, "")
          .split(/\s+[—–-]\s+|:\s/)[0]
          .trim(),
      });
    } else if (cur && cur.options.length) cur = null;
  }
  const qs = out.filter((x) => x.options.length);
  return qs.length || !said ? qs : null;
}
