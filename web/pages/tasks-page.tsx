import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import { EmptyState, IconButton, Pager } from "../components/shared/index.ts";
import { FilterMenu, TaskRow } from "../components/task/index.ts";
import {
  useDock,
  openTaskRecord,
  refreshTasks,
  useTasks,
  filteredTasks,
  TASK_FILTERS,
} from "../lib/task/index.ts";
import { usePager } from "../lib/shared/index.ts";
import { host, setStore, useStore } from "../lib/core/index.ts";
import { Button } from "../ui/button.tsx";

// The attention-first list of durable tasks. The board's own search box, tools slot and New task button are
// docked into it while it shows (lib/task/use-dock.ts), so the page has no header of its own.
export function TasksPage() {
  return useStore((s) => s.view === "tasks") ? <Tasks /> : null;
}
function Tasks() {
  const { tasks, loaded, error, scope } = useTasks();
  const { filter, query } = useStore(useShallow((s) => ({ filter: s.filter, query: s.query })));
  const [sel, setSel] = useState(0);
  const q = useRef<HTMLLabelElement>(null),
    tools = useRef<HTMLSpanElement>(null),
    add = useRef<HTMLSpanElement>(null);
  useDock([q, tools, add], ["bq", "hx", "newtop"]);
  // The board's tools slot (#hx) keeps what lives in it (the Workspaces | Runs switch host): a span of ours is
  // added beside it and holds this page's tools.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const scoped = tasks.filter((t) => !scope || t.dir === scope),
    matched = filteredTasks(scoped, filter, query),
    pg = usePager("tasks", matched),
    rows = pg.rows;
  const pick = Math.max(0, Math.min(sel, rows.length - 1));
  const reset = () => {
    setSel(0);
    pg.setAt(0);
  };
  // The board's search box: read it, listen to it, and give it the placeholder of this page.
  useEffect(() => {
    const bq = document.getElementById("bq") as HTMLInputElement;
    bq.placeholder = "Search tasks (press /)";
    setStore({ query: bq.value });
    const input = () => {
      setStore({ query: bq.value });
      reset();
    };
    bq.addEventListener("input", input);
    const own = document.createElement("span");
    own.className = "flex items-center gap-2";
    document.getElementById("hx")?.append(own);
    setSlot(own);
    return () => {
      own.remove();
      bq.removeEventListener("input", input);
      bq.placeholder = "Filter cards (press /)";
    };
  }, []);
  const latest = useRef({ rows, pick });
  latest.current = { rows, pick };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const { rows, pick } = latest.current,
        t = e.target as HTMLElement;
      if (!rows.length || e.defaultPrevented) return;
      if (
        t.id !== "bq" &&
        t.closest("input,textarea,select,[contenteditable],details,dialog,[role=dialog],[role=menu],[role=listbox]")
      )
        return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max(0, Math.min(rows.length - 1, pick + (e.key === "ArrowDown" ? 1 : -1)));
        setSel(next);
        document.querySelector(`[data-task-row="${next}"]`)?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && t.id === "bq" && !e.isComposing) {
        e.preventDefault();
        void openTaskRecord(rows[pick]);
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  const count = (id: string) =>
    id === "all" ? scoped.length : scoped.filter((t) => t.attention.category === id).length;
  const clear = () => {
    setStore({ filter: "all" });
    const bq = document.getElementById("bq") as HTMLInputElement;
    bq.value = "";
    setStore({ query: "" });
    reset();
    bq.focus();
  };
  const empty = error ? (
    <EmptyState title={error}>
      <Button onClick={() => void refreshTasks()}>Try again</Button>
    </EmptyState>
  ) : !loaded ? (
    <EmptyState busy title="Loading tasks…" />
  ) : scoped.length ? (
    <EmptyState icon="plus" title="No tasks match" help="Try another search or show all tasks.">
      <Button onClick={clear}>Clear search and filters</Button>
    </EmptyState>
  ) : (
    <EmptyState
      icon="plus"
      title="What would you like to make?"
      help="Describe a goal. Keep the decisions, results and later changes together."
    >
      <Button variant="primary" onClick={() => host.newTask()}>
        New task
      </Button>
    </EmptyState>
  );
  return (
    <>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        {/* tk-q is the old board's hook for the docked search box (its padding and icon slot); it goes with the search box in phase 5. */}
        <label ref={q} className="tk-q kz-keep" />
        <span className="flex items-center gap-2">
          <span ref={tools} />
          <span ref={add} className="kz-keep flex" />
        </span>
      </div>
      {slot &&
        createPortal(
          <>
            <IconButton icon="refresh" label="Refresh tasks" onClick={() => void refreshTasks()} />
            <FilterMenu
              label="Task filters"
              options={TASK_FILTERS.map(([id, label]) => ({ id, label, count: count(id) }))}
              value={filter}
              onChange={(id) => {
                setStore({ filter: id });
                reset();
              }}
            />
          </>,
          slot,
        )}
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-[color:color-mix(in_srgb,var(--line)_50%,transparent)]">
        {rows.length ? (
          <div aria-label="Tasks" className="flex flex-col">
            {rows.map((t, i) => (
              <TaskRow
                key={t.dir + t.id}
                task={t}
                kb={pick === i}
                data-task-row={i}
                onClick={() => void openTaskRecord(t)}
              />
            ))}
          </div>
        ) : (
          empty
        )}
        <Pager at={pg.at} size={pg.size} total={pg.total} onAt={pg.setAt} onSize={pg.setSize} />
      </div>
    </>
  );
}
