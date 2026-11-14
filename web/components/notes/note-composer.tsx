import { useEffect, useLayoutEffect, useRef } from "react";
import { addNoteFiles, noteKey, sendNote, takeRefocus, useNotes } from "@lib/notes";
import { host } from "@lib/core";
import { pastedFiles } from "@lib/shared";
import { AttachButton, MicButton } from "@components/shared";
import { Button } from "@web/ui";

const DK = "kz-d:";
const saved = (k: string) => {
  try {
    return sessionStorage.getItem(DK + k) ?? "";
  } catch {
    return "";
  }
};
const NONE: File[] = [];

// The box that adds a note. It formats as you type: the textarea stays the value (drafts, dictation and send read it) and
// the board's note editor (`host.rich`, a contenteditable that turns itself back into markdown) sits over it. The text is a
// draft per card (sessionStorage, the board's "kz-d:n:" keys). The files picked are kept per card in the store. The slot
// is `kz-keep`: the editor's own markdown (lists, code, headings) is styled by the board's rules, not by the reset.
function Box({ k }: { k: string }) {
  const view = useNotes((s) => s.view),
    files = useNotes((s) => s.files[k]) ?? NONE,
    ta = useRef<HTMLTextAreaElement>(null),
    ed = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    // A draft restored from the session: the caret goes after it, where dictation and typing continue.
    ta.current!.selectionStart = ta.current!.selectionEnd = ta.current!.value.length;
    ed.current = host.rich(ta.current!);
    return () => {
      ed.current?.remove();
      ed.current = null;
      if (ta.current) ta.current.hidden = false;
    };
  }, []);
  // Every draw of this card's notes: the box takes focus back after a send.
  useEffect(() => {
    if (takeRefocus(k)) ed.current?.focus();
  }, [view]);
  const send = async () => {
    const t = ta.current!;
    if (!(await sendNote(view!.card, t.value, files))) return;
    // The editor shows what the textarea holds: an input event empties it (and the draft).
    t.value = "";
    t.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return (
    <div className="notes flex flex-col gap-2">
      <div
        className="kz-keep"
        onPaste={(e) => {
          const fs = pastedFiles(e);
          if (fs.length) addNoteFiles(k, fs);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
          }
        }}
      >
        <textarea
          ref={ta}
          defaultValue={saved("n:" + k)}
          placeholder="Add a note. Paste a screenshot, or attach files."
          onInput={(e) => {
            try {
              sessionStorage.setItem(DK + "n:" + k, e.currentTarget.value);
            } catch {}
          }}
        />
      </div>
      {!!files.length && <div className="text-xs text-muted-foreground">{files.map((f) => f.name).join(" · ")}</div>}
      <div className="flex items-center gap-1.5">
        <MicButton field={ta} />
        <AttachButton onFiles={(fs) => addNoteFiles(k, fs)} />
        <span className="flex-1 text-xs text-muted-foreground">Enter sends, Shift+Enter newline</span>
        <Button variant="primary" onClick={() => void send()}>
          Send
        </Button>
      </div>
    </div>
  );
}
// One box per card: another card's notes open a fresh box with that card's draft.
export function NoteComposer() {
  const card = useNotes((s) => s.view?.card);
  return card ? <Box key={noteKey(card)} k={noteKey(card)} /> : null;
}
