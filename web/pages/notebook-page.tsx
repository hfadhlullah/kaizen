import { useEffect, useLayoutEffect } from "react";
import { NoteBody, NotesHead, NotesSide } from "@components/notebook";
import { setDrawer, setFull, turn, useVault } from "@lib/notebook";

// The Notes page: header, sidebar and the paper. The page's CSS keys off classes on <body> (the narrow drawer, full screen,
// the wide column), so this mirrors the store's switches there; and it deals the new page in once the note is drawn.
export function NotebookPage() {
  const open = useVault((s) => s.open),
    doc = useVault((s) => s.doc),
    full = useVault((s) => s.full),
    wide = useVault((s) => s.wide),
    drawer = useVault((s) => s.drawer);
  useEffect(() => {
    const c = document.body.classList;
    c.toggle("full", !!open && full);
    c.toggle("wide", wide);
    c.toggle("side-open", drawer);
  }, [open, full, wide, drawer]);
  useLayoutEffect(turn, [doc]);
  useEffect(() => {
    // The narrow layout's drawer closes on any click outside it; Esc closes it and leaves full screen (a field keeps its own Esc).
    const click = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.(".side,#side")) setDrawer(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target as HTMLElement).matches?.("input")) return;
      setDrawer(false);
      setFull(false);
    };
    document.addEventListener("click", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", key);
    };
  }, []);
  return (
    <div className="app">
      <NotesHead />
      <div className="wrap">
        <NotesSide />
        <main className="main">
          <div className="page">
            <NoteBody />
          </div>
        </main>
      </div>
    </div>
  );
}
