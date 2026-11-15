import { Picker } from "@components/shared";
import { newNote, setDrawer, setProject, useVault } from "@lib/notebook";
import { Icon } from "@web/ui";

// The page's header: the narrow layout's list button, the project, and New note. The project is the board's Picker (folder
// name shown, the full path searchable), inside a kz-ui box because the page's own CSS is not Tailwind's reset.
export function NotesHead() {
  const projects = useVault((s) => s.projects),
    dir = useVault((s) => s.dir),
    drawer = useVault((s) => s.drawer);
  const options = projects.map((p) => ({
    value: p.dir,
    label: p.label.split(/[\\/]/).filter(Boolean).pop() || p.label,
    search: p.label,
  }));
  return (
    <div className="hdr">
      <h1>Notes</h1>
      <button className="ib" id="side" title="Notes list" aria-label="Notes list" onClick={() => setDrawer(!drawer)}>
        <Icon name="list" />
      </button>
      <div id="proj" className="kz-ui">
        <Picker
          options={options}
          value={dir}
          onChange={(d) => void setProject(d)}
          label="Project"
          className="border-transparent bg-transparent hover:border-border"
        />
      </div>
      <span className="sp"></span>
      <button className="btn pri" id="new" onClick={() => void newNote()}>
        New note
      </button>
    </div>
  );
}
