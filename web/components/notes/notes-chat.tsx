import { descParts, parseNotes, pretty, useNotes, type NoteCard } from "@lib/notes";
import { attach } from "@lib/markdown";
import { Markdown } from "@components/markdown";
import { NoteComposer } from "./note-composer.tsx";

// The Notes tab of a card's panel: a request written in labelled parts (a task), the notes as messages, and the box that adds
// one. A run that is done, abandoned or archived is read-only: no box.
function Messages({ card, src }: { card: NoteCard; src: string | undefined }) {
  const notes = parseNotes(src);
  return (
    <div className="mb-3.5 flex flex-col gap-2.5">
      {notes.map((n, i) => (
        <div
          key={i}
          className="rounded-md border border-border bg-background px-3 py-2.5 [&_img]:my-1 [&_img]:block [&_img]:max-h-[260px] [&_img]:rounded-xs [&_p:last-child]:mb-0"
        >
          {n.at && <time className="mb-1 block text-xs text-muted-foreground">{n.at}</time>}
          <Markdown text={attach(pretty(n.text), card)} className="[&_a]:underline" />
        </div>
      ))}
      {!notes.length && <p className="text-muted-foreground">No notes yet.</p>}
    </div>
  );
}
export function NotesChat() {
  const view = useNotes((s) => s.view);
  if (!view) return null;
  const { card, src, ro, linked } = view,
    desc = descParts(card);
  return (
    <>
      {!!linked?.length && (
        <section className="mb-3.5">
          <h3 className="mb-2 text-xs tracking-[0.08em] text-muted-foreground uppercase">Linked from notes</h3>
          <ul className="pl-[1.4em] list-disc">
            {linked.map((n) => (
              <li key={n} className="my-[3px]">
                <a
                  className="text-primary underline-offset-[3px] hover:underline"
                  href={`/notebook?dir=${encodeURIComponent(card.state)}&note=${encodeURIComponent(n)}`}
                >
                  {n}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {desc && (
        <section className="mb-3.5 border-b border-border pb-1.5">
          <Markdown text={attach(desc, card)} className="[&_a]:underline" />
        </section>
      )}
      <Messages card={card} src={src} />
      {!ro && <NoteComposer />}
    </>
  );
}
