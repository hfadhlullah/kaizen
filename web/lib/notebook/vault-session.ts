// The page's life: which project to show, the first load, the note open last, live refresh from the board's events, and
// every way a page can end (leaving for the board, closing, hiding) writing the open note first.
import { onLeave, toast } from "@lib/core";
import { flush, loadVault, openNote, saveOnExit, save } from "./vault-actions.ts";
import { pickProject } from "./text.ts";
import { startNote } from "./vault-rules.ts";
import { getVault, setVault } from "./vault-store.ts";

export async function startVault(o: { onChanged?: () => void } = {}) {
  guards();
  let st: { dir: string | null; projects: { dir: string; label: string }[]; known?: { dir: string; label: string }[] };
  try {
    st = await (await fetch("/state")).json();
  } catch {
    toast("The board is not running");
    return;
  }
  let kept: string | null = null;
  try {
    kept = localStorage.getItem("kz-proj");
  } catch {
    /* no storage */
  }
  // The Notes tab lists every known project, not only the board picker's (a project outside the Projects folder too).
  const p = pickProject(new URLSearchParams(location.search).get("dir"), kept, st.dir, st.known ?? st.projects);
  setVault({ dir: p.dir, projects: p.projects });
  await loadVault();
  let lastNote: string | null = null;
  try {
    lastNote = sessionStorage.getItem("kz-note:" + p.dir);
  } catch {
    /* no storage */
  }
  // ?note= is the board's "Linked from notes"; otherwise the note open last in this tab.
  const again = startNote(
    getVault().notes.map((n) => n.name),
    new URLSearchParams(location.search).get("note"),
    lastNote,
  );
  if (again) await openNote(again);
  // Every write under a state dir arrives as `changed`, this page's own saves included.
  const listen = () => {
    const es = new EventSource("/events");
    es.onmessage = (ev) => {
      if (ev.data !== "changed") return;
      void loadVault();
      o.onChanged?.();
    };
    es.onerror = () => {
      es.close();
      setTimeout(listen, 3000);
    };
  };
  listen();
}

let guarded = false;
function guards() {
  if (guarded) return;
  guarded = true;
  // Closing with text not on disk: the browser asks first.
  addEventListener("beforeunload", (e) => {
    if (save.dirty) e.preventDefault();
  });
  // Hidden (a tab switch, a phone's app switch, a window minimised): write now, the page may never come back.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
  });
  // Leaving for the board through Search (Ctrl+K): the note is written first.
  onLeave(flush);
  // Leaving with unsaved text: a keepalive request outlives the page.
  addEventListener("pagehide", saveOnExit);
}
