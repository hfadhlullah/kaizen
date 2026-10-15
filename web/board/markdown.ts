import { esc } from "./dom.ts";

// The builder's "## Preview" section of 03-impl.md: how to run the app, or the result itself,
// and its "### How to test" steps.
// "## Commit" is the message the builder wrote for the work, offered at commit and push.
function section(impl, name) {
  const m = impl && impl.match(new RegExp(`^##\\s+${name}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$(?![\\s\\S]))`, "m"));
  return m ? m[1].trim() : null;
}
export const preview = (impl) => section(impl, "Preview");
// Links to a card's attachments/ (notes, or screenshots the builder put in Preview) via /file.
export const attach = (t, c) =>
  t.replace(
    /\]\((attachments\/[^)]+)\)/g,
    (_, p) =>
      `](/file?dir=${encodeURIComponent(c.state)}&p=${encodeURIComponent((c.kind === "run" ? `runs/${c.id}/` : "") + p)})`,
  );
export const commitMsg = (impl) => (section(impl, "Commit") || "").replace(/^```\w*\n|\n```$/g, "").trim();
// A plan's Open questions as a pick list: `Q: question` lines with `- option` lines under
// each, "(recommended)" marking the default and "multi-select" in the question allowing
// several. A blank or other line ends a question's options. The format is pinned in
// spec-plan.md; a section with content in any other shape is null, none at all is [].
export function planQuestions(src) {
  const lines = (src || "").split("\n"),
    at = lines.findIndex((l) => /^#+\s*(\d+\.\s*)?open questions/i.test(l.trim()));
  if (at < 0) return [];
  const lvl = /^#+/.exec(lines[at].trim())[0].length,
    out = [];
  let cur = null,
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
// An idea is one inbox line, so a structured request arrives as one wall:
// "Fix x Problem: … Scope: … Acceptance criteria: (1) … (2) …". Split it, for display
// only, into the text before the first label and one part per label; inline (1) (2)
// become a numbered list. Fewer than two labels is plain text and is left whole.
export function brief(t) {
  // A label opens a sentence; only the first may follow the head without punctuation,
  // and then only as one word ("… previews Problem:"), so "the Board shows: x" is prose.
  const re = /(^|[.!?)]\s+|\s)([A-Z][\w-]*(?: [a-z][\w-]*){0,3}):\s+/g,
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

// Enough markdown for kaizen's own files: headings, lists, fences, tables,
// inline code, bold. Everything is escaped first. With `tick`, a backlog item
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
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank"><img src="$2" alt="$1"></a>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank">$1</a>');
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
    out.push(`<p>${inl(buf.join(" "))}</p>`);
  }
  endList();
  return out.join("");
}

// A building run's progress.md, one `- todo|doing|done: text` line per Work-list item.
// prev: the statuses last drawn for this run; an item whose status moved gets .chg.
export function progress(src, prev) {
  const items = [...src.matchAll(/^\s*-\s*(todo|doing|done):\s*(.*)$/gm)].map((m) => [m[1], m[2]]);
  if (!items.length) return "";
  const n = items.filter((t) => t[0] === "done").length,
    pct = Math.round((n / items.length) * 100),
    ic = { done: "✓", doing: '<span class="pulse"></span>', todo: "" };
  return `<div class="prog"><div class="ph"><b>${n} of ${items.length} done</b><span>${pct}%</span></div><div class="pbar"><i style="width:${pct}%"></i></div><ol>${items.map(([st, t], i) => `<li class="p-${st}${prev && prev[i] && prev[i] !== st ? " chg" : ""}"><span class="pi">${ic[st]}</span><span>${esc(t).replace(/`([^`]+)`/g, "<code>$1</code>")}</span></li>`).join("")}</ol></div>`;
}
