import { useEffect } from "react";
import type { Annotator } from "@lib/annotate";
import { AnnotateBar } from "./annotate-bar.tsx";
import { NotesList } from "./notes-list.tsx";

// The annotator's two floating parts over the Browser tab's frame (inside its `.annrow`, which is `position: relative`):
// the dark toolbar bottom right and the notes list on the right. Always mounted, because it owns the window's listeners
// (keys, the page's messages); it draws only while the page is open through the proxy.
export function AnnotatePanel({ ann }: { ann: Annotator }) {
  const open = ann.use((s) => !!s.px),
    list = ann.use((s) => s.list);
  useEffect(() => ann.listen(), [ann]);
  if (!open) return null;
  return (
    <>
      {list && <NotesList ann={ann} />}
      <AnnotateBar ann={ann} wide={list} />
    </>
  );
}
