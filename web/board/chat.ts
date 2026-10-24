import { load, post } from "./api.ts";
import { key } from "./cards.ts";
import { mic, stopDictation } from "./dictation.ts";
import { $, html, raw as rawHtml } from "./dom.ts";
import { DK, draft } from "./drafts.ts";
import { attach, brief, md } from "./markdown.ts";
import { rich } from "./rich.ts";
import { toast } from "./toast.ts";

// Notes are a chat: one entry per message, files attached by paste or picker.
function parseNotes(src) {
  const out = [];
  for (const raw of (src || "").split("\n")) {
    const m = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]\s?(.*)$/.exec(raw);
    if (m) {
      out.push({ at: m[1], text: m[2] });
      continue;
    }
    const last = out[out.length - 1];
    if (last) last.text += "\n" + raw.replace(/^\s{2}/, "");
    else if (raw.trim()) out.push({ at: "", text: raw });
  }
  return out.map((n) => ({ ...n, text: n.text.trim() })).filter((n) => n.text);
}
// A plain line written as "Label: … Label: …" reads as one paragraph per label.
// Markdown lines and fenced code are left as written.
export function pretty(t) {
  let fence = false;
  return t
    .split("\n")
    .map((l) => {
      if (/^```/.test(l)) fence = !fence;
      if (fence || /^\s*(#|```|\||[-*]\s|\d+\.\s|>)/.test(l)) return l;
      const b = brief(l);
      if (!b.parts.length) return l;
      const head = l.startsWith(b.parts[0].label + ":") ? [] : [b.head];
      return "\n" + [...head, ...b.parts.map((p) => `**${p.label}:** ${p.body}`)].join("\n\n") + "\n";
    })
    .join("\n")
    .trim();
}
let nfocus = null;
export function chat(c, src, ro) {
  const fix = (t) => attach(t, c);
  const entries = parseNotes(src);
  const b = c.kind === "idea" ? brief(c.text) : { parts: [] };
  let h =
    (b.parts.length
      ? html`<section class="desc">
          ${rawHtml(md(b.parts.map((p) => `### ${p.label}\n${p.body}`).join("\n\n")))}
        </section>`
      : "") +
    html`<div class="chat">
      ${entries.map((n) => html`<div class="msg">${n.at ? html`<time>${n.at}</time>` : ""}${rawHtml(md(fix(pretty(n.text))))}</div>`)}${entries.length ? "" : html`<p style="color:var(--dim)">No notes yet.</p>`}
    </div>`;
  if (!ro)
    h += `<div class="notes"><textarea placeholder="Add a note. Paste a screenshot, or attach files."></textarea><div class="att" id="natt"></div><div class="tools"><input type="file" id="nfile" multiple hidden><button class="btn ghost" id="npick">Attach</button><span>Enter sends, Shift+Enter newline</span><button class="btn pri" id="nsend">Send</button></div></div>`;
  $("pbody").innerHTML = rawHtml(h);
  if (ro) return;
  const ta = $("pbody").querySelector("textarea"),
    files = [];
  draft(ta, "n:" + key(c));
  const ed = rich(ta);
  // Enter leaves focus in the box, and a focused box blocks the redraw: send blurs it
  // so the note shows, and the new box takes focus back for the next note.
  if (nfocus === key(c)) {
    nfocus = null;
    ed.focus();
  }
  {
    const m = mic([ta]);
    if (m) $("npick").before(m);
  }
  const show = () => {
    $("natt").textContent = files.map((f) => f.name).join(" · ");
  };
  const add = (f) => {
    files.push(f);
    show();
  };
  $("npick").onclick = () => $("nfile").click();
  $("nfile").onchange = (e) => {
    [...e.target.files].forEach(add);
    e.target.value = "";
  };
  ed.onpaste = (e) => {
    for (const it of e.clipboardData.items)
      if (it.kind === "file") {
        const f = it.getAsFile();
        add(new File([f], f.name === "image.png" ? `paste-${Date.now()}.png` : f.name, { type: f.type }));
        e.preventDefault();
      }
  };
  const send = async () => {
    stopDictation(true);
    const text = ta.value.trim();
    if (!text && !files.length) return;
    const enc = await Promise.all(
      files.map(
        (f) =>
          new Promise((r) => {
            const rd = new FileReader();
            rd.onload = () => r({ name: f.name, data: rd.result });
            rd.readAsDataURL(f);
          }),
      ),
    );
    const body =
      c.kind === "run" ? { dir: c.state, id: c.id, text, files: enc } : { dir: c.state, for: c.text, text, files: enc };
    const r = await post("/note", body);
    if (r.ok) {
      files.length = 0;
      ta.value = "";
      try {
        sessionStorage.removeItem(DK + "n:" + key(c));
      } catch (e) {}
      toast("Noted");
      nfocus = key(c);
      ed.blur();
      load();
    }
  };
  $("nsend").onclick = send;
  ed.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };
  $("pbody").scrollTop = 0;
}
