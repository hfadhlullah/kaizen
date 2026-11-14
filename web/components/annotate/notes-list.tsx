import { useEffect, useRef } from "react";
import { group, type Annotator, type Note } from "@lib/annotate";
import { cn } from "@lib/core";
import { Textarea } from "@web/ui";
import { AnnotateSettings } from "./annotate-settings.tsx";

// One note: its number (green for a group), the comment (edit it in place, saved when you leave the box), the selector,
// intent and severity, the picture of what was picked, and delete. Scrolls into view and flashes when its marker is
// clicked on the page.
function NoteRow({ ann, note, flash }: { ann: Annotator; note: Note; flash: boolean }) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (flash) row.current?.scrollIntoView({ block: "nearest" });
  }, [flash]);
  return (
    <div
      ref={row}
      className={cn("flex items-start gap-2 rounded-sm border border-border p-2", flash && "outline-2 outline-primary")}
    >
      <b
        className={cn(
          "grid size-[22px] shrink-0 place-items-center rounded-full bg-primary text-[12px] font-normal text-primary-foreground",
          group(note.kind) && "bg-[#34c759] text-white",
        )}
      >
        {note.n}
      </b>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Textarea
          key={note.comment}
          defaultValue={note.comment}
          spellCheck={false}
          rows={1}
          aria-label={`Note ${note.n}`}
          className="m-0 field-sizing-content min-h-[1lh] font-[inherit] rounded-[3px] border-0 p-0 text-[12px] break-words whitespace-pre-wrap focus:bg-muted"
          onBlur={(e) => ann.editNote(note.n, e.currentTarget.value)}
        />
        <code className="block truncate text-[11px] text-muted-foreground">{note.selector}</code>
        <small className="text-[10px] text-muted-foreground">
          {note.intent} · {note.severity}
          {note.crop ? "" : " · no crop"}
        </small>
        {note.crop && <img alt="crop" src={note.crop} className="max-w-full rounded-xs border border-border" />}
      </div>
      <button
        type="button"
        title="Delete"
        aria-label="Delete"
        onClick={() => ann.removeNote(note.n)}
        className="m-0 cursor-pointer border-0 bg-transparent p-0 text-[16px] leading-none text-muted-foreground"
      >
        ×
      </button>
    </div>
  );
}

export function NotesList({ ann }: { ann: Annotator }) {
  const notes = ann.use((s) => s.notes),
    flash = ann.use((s) => s.flash),
    settings = ann.use((s) => s.setOpen);
  return (
    <div className="absolute inset-y-0 right-0 z-[5] flex w-[300px] max-w-[85%] flex-col gap-2 overflow-auto border-l border-border bg-background p-2.5 text-[12px] shadow-[-8px_0_24px_#0003] max-sm:w-[240px]">
      {settings && <AnnotateSettings ann={ann} />}
      {!notes.length && (
        <p className="m-2 text-muted-foreground">
          No notes yet. Pick something on the page and write what should change.
        </p>
      )}
      {notes.map((n) => (
        <NoteRow key={n.id} ann={ann} note={n} flash={flash === n.n} />
      ))}
    </div>
  );
}
