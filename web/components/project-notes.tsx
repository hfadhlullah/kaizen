import { run, useRunView } from "../lib/run/index.ts";
import { Icon } from "../ui/icon.tsx";

const leaf = (n: string) => n.slice(n.lastIndexOf("/") + 1);
// The strip's Project notes: the project's notes as a tree, first-level folders as headings; a note opens as a centre tab.
export function ProjectNotes() {
  const notes = useRunView((s) => s.notes);
  if (!notes) return null;
  if (notes.failed) return <>The notes could not load.</>;
  const names = notes.names ?? [],
    groups = new Map<string, string[]>();
  for (const n of names) {
    const i = n.lastIndexOf("/"),
      g = i < 0 ? "" : n.slice(0, i);
    groups.set(g, [...(groups.get(g) ?? []), n]);
  }
  return (
    <>
      <h3 className="mb-2 text-xs uppercase tracking-[.06em] text-muted-foreground">Project notes</h3>
      {notes.loading ? null : names.length ? (
        [...groups].map(([g, ns]) => (
          <div key={g}>
            {g && (
              <div className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground">
                <Icon name="side" className="size-(--ico)" />
                {g}
              </div>
            )}
            <div className={g ? "ml-3" : undefined}>
              {ns.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => run.act.openNote(n)}
                  className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left hover:bg-muted"
                >
                  <Icon name="note" className="size-(--ico) shrink-0" />
                  {leaf(n)}
                </button>
              ))}
            </div>
          </div>
        ))
      ) : (
        <p className="text-muted-foreground">No notes in this project yet.</p>
      )}
    </>
  );
}
