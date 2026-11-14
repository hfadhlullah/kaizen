// The notes editor's markdown as an HTML string (lib/notes/rich.ts sets it into its contenteditable, then reads it back with toMd).
// Every other reader of markdown draws it with React (lib/markdown, components/markdown).
import { safeUrl } from "@lib/url";

export const esc = (s: unknown) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Enough markdown for kaizen's own files: headings, lists, fences, tables,
// inline code, bold, italic, hard line breaks. Everything is escaped first. With `tick`, a backlog item
// (`- open: …`, `- done: …`, `- rejected: …`) shows its status as a checkbox.
export function md(src, tick) {
  const lines = src.split("\n"),
    out = [];
  let i = 0,
    list = null;
  const inl = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*])\*([^*\s<][^*<]*?)\*(?!\*)/g, "$1<i>$2</i>")
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, a, u) =>
        safeUrl(u) ? `<a href="${u}" target="_blank" rel="noopener noreferrer"><img src="${u}" alt="${a}"></a>` : m,
      )
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) =>
        safeUrl(u) ? `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>` : m,
      );
  const endList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) {
      endList();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      out.push(`<pre>${esc(buf.join("\n"))}</pre>`);
      i++;
      continue;
    }
    const hm = /^(#{1,6})\s+(.*)$/.exec(l);
    if (hm) {
      endList();
      out.push(`<h${Math.min(hm[1].length, 3)}>${inl(hm[2])}</h${Math.min(hm[1].length, 3)}>`);
      i++;
      continue;
    }
    if (/^---+$/.test(l.trim())) {
      endList();
      out.push("<hr>");
      i++;
      continue;
    }
    if (/^\|/.test(l)) {
      endList();
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) =>
        r
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => inl(c.trim()));
      out.push(
        "<table>" +
          rows
            .filter((r) => !/^\|\s*-/.test(r))
            .map(
              (r, n) =>
                `<tr>${cells(r)
                  .map((c) => (n ? `<td>${c}</td>` : `<th>${c}</th>`))
                  .join("")}</tr>`,
            )
            .join("") +
          "</table>",
      );
      continue;
    }
    const li = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(l);
    if (li) {
      const t = /^\s*\d+\./.test(l) ? "ol" : "ul";
      if (list !== t) {
        endList();
        out.push(`<${t}>`);
        list = t;
      }
      const tk = tick && /^(open|done|rejected):\s*(.*)$/.exec(li[1]);
      out.push(
        tk
          ? `<li class="tk${tk[1] === "rejected" ? " rej" : ""}"><label><input type="checkbox" tabindex="-1" aria-disabled="true" onclick="return false"${tk[1] === "done" ? " checked" : ""} aria-label="${tk[1]}"><span>${inl(tk[2])}</span></label></li>`
          : `<li>${inl(li[1])}</li>`,
      );
      i++;
      continue;
    }
    if (!l.trim()) {
      endList();
      i++;
      continue;
    }
    endList();
    const buf = [l];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#|```|\||\s*[-*]\s|\s*\d+\.\s|---)/.test(lines[i]))
      buf.push(lines[i++]);
    // A line ending in two spaces is a hard line break.
    out.push(
      `<p>${inl(buf.map((l, k) => (k < buf.length - 1 && / {2}$/.test(l) ? l.trimEnd() + "\0" : l)).join(" ")).replace(/\0 /g, "<br>")}</p>`,
    );
  }
  endList();
  return out.join("");
}
