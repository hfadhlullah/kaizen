import { load, post } from "./api.ts";
import { key } from "./cards.ts";
import { mic, stopDictation } from "./dictation.ts";
import { $, esc } from "./dom.ts";
import { DK, draft } from "./drafts.ts";
import { attach, brief, md } from "./markdown.ts";
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
let nfocus = null;
export function chat(c, src, ro) {
  const fix = (t) => attach(t, c);
  const entries = parseNotes(src);
  const b = c.kind === "idea" ? brief(c.text) : { parts: [] };
  let h =
    (b.parts.length
      ? `<section class="desc">${md(b.parts.map((p) => `### ${p.label}\n${p.body}`).join("\n\n"))}</section>`
      : "") +
    `<div class="chat">${entries.map((n) => `<div class="msg">${n.at ? `<time>${esc(n.at)}</time>` : ""}${md(fix(n.text))}</div>`).join("") || `<p style="color:var(--dim)">No notes yet.</p>`}</div>`;
  if (!ro)
    h += `<div class="notes"><textarea placeholder="Add a note. Paste a screenshot, or attach files."></textarea><div class="att" id="natt"></div><div class="tools"><input type="file" id="nfile" multiple hidden><button class="btn ghost" id="npick">Attach</button><span>Enter sends, Shift+Enter newline</span><button class="btn pri" id="nsend">Send</button></div></div>`;
  $("pbody").innerHTML = h;
  if (ro) return;
  const ta = $("pbody").querySelector("textarea"),
    files = [];
  draft(ta, "n:" + key(c));
  // Enter leaves focus in the box, and a focused box blocks the redraw: send blurs it
  // so the note shows, and the new box takes focus back for the next note.
  if (nfocus === key(c)) {
    nfocus = null;
    ta.focus();
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
  ta.onpaste = (e) => {
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
      ta.blur();
      load();
    }
  };
  $("nsend").onclick = send;
  ta.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };
  $("pbody").scrollTop = 0;
}
