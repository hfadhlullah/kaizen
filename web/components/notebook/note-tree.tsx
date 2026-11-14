import { useMemo } from "react";
import {
  age,
  folderOf,
  last,
  openNote,
  parseQuery,
  searchNotes,
  toggleFolder,
  tree,
  useVault,
  type Tree,
} from "@lib/notebook";
import { Icon } from "@web/ui";

// Name to modified time, made once per list: every row asks on every change of the store (a keystroke sets the save
// state), and a lookup in the list each time is 29 ms at 5,000 notes.
const times = new WeakMap<object, Map<string, number>>();
const mtimeOf = (notes: { name: string; mtime: number }[], name: string) => {
  let m = times.get(notes);
  if (!m) times.set(notes, (m = new Map(notes.map((n) => [n.name, n.mtime]))));
  return m.get(name);
};

function Row({ name, withFolder }: { name: string; withFolder?: boolean }) {
  const cur = useVault((s) => s.open === name),
    mtime = useVault((s) => mtimeOf(s.notes, name));
  return (
    <li>
      <button
        className={"nt" + (cur ? " cur" : "")}
        data-open={name}
        aria-current={cur ? "true" : undefined}
        onClick={() => void openNote(name)}
      >
        <span className="nm">{last(name)}</span>
        {withFolder && folderOf(name) && <span className="fd">{folderOf(name)}</span>}
        <span className="age">{mtime ? age(mtime) : ""}</span>
      </button>
    </li>
  );
}

function Branch({ tr, path }: { tr: Tree; path: string }) {
  const shut = useVault((s) => s.shut);
  return (
    <ul>
      {[...tr.folders].map(([f, sub]) => {
        const p = path + f;
        return (
          <li key={p}>
            <details data-folder={p} open={!shut[p]} onToggle={(e) => toggleFolder(p, e.currentTarget.open)}>
              <summary>
                <i className="chev">
                  <Icon name="chev" className="size-3" />
                </i>
                <Icon name="folder" className="size-[15px]" />
                <span>{f}</span>
              </summary>
              <Branch tr={sub} path={p + "/"} />
            </details>
          </li>
        );
      })}
      {tr.notes.map((n) => (
        <Row key={n} name={n} />
      ))}
    </ul>
  );
}

// The notes as folders and files, or, with something in the search box, the notes that match (with their folder).
export function NoteTree() {
  const ready = useVault((s) => s.ready),
    notes = useVault((s) => s.notes),
    query = useVault((s) => s.query);
  const q = parseQuery(query);
  const hits = useMemo(() => (q.text ? searchNotes(notes, q) : []), [notes, query]);
  const all = useMemo(() => tree(notes.map((n) => n.name)), [notes]);
  if (!ready)
    return (
      <>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="skel" style={{ height: 14, margin: "8px 0" }}></span>
        ))}
      </>
    );
  if (q.text)
    return hits.length ? (
      <ul>
        {hits.map((n) => (
          <Row key={n.name} name={n.name} withFolder />
        ))}
      </ul>
    ) : (
      <p className="none">No note matches.</p>
    );
  return notes.length ? <Branch tr={all} path="" /> : null;
}
