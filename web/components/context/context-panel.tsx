import { useEffect, useRef, useState } from "react";
import { host, cn } from "@lib/core";
import {
  contextActions,
  contextTitle,
  entryLabel,
  entryPath,
  goUp,
  noteHref,
  noteIndent,
  sessionLabel,
  setOpen,
  showFile,
  showFiles,
  showTab,
  textUrl,
  useContext,
  type Tab,
} from "@lib/context";

const TABS: [Tab, string][] = [
  ["files", "Files"],
  ["notes", "Notes"],
  ["terminal", "Terminal"],
];
const WIDE = "(min-width:1201px)";
const useWide = () => {
  const [wide, set] = useState(() => matchMedia(WIDE).matches);
  useEffect(() => {
    const q = matchMedia(WIDE),
      on = () => set(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return wide;
};

// The header's button: opens and closes the pane (the page's CSS hides it off the Board and on a phone).
export function ContextOpen() {
  const open = useContext((s) => s.open);
  return (
    <button type="button" className="ib" id="ctx-open" aria-label="Open side panel" aria-expanded={open} title="Notes, files and terminals" onClick={() => setOpen(!open)}>
      <svg>
        <use href="#i-side" />
      </svg>
    </button>
  );
}

// The Project context pane: the project's files, notes and terminal sessions beside the board. On a wide window it sits
// beside the page; on a narrow one it is a dialog over it, which makes the rest of the page inert, keeps Tab inside and
// closes on Escape. It keeps the board's own markup and CSS (kz-keep: the legacy `#context` rules), as the strip it replaced.
export function ContextPanel() {
  const { open, tab, dir, body, sessions } = useContext(),
    wide = useWide(),
    box = useRef<HTMLElement>(null),
    modal = open && !wide;
  const close = () => {
    setOpen(false);
    // Once the page behind is no longer inert.
    requestAnimationFrame(() => document.getElementById("ctx-open")?.focus());
  };
  // The pane opens from the header's button only (nothing is read while it is closed); a view change closes the dialog.
  useEffect(() => {
    const on = () => !matchMedia(WIDE).matches && setOpen(false);
    addEventListener("kz-view", on);
    return () => removeEventListener("kz-view", on);
  }, []);
  // As a dialog the focus goes in, to the tab in use.
  useEffect(() => {
    if (modal) requestAnimationFrame(() => box.current?.querySelector<HTMLElement>("nav button.on")?.focus());
  }, [modal]);
  // As a dialog: nothing behind it takes focus or clicks.
  useEffect(() => {
    if (!modal) return;
    const others = [
      document.querySelector<HTMLElement>(".rail"),
      ...(document.querySelector(".app")?.children ?? []),
    ].filter((e): e is HTMLElement => !!e && !e.contains(box.current));
    others.forEach((e) => (e.inert = true));
    const key = (e: KeyboardEvent) => {
      const el = box.current;
      if (!el) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === "Tab") {
        const items = [...el.querySelectorAll<HTMLElement>("button,a[href]")].filter(
          (i) => !i.hasAttribute("disabled") && i.getClientRects().length,
        );
        const first = items[0],
          last = items.at(-1);
        if (!first || !last) return;
        if (
          !el.contains(document.activeElement) ||
          (e.shiftKey && document.activeElement === first) ||
          (!e.shiftKey && document.activeElement === last)
        ) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
      }
    };
    addEventListener("keydown", key, true);
    return () => {
      others.forEach((e) => (e.inert = false));
      removeEventListener("keydown", key, true);
    };
  }, [modal]);
  return (
    <>
      <section
        id="context"
        ref={box}
        aria-label="Project context"
        aria-modal={modal || undefined}
        role={wide ? "complementary" : "dialog"}
        className={cn("kz-keep", open && "on")}
      >
        <header>
          <strong id="context-title">{contextTitle(dir)}</strong>
          <button
            type="button"
            className="ib"
            id="ctx-close"
            aria-label="Close side panel"
            title="Close"
            onClick={close}
          >
            <svg>
              <use href="#i-close" />
            </svg>
          </button>
        </header>
        <nav aria-label="Side content">
          {TABS.map(([t, label]) => (
            <button
              key={t}
              type="button"
              className={tab === t ? "on" : ""}
              aria-pressed={tab === t}
              onClick={() => showTab(t)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div id="context-body">
          {body.kind === "message" && body.text}
          {body.kind === "notes" &&
            body.notes.map((n) => (
              <a
                key={n.name}
                className="tree-row"
                style={{ paddingLeft: noteIndent(n.name) }}
                href={noteHref(body.dir, n.name)}
              >
                {n.name}
              </a>
            ))}
          {body.kind === "files" && (
            <>
              {body.folder && (
                <button type="button" className="tree-row tree-back" onClick={goUp}>
                  {"← " + body.folder}
                </button>
              )}
              {!body.entries.length && "This folder is empty."}
              {body.entries.map((e) => (
                <button
                  key={e.name}
                  type="button"
                  className={cn("tree-row", e.dir && "folder")}
                  onClick={() => (e.dir ? showFiles(entryPath(body.folder, e)) : showFile(entryPath(body.folder, e)))}
                >
                  {entryLabel(e)}
                </button>
              ))}
            </>
          )}
          {body.kind === "file" && (
            <>
              <div className="ctx-actions">
                <button type="button" className="btn" onClick={() => showFiles()}>
                  ← Files
                </button>
                <a className="btn" href={textUrl(dir, body.path, true)}>
                  Download
                </a>
              </div>
              <strong>{body.path}</strong>
              <pre>{body.content}</pre>
            </>
          )}
          {body.kind === "terminals" && (
            <>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (!matchMedia(WIDE).matches) setOpen(false);
                  showTab("files");
                  host.go("terminal", true);
                }}
              >
                Open terminal workspace
              </button>
              {!sessions.length && <p>No terminal sessions yet.</p>}
              {sessions.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  className="tree-row"
                  onClick={() => {
                    if (!matchMedia(WIDE).matches) setOpen(false);
                    contextActions.openSession(c);
                  }}
                >
                  {sessionLabel(c)}
                </button>
              ))}
            </>
          )}
        </div>
      </section>
    </>
  );
}
