// Enough markdown for kaizen's own text, as data a component draws (components/markdown/markdown.tsx): headings, lists, fences,
// tables, inline code, bold, italic, links, images, hard line breaks. Nothing here makes HTML: a link or image whose
// address is not web, mail or relative stays as its own text. Same rules as the old board/markdown.ts md().
import { safeUrl } from "../url/index.ts";

export type Inline =
  | string
  | { k: "code"; t: string }
  | { k: "b" | "i"; c: Inline[] }
  | { k: "a"; href: string; c: Inline[] }
  | { k: "img"; src: string; alt: string };
export type Block =
  | { k: "pre"; t: string }
  | { k: "h"; level: 1 | 2 | 3; c: Inline[] }
  | { k: "hr" }
  | { k: "table"; head: Inline[][]; rows: Inline[][][] }
  | { k: "list"; ordered: boolean; items: Inline[][] }
  | { k: "p"; lines: Inline[][] }; // lines are separated by a hard break

const INLINE =
  /`([^`]+)`|\*\*([^*]+)\*\*|(?<!\*)\*([^*\s][^*]*?)\*(?!\*)|!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)/g;
export function inline(text: string): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > at) out.push(text.slice(at, m.index));
    at = m.index! + m[0].length;
    if (m[1] != null) out.push({ k: "code", t: m[1] });
    else if (m[2] != null) out.push({ k: "b", c: inline(m[2]) });
    else if (m[3] != null) out.push({ k: "i", c: inline(m[3]) });
    else if (m[5] != null) out.push(safeUrl(m[5]) ? { k: "img", src: m[5], alt: m[4] ?? "" } : m[0]);
    else out.push(safeUrl(m[7]!) ? { k: "a", href: m[7]!, c: inline(m[6]!) } : m[0]);
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

export function parse(src: string): Block[] {
  const lines = src.split("\n"),
    out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i]!;
    if (/^```/.test(l)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) buf.push(lines[i++]!);
      out.push({ k: "pre", t: buf.join("\n") });
      i++;
      continue;
    }
    const hm = /^(#{1,6})\s+(.*)$/.exec(l);
    if (hm) {
      out.push({ k: "h", level: Math.min(hm[1]!.length, 3) as 1 | 2 | 3, c: inline(hm[2]!) });
      i++;
      continue;
    }
    if (/^---+$/.test(l.trim())) {
      out.push({ k: "hr" });
      i++;
      continue;
    }
    if (/^\|/.test(l)) {
      const rows: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i]!)) rows.push(lines[i++]!);
      const cells = (r: string) =>
        r
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => inline(c.trim()));
      const body = rows.filter((r) => !/^\|\s*-/.test(r)).map(cells);
      out.push({ k: "table", head: body[0] ?? [], rows: body.slice(1) });
      continue;
    }
    const li = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(l);
    if (li) {
      const ordered = /^\s*\d+\./.test(l),
        prev = out[out.length - 1];
      // A list goes on while the kind stays the same; a blank line ends it (and starts a new one).
      const list = prev?.k === "list" && prev.ordered === ordered && ended.get(prev) !== true ? prev : null;
      const item = inline(li[1]!);
      if (list) list.items.push(item);
      else out.push({ k: "list", ordered, items: [item] });
      i++;
      continue;
    }
    if (!l.trim()) {
      const prev = out[out.length - 1];
      if (prev?.k === "list") ended.set(prev, true);
      i++;
      continue;
    }
    const buf = [l];
    i++;
    while (i < lines.length && lines[i]!.trim() && !/^(#|```|\||\s*[-*]\s|\s*\d+\.\s|---)/.test(lines[i]!))
      buf.push(lines[i++]!);
    // A line ending in two spaces is a hard line break.
    const parts: string[] = [];
    let cur = "";
    buf.forEach((b, k) => {
      if (k < buf.length - 1 && / {2}$/.test(b)) (parts.push(cur + (cur ? " " : "") + b.trimEnd()), (cur = ""));
      else cur += (cur ? " " : "") + b;
    });
    parts.push(cur);
    out.push({ k: "p", lines: parts.map(inline) });
  }
  return out;
}
const ended = new WeakMap<Block, boolean>();
