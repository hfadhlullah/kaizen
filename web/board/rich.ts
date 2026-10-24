import { esc } from "./dom.ts";
import { md } from "./markdown.ts";

// The card note box formats as you type: a contenteditable editor over a hidden
// textarea that stays the field's value, so drafts, dictation and send are unchanged.
// The editor is turned back into markdown on every edit; typing a markdown pattern
// (`**b**`, `` `c` ``, `- `, `1. `, `# `) re-renders the editor with md().

const ZW = /\u200b/g;
// Editor DOM to markdown. Paragraph blocks are separated by a blank line, list items
// by a newline, so md() renders them back as the same blocks.
export function toMd(root) {
  const inl = (n) => {
    // pre-wrap: a soft break typed in Chrome is a "\n" in the text.
    if (n.nodeType === 3)
      return n.textContent
        .replace(ZW, "")
        .replace(/\u00a0/g, " ")
        .replace(/\n/g, "  \n");
    if (n.nodeType !== 1) return "";
    const t = n.nodeName.toLowerCase(),
      kids = () => [...n.childNodes].map(inl).join("");
    if (t === "br") return "  \n";
    if (t === "b" || t === "strong") return ((s) => (s.trim() ? `**${s}**` : s))(kids());
    if (t === "i" || t === "em") return ((s) => (s.trim() ? `*${s}*` : s))(kids());
    if (t === "code") return ((s) => (s ? "`" + s + "`" : s))(n.textContent.replace(ZW, ""));
    if (t === "img") return `![${n.getAttribute("alt") || ""}](${n.getAttribute("src")})`;
    if (t === "a") {
      const img = [...n.childNodes].find((c) => c.nodeName.toLowerCase() === "img");
      return img ? inl(img) : `[${kids()}](${n.getAttribute("href")})`;
    }
    return kids();
  };
  const out = [];
  let buf = "";
  const flush = () => {
    if (buf.trim()) out.push(buf.replace(/^\n+|\s*\n+$/g, ""));
    buf = "";
  };
  for (const n of root.childNodes) {
    const t = n.nodeType === 1 ? n.nodeName.toLowerCase() : "";
    if (/^h[1-6]$/.test(t)) {
      flush();
      out.push("#".repeat(+t[1]) + " " + inl(n).trim());
    } else if (t === "ul" || t === "ol") {
      flush();
      const lis = [...n.childNodes].filter((c) => c.nodeName.toLowerCase() === "li");
      out.push(lis.map((li, i) => (t === "ol" ? `${i + 1}. ` : "- ") + inl(li).trim()).join("\n"));
    } else if (t === "pre") {
      flush();
      out.push("```\n" + n.textContent + "\n```");
    } else if (t === "p" || t === "div") {
      flush();
      buf = toMd(n);
      flush();
    } else buf += inl(n);
  }
  flush();
  return out.join("\n\n");
}

// A line just typed into a markdown pattern md() would format. Text already inside
// code or bold is not raw markdown: a code span showing `**` must not match.
const INL = /\*\*[^*]+\*\*|`[^`]+`|(^|[^*])\*[^*\s][^*]*\*(?!\*)/;
const typed = (line) => {
  const raw = [];
  const walk = (n) => {
    if (n.nodeType === 3) raw.push(n.textContent.replace(/\u00a0/g, " "));
    else if (!/^(CODE|B|STRONG|I|EM)$/.test(n.nodeName)) n.childNodes.forEach(walk);
  };
  walk(line);
  const txt = raw.join("");
  return (
    INL.test(txt) ||
    (!/^(LI|H\d)$/.test(line.nodeName) && /^\s*([-*]|\d+\.|#{1,6})\s/.test(line.textContent.replace(/\u00a0/g, " ")))
  );
};

export function rich(ta) {
  const ed = document.createElement("div");
  ed.className = "rich";
  ed.contentEditable = "true";
  ed.setAttribute("role", "textbox");
  ed.setAttribute("aria-multiline", "true");
  ed.dataset.ph = ta.placeholder;
  ta.hidden = true;
  ta.after(ed);
  // Top-level lines, list items counted one each: where the caret goes back to.
  const lines = () => [...ed.querySelectorAll(":scope > :not(ul):not(ol), :scope > ul > li, :scope > ol > li")];
  const render = (src) => {
    // An empty item or heading needs a <br> to hold the caret.
    ed.innerHTML = md(src).replace(/<(li|h\d)><\/\1>/g, "<$1><br></$1>");
    for (const l of lines()) {
      const last = l.lastChild;
      if (last && last.nodeType === 1 && /^(B|I|CODE|A)$/.test(last.nodeName)) l.append("\u200b");
    }
  };
  const caretAt = (el) => {
    const r = document.createRange();
    r.selectNodeContents(el || ed);
    r.collapse(false);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  };
  let own = false;
  const sync = () => {
    own = true;
    ta.value = toMd(ed);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    own = false;
  };
  ed.addEventListener("input", () => {
    const s = getSelection();
    const all = lines();
    const i = s.rangeCount ? all.findIndex((l) => l.contains(s.anchorNode)) : -1;
    const line = all[i] || (s.anchorNode && s.anchorNode.parentNode === ed ? ed : null);
    sync();
    // Emptied: leave no stray <br>, so the placeholder shows again.
    if (!ta.value.trim() && !ed.querySelector("img")) ed.replaceChildren();
    else if (line && typed(line)) {
      // ponytail: whole-editor re-render, caret to the end of the same line; per-line patching if notes grow long.
      const at = i < 0 ? 0 : i;
      render(ta.value);
      caretAt(lines()[at]);
    }
  });
  // Dictation or a restored draft changed the value: show it.
  ta.addEventListener("input", () => {
    if (own) return;
    render(ta.value);
    if (document.activeElement === ed) caretAt(null);
  });
  ed.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault();
      document.execCommand("bold");
    } else if (mod && e.key.toLowerCase() === "e") {
      e.preventDefault();
      const t = String(getSelection());
      if (t) document.execCommand("insertHTML", false, `<code>${esc(t)}</code>\u200b`);
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      // A new item in a list or after a heading; a soft line break in a paragraph.
      const n = getSelection().anchorNode;
      const el = n && (n.nodeType === 1 ? n : n.parentElement);
      document.execCommand(el && el.closest("li,h1,h2,h3,h4,h5,h6") ? "insertParagraph" : "insertLineBreak");
    }
  });
  // Files are handled by the caller; text comes in plain, never as foreign HTML.
  ed.addEventListener("paste", (e) => {
    if ([...e.clipboardData.items].some((it) => it.kind === "file")) return;
    const t = e.clipboardData.getData("text/plain");
    e.preventDefault();
    if (t) document.execCommand("insertText", false, t);
  });
  if (ta.value) render(ta.value);
  return ed;
}
