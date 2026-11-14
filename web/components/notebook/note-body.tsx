import { useLayoutEffect, useMemo, useRef } from "react";
import {
  backlinks,
  folderOf,
  keepMine,
  last,
  newNote,
  openNote,
  removeNote,
  renameNote,
  setFull,
  setVault,
  setWide,
  takeTheirs,
  useVault,
} from "@lib/notebook";
import { Icon } from "@web/ui";
import { EditorPane } from "./editor-pane.tsx";

// The note's name; typing a `/` puts it in a folder. Renames when it loses focus or on Enter; Escape puts the old name back.
function Title() {
  const open = useVault((s) => s.open)!,
    rev = useVault((s) => s.titleRev),
    focus = useVault((s) => s.focus);
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const t = ref.current!;
    if (focus === "title") {
      setVault({ focus: null });
      t.value = open;
      t.focus();
      t.select();
    } else if (document.activeElement !== t) t.value = open;
  }, [open, rev, focus]);
  return (
    <input
      id="title"
      ref={ref}
      defaultValue={open}
      aria-label="Note name; a / puts it in a folder"
      spellCheck={false}
      autoComplete="off"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.currentTarget.value = open;
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => void renameNote(e.currentTarget.value)}
    />
  );
}

// Under the name: where the note is and whether it is saved, with the width, full screen and delete buttons; or, when the
// file changed somewhere else since it was opened, the choice between the two versions.
function Meta() {
  const open = useVault((s) => s.open)!,
    save = useVault((s) => s.save),
    conflict = useVault((s) => s.conflict),
    full = useVault((s) => s.full),
    wide = useVault((s) => s.wide);
  if (conflict)
    return (
      <div id="meta">
        <span className="warnw">This note changed somewhere else since you opened it.</span>
        <span className="acts">
          <button className="btn ghost" id="theirs" onClick={takeTheirs}>
            Load theirs
          </button>
          <button className="btn pri" id="mine" onClick={keepMine}>
            Keep mine
          </button>
        </span>
      </div>
    );
  const where = folderOf(open);
  const wideLabel = wide ? "Boxed width" : "Full width",
    fullLabel = full ? "Exit full screen (Esc)" : "Full screen";
  return (
    <div id="meta">
      <span>{where || "Notes"}</span>
      <span>·</span>
      <span id="saved">{save === "saving" ? "Saving…" : save === "unsaved" ? "Not saved yet" : "Saved"}</span>
      <span className="sp"></span>
      <button
        className="ib"
        id="wide"
        title={wideLabel}
        aria-label={wideLabel}
        aria-pressed={wide}
        onClick={() => setWide(!wide)}
      >
        <Icon name={wide ? "box" : "wide"} className="size-4" />
      </button>
      <button
        className="ib"
        id="full"
        title={fullLabel}
        aria-label={full ? "Exit full screen" : "Full screen"}
        onClick={() => setFull(!full)}
      >
        <Icon name={full ? "min" : "max"} className="size-4" />
      </button>
      <button className="ib" id="trash" title="Delete note" aria-label="Delete note" onClick={() => void removeNote()}>
        <Icon name="trash" className="size-4" />
      </button>
    </div>
  );
}

// Notes that link to this one.
function Links() {
  const open = useVault((s) => s.open)!,
    notes = useVault((s) => s.notes);
  const from = useMemo(() => backlinks(notes, open), [notes, open]);
  return (
    <section className="links" id="links" hidden={!from.length}>
      <h3>Linked from</h3>
      <ul>
        {from.map((n) => (
          <li key={n.name}>
            <button className="nt" data-open={n.name} onClick={() => void openNote(n.name)}>
              <span className="nm">{last(n.name)}</span>
              {folderOf(n.name) && <span className="fd">{folderOf(n.name)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The paper: the open note, or what to do when none is.
export function NoteBody() {
  const ready = useVault((s) => s.ready),
    open = useVault((s) => s.open),
    doc = useVault((s) => s.doc),
    count = useVault((s) => s.notes.length);
  if (!ready) return null;
  if (open)
    return (
      <article id="pane">
        <Title />
        <Meta />
        <EditorPane key={doc} />
        <Links />
      </article>
    );
  if (count)
    return (
      <div className="blank" id="pick">
        <p>Pick a note on the left, or start a new one.</p>
      </div>
    );
  return (
    <div className="blank" id="empty">
      <div className="mascot"></div>
      <b>Nothing here yet</b>
      <p>
        Notes are markdown files in this project's <code>.kaizen/notes</code> folder. Link them with{" "}
        <code>[[Note name]]</code>, tag them with <code>#tag</code>.
      </p>
      <button className="btn pri" id="new2" onClick={() => void newNote()}>
        New note
      </button>
    </div>
  );
}
