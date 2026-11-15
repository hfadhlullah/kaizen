import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useRoute } from "@lib/router";
import { EmptyState, IconButton, Pager } from "@components/shared";
import { FilterBox } from "@components/board";
import { FilterMenu, TaskRow } from "@components/task";
import { focusFilter, newTask, setQuery, useBoard } from "@lib/board";
import { openTaskRecord, refreshTasks, useTasks, filteredTasks, TASK_FILTERS } from "@lib/task";
import { usePager } from "@lib/shared";
import { cn, host, setStore, useStore } from "@lib/core";
import { Button, Icon } from "@web/ui";

// The attention-first list of durable tasks: its own search box (the text is the Board's, shared with the header's), tools and
// New task button, so the page has no header of its own.
export function TasksPage() {
  return useRoute((r) => r.page === "tasks") ? <Tasks /> : null;
}
function Tasks() {
  const { tasks, loaded, error, scope } = useTasks();
  const { filter, query } = useStore(useShallow((s) => ({ filter: s.filter, query: s.query })));
  const [sel, setSel] = useState(0),
    [spin, setSpin] = useState(false);
  // The refresh button spins until the list is read, and for at least 0.7 s so a quick answer still shows it.
  const refreshNow = async () => {
    const t = Date.now();
    setSpin(true);
    await refreshTasks();
    await new Promise((done) => setTimeout(done, Math.max(0, 700 - (Date.now() - t))));
    setSpin(false);
  };
  const scoped = tasks.filter((t) => !scope || t.dir === scope),
    matched = filteredTasks(scoped, filter, query),
    pg = usePager("tasks", matched),
    rows = pg.rows;
  const pick = Math.max(0, Math.min(sel, rows.length - 1));
  const reset = () => {
    setSel(0);
    pg.setAt(0);
  };
  // The search box is the Board's text (shared with the header's): Tasks reads it and starts again at the top when it changes.
  const board = useBoard((b) => b.query);
  useEffect(() => {
    setStore({ query: board });
    reset();
  }, [board]);
  const latest = useRef({ rows, pick });
  latest.current = { rows, pick };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const { rows, pick } = latest.current,
        t = e.target as HTMLElement;
      if (!rows.length || e.defaultPrevented) return;
      if (
        t.id !== "tq" &&
        t.closest("input,textarea,select,[contenteditable],details,dialog,[role=dialog],[role=menu],[role=listbox]")
      )
        return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max(0, Math.min(rows.length - 1, pick + (e.key === "ArrowDown" ? 1 : -1)));
        setSel(next);
        document.querySelector(`[data-task-row="${next}"]`)?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && t.id === "tq" && !e.isComposing) {
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
    setQuery("");
    reset();
    focusFilter();
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
        <label className="tk-q kz-keep">
          <Icon name="search" className="size-3.5" />
          <FilterBox id="tq" placeholder="Search tasks (press /)" />
        </label>
        <span className="flex items-center gap-2">
          <IconButton
            icon={<Icon name="refresh" className={cn(spin && "motion-safe:animate-spin")} />}
            label="Refresh tasks"
            aria-busy={spin}
            disabled={spin}
            onClick={() => void refreshNow()}
          />
          <FilterMenu
            label="Task filters"
            options={TASK_FILTERS.map(([id, label]) => ({ id, label, count: count(id) }))}
            value={filter}
            onChange={(id) => {
              setStore({ filter: id });
              reset();
            }}
          />
          <span className="kz-keep flex">
            <button className="btn pri" onClick={() => newTask()}>
              New task
            </button>
          </span>
        </span>
      </div>
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
