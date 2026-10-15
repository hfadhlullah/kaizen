import { el } from "./dom.ts";

// ---- markdown: agent replies are Markdown. mdTree turns one into [tag, props, ...kids] nodes with
// strings as text, and mdNodes draws them through el(), so model text never becomes HTML.
// Unclosed or unknown syntax stays as literal text; links only for http(s) and mailto.
const SAFE_URL = /^(https?:|mailto:)/i;
const INLINE =
  /`([^`\n]+)`|\*\*(?=\S)(.+?)(?<=\S)\*\*|(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])|(?<!\w)_(?=\S)(.+?)(?<=\S)_(?!\w)|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
function mdInline(s) {
  const out = [],
    re = new RegExp(INLINE);
  let i = 0,
    m;
  while ((m = re.exec(s))) {
    if (m.index > i) out.push(s.slice(i, m.index));
    if (m[1] != null) out.push(["code", {}, m[1]]);
    else if (m[2] != null) out.push(["strong", {}, ...mdInline(m[2])]);
    else if (m[3] != null || m[4] != null) out.push(["em", {}, ...mdInline(m[3] ?? m[4])]);
    else if (SAFE_URL.test(m[6]))
      out.push(["a", { href: m[6], target: "_blank", rel: "noopener noreferrer" }, ...mdInline(m[5])]);
    else out.push(m[0]);
    i = re.lastIndex;
  }
  if (i < s.length) out.push(s.slice(i));
  return out;
}
export function mdTree(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n"),
    out = [];
  const UL = /^\s*[-*+]\s+(.*)$/,
    OL = /^\s*(\d+)[.)]\s+(.*)$/,
    H = /^#{1,6}\s+(.*?)(\s+#+)?\s*$/,
    FENCE = /^\s*(```|~~~)/,
    HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
  const deep = (s) => /^\s{2,}/.test(s);
  const item = (o, u) => ["li", {}, ...mdInline(o ? o[2] : u[1])];
  const list = (o) => [o ? "ol" : "ul", o && +o[1] !== 1 ? { start: o[1] } : {}];
  const starts = (s) => FENCE.test(s) || H.test(s) || HR.test(s) || (!deep(s) && (UL.test(s) || OL.test(s)));
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    if (FENCE.test(l)) {
      const f = l.trim().slice(0, 3),
        body = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(f); i++) body.push(lines[i]);
      i++;
      out.push(["pre", {}, ["code", {}, body.join("\n")]]);
      continue;
    }
    if (HR.test(l)) {
      i++;
      out.push(["hr", {}]);
      continue;
    }
    let m = l.match(H);
    if (m) {
      i++;
      out.push(["h4", {}, ...mdInline(m[1])]);
      continue;
    }
    if (starts(l)) {
      // One list per run of items; an indented item nests one level under the item above it.
      const ordered = OL.test(l),
        top = list(l.match(OL));
      for (; i < lines.length && lines[i].trim(); i++) {
        const s = lines[i],
          o = s.match(OL),
          u = !o && s.match(UL),
          last = top[top.length - 1];
        if (!deep(s)) {
          if (!o === ordered || (!o && !u)) break;
          top.push(item(o, u));
          continue;
        }
        if (o || u) {
          let sub = last[last.length - 1];
          if (!Array.isArray(sub) || sub[0] !== (o ? "ol" : "ul")) last.push((sub = list(o)));
          sub.push(item(o, u));
        } else last.push(["br", {}], ...mdInline(s.trim()));
      }
      out.push(top);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !(para.length && starts(lines[i]))) para.push(lines[i++].trim());
    out.push(["p", {}, ...para.flatMap((p, k) => (k ? [["br", {}], ...mdInline(p)] : mdInline(p)))]);
  }
  return out;
}
export const mdNodes = (n) => (typeof n === "string" ? n : el(n[0], n[1], ...n.slice(2).map(mdNodes)));
