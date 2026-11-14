import { useState } from "react";
import { Checkbox, Input, Popover, PopoverContent, PopoverTrigger } from "@web/ui";
import { ProjectMark } from "@components/shared";
import { filterOn, foldProjects, matchProjects, projName, setRailFilter, setRailQuery, useRail } from "@lib/rail";

const Row = ({
  on,
  label,
  children,
  onChange,
}: {
  on: boolean;
  label: string;
  children: React.ReactNode;
  onChange: (on: boolean) => void;
}) => (
  <label className="flex min-w-0 cursor-pointer items-center gap-2 rounded-xs px-2 py-1.5 whitespace-nowrap hover:bg-muted">
    <Checkbox checked={on} onCheckedChange={(v) => onChange(v === true)} aria-label={label} />
    {children}
  </label>
);

// The Projects filter of the side menu: every project listed (search when there are many), All projects, collapse or
// expand them all, and the kinds of card. Each tick applies at once.
export function RailFilter() {
  const [open, setOpen] = useState(false);
  const data = useRail((s) => s.data),
    filt = useRail((s) => s.filt),
    folded = useRail((s) => s.folded),
    q = useRail((s) => s.q);
  const dirs = data.projects.filter((p) => p.workspaces?.length).map((p) => p.dir as string);
  const shown = matchProjects(dirs, (d) => projName(d, data.projects), q);
  const on = filterOn(filt, dirs);
  const allShut = dirs.length > 0 && dirs.every((d) => folded.includes(d));
  const toggle = (d: string) => (v: boolean) =>
    setRailFilter({ dirs: v ? [...new Set([...filt.dirs, d])] : filt.dirs.filter((x) => x !== d) });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id="pfilter"
          aria-pressed={on}
          aria-label="Show one project"
          title={on ? "Filter on: choose projects and kinds" : "Filter projects and kinds"}
        >
          <svg>
            <use href="#r-filter" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex max-h-[60vh] w-[220px] flex-col gap-px p-1.5 text-sm"
        aria-label="Filter the Projects list"
      >
        <Input
          placeholder="Search projects…"
          aria-label="Search projects"
          autoComplete="off"
          spellCheck={false}
          value={q}
          onChange={(e) => setRailQuery(e.target.value)}
          className="mb-1.5"
        />
        <div className="flex items-center gap-0.5">
          <div className="min-w-0 flex-1">
            <Row on={!filt.dirs.length} label="All projects" onChange={() => setRailFilter({ dirs: [] })}>
              All projects
            </Row>
          </div>
          <button
            type="button"
            className="grid size-6 place-items-center rounded-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            title={allShut ? "Expand all" : "Collapse all"}
            aria-label={allShut ? "Expand all projects" : "Collapse all projects"}
            onClick={() => foldProjects(dirs, !allShut)}
          >
            <svg
              viewBox="0 0 16 16"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={allShut ? "M4 3l4 3 4-3M4 13l4-3 4 3" : "M4 6l4-3 4 3M4 10l4 3 4-3"} />
            </svg>
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-px overflow-auto">
          {shown.map((d) => (
            <Row key={d} on={filt.dirs.includes(d)} label={projName(d, data.projects)} onChange={toggle(d)}>
              <ProjectMark
                dir={d}
                label={projName(d, data.projects)}
                logo={data.projects.some((p) => p.dir === d && p.logo)}
              />
              <span className="min-w-0 truncate">{projName(d, data.projects)}</span>
            </Row>
          ))}
        </div>
        <div className="mt-1 flex flex-none flex-col gap-px border-t border-border pt-0.5">
          <div className="mx-2 mt-2 mb-0.5 text-xs font-semibold text-muted-foreground">Show</div>
          <Row on={filt.running} label="Running" onChange={(v) => setRailFilter({ running: v })}>
            Running
          </Row>
          <Row on={filt.done} label="Done" onChange={(v) => setRailFilter({ done: v })}>
            Done
          </Row>
        </div>
      </PopoverContent>
    </Popover>
  );
}
