// A card's Notes tab, apart from the screen: how the notes file reads as messages, how a plain line with labels is split
// into paragraphs, and what a sent note looks like on the wire. Pure, so it is tested.
import { brief } from "@lib/core";

// The card whose notes are open: a run (`kind: "run"`) or a task (`kind: "idea"`) of the project at `state`.
export type NoteCard = { _k?: string; kind: string; state: string; id?: string; text?: string };
export type Note = { at: string; text: string };

// The board's key for a card (its `_k`, else the kind, project and id or text).
export const noteKey = (c: NoteCard) =>
  c._k || (c.kind === "idea" ? "idea:" + c.state + ":" + c.text : "run:" + c.state + ":" + c.id);

// Notes are a chat: one entry per message, `[YYYY-MM-DD HH:MM] text`, the following lines indented two spaces. Text
// before the first stamp is an entry with no time.
export function parseNotes(src: string | undefined): Note[] {
  const out: Note[] = [];
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
export function pretty(t: string) {
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

// A task's request, when it is written in labelled parts, shows above its notes as a section per label.
export const descParts = (c: NoteCard) =>
  c.kind === "idea"
    ? brief(c.text ?? "")
        .parts.map((p) => `### ${p.label}\n${p.body}`)
        .join("\n\n")
    : "";

// The body of POST /note: a run is named by its id, a task by its text.
export const noteBody = (c: NoteCard, text: string, files: { name: string; data: string }[]) =>
  c.kind === "run" ? { dir: c.state, id: c.id, text, files } : { dir: c.state, for: c.text, text, files };
