import { useLayoutEffect, useRef } from "react";
import { createEditor, getVault, setEditor, setVault, vaultHost } from "@lib/notebook";

// The editor engine (lib/notebook/engine.ts) as one component. It makes the CodeMirror view once, when it mounts, and
// destroys it when it unmounts: the page keys it by the note opening, so a redraw, a rename or a refresh from disk never
// remakes it and its cursor, scroll and undo history stay. Made in a layout effect so the first paint already has it.
export function EditorPane() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const v = getVault(),
      h = createEditor(ref.current!, v.notes.find((n) => n.name === v.open)?.text ?? "", vaultHost);
    setEditor(h);
    if (v.focus === "editor") {
      h.focus();
      setVault({ focus: null });
    }
    return () => {
      setEditor(null);
      h.destroy();
    };
  }, []);
  return <div id="editor" ref={ref}></div>;
}
