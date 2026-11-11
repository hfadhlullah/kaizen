// An attention-first list of durable tasks. Legacy entries are adapted by the server
// and acquire their stable identity on open, so identical titles stay separate.
import { store } from "./store.ts";
import { $, html, ico, pageOf, pager, pagerHtml, wirePager } from "./dom.ts";
import { age } from "./labels.ts";
import { setTaskAttention } from "./badge.ts";
import { newTask } from "./cards.ts";
import { openTaskRecord, taskStatus, type TaskView } from "./task-page.ts";

export const TASK_FILTERS = [
  ["all", "All"],
  ["needs-you", "Needs you"],
  ["in-progress", "In progress"],
  ["completed", "Completed"],
] as const;
export function filteredTasks(tasks: TaskView[], filter = "all", query = "", dir = "") {
  const q = query.trim().toLocaleLowerCase();
  const rank = { "needs-you": 0, "in-progress": 1, completed: 2 };
  return tasks
    .filter(
      (t) =>
        (!dir || t.dir === dir) &&
        (filter === "all" || t.attention.category === filter) &&
        (!q ||
          [t.title, t.goal, t.projectName, t.attention.reason, t.attention.action]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase()
            .includes(q)),
    )
    .sort(
      (a, b) =>
        rank[a.attention.category] - rank[b.attention.category] ||
        Number(new Date(b.updatedAt ?? 0)) - Number(new Date(a.updatedAt ?? 0)) ||
        a.id.localeCompare(b.id),
    );
}
let items: TaskView[] = [],
  filter = "all",
  sel = 0,
  shown: TaskView[] = [],
  loading = false,
  again = false;
let sequence = 0,
  loaded = false,
  error = "",
  active = false;
const pg = pager("tasks");
let docked: [Comment, HTMLElement][] = [];
function dock() {
  if (!$("tk-bar"))
    $("tasksv").innerHTML = String(
      html`<div class="tk-bar" id="tk-bar">
          <div class="tk-row"><label class="tk-q" id="tk-q">${ico("search")}</label><span id="tk-tools"></span></div>
        </div>
        <div class="tk-list" id="tk-list"></div>`,
    );
  if (docked.length) return;
  for (const [id, to] of [
    ["bq", "tk-q"],
    ["hx", "tk-tools"],
    ["newtop", "tk-tools"],
  ]) {
    const el = $(id);
    if (!el) continue;
    const mark = new Comment();
    el.before(mark);
    docked.push([mark, el]);
    $(to).append(el);
  }
  $("hx").innerHTML = String(
    html`<button class="ib" id="tasks-refresh" title="Refresh tasks" aria-label="Refresh tasks">
      ${ico("refresh")}
    </button><details class="ice-filt" id="tk-filt"><summary class="ib" id="tk-filt-sum" aria-label="Filter tasks" title="Filter tasks">${ico("filter")}</summary><div class="ice-fpop"><div class="ice-chips" id="tk-chips" role="group" aria-label="Task filters"></div></div></details>`,
  );
  $("tasks-refresh").onclick = () => void refreshTasks();
}
function undock() {
  docked.forEach(([mark, el]) => mark.replaceWith(el));
  docked = [];
}
export async function refreshTasks() {
  if (!active) return;
  if (loading) {
    again = true;
    return;
  }
  loading = true;
  do {
    again = false;
    const gen = ++sequence;
    try {
      const r = await fetch("/tasks?all=1"),
        body = await r.json();
      if (gen !== sequence || !active) continue;
      if (!r.ok) throw new Error(body.why || body.error || "Tasks could not be loaded");
      items = body.tasks ?? [];
      loaded = true;
      error = "";
      setTaskAttention(items);
      dispatchEvent(new CustomEvent("kz-task-list", { detail: items }));
      draw();
    } catch (e) {
      if (active) {
        error = e instanceof Error ? e.message : "Tasks could not be loaded";
        draw();
      }
    }
  } while (again);
  loading = false;
}
function draw() {
  if (!document.body.classList.contains("taskv")) return;
  dock();
  if ($("tk-list").contains(document.activeElement) && document.activeElement !== document.body) return;
  const q = $("bq").value || "",
    dir = !store.all ? (store.S.dir ?? "") : "";
  const scoped = items.filter((t) => !dir || t.dir === dir);
  const matched = filteredTasks(scoped, filter, q);
  const rows = pageOf(pg, matched);
  $("tk-chips").innerHTML = String(
    html`${TASK_FILTERS.map(([id, label]) => html`<button type="button" class="ice-chip${filter === id ? " on" : ""}" data-task-filter="${id}" aria-pressed="${String(filter === id)}">${label}<i>${id === "all" ? scoped.length : scoped.filter((t) => t.attention.category === id).length}</i></button>`)}`,
  );
  $("tk-filt-sum").classList.toggle("on", filter !== "all");
  const empty = error
    ? html`<p>${error}</p>
        <button class="btn" type="button" id="tasks-retry">Try again</button>`
    : !loaded
      ? html`<p role="status">Loading tasks…</p>`
      : scoped.length
        ? html`<p>No tasks match</p>
            <span>Try another search or show all tasks.</span
            ><button class="btn" type="button" id="tasks-reset">Clear search and filters</button>`
        : html`<p>What would you like to make?</p>
            <span>Describe a goal. Keep the decisions, results and later changes together.</span
            ><button class="btn pri" type="button" id="tasks-first">New task</button>`;
  const list = rows.length
    ? html`<div class="tp-task-list" aria-label="Tasks">
        ${rows.map(
          (t, i) =>
            html`<button type="button" class="tp-task-row${sel === i ? " kb" : ""}" data-task-row="${String(i)}">
              <span class="si ${t.attention.category === "needs-you" ? "wait" : t.attention.category === "completed" ? "done" : "idle"}"></span><span class="tp-task-main"
                ><strong>${t.title}</strong
                ><small
                  >${
                    t.projectName ||
                    (t.dir
                      ? t.dir
                          .replace(/[\\/]\.kaizen$/, "")
                          .split(/[\\/]/)
                          .pop()
                      : "Project needed")
                  }${t.currentResultId ? " · Result available" : ""}</small
                ></span
              ><span class="tp-task-attention ${t.attention.category}"
                ><span>${taskStatus(t)}</span><small>${t.attention.action}</small></span
              ><span class="tp-task-age"
                >${t.updatedAt ? age(Number(new Date(t.updatedAt)), Date.now()) + " ago" : ""}</span
              >
            </button>`,
        )}
      </div>`
    : html`<div class="tk-empty">${ico("plus")}${empty}</div>`;
  // List changes never replace a focused row during a background state tick.
  if (!$("tk-list").contains(document.activeElement) || document.activeElement === document.body)
    $("tk-list").innerHTML = String(html`${list}${pagerHtml(pg)}`);
  wirePager(pg, () => {
    sel = 0;
    draw();
  });
  $("tasksv")
    .querySelectorAll<HTMLElement>("[data-task-filter]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          filter = b.dataset.taskFilter!;
          $("tk-filt").removeAttribute("open");
          sel = 0;
          pg.at = 0;
          draw();
        }),
    );
  $("tasksv")
    .querySelectorAll<HTMLElement>("[data-task-row]")
    .forEach((b) => (b.onclick = () => void openTaskRecord(rows[Number(b.dataset.taskRow)])));
  $("tasks-first") &&
    ($("tasks-first").onclick = () => newTask());
  $("tasks-reset") &&
    ($("tasks-reset").onclick = () => {
      filter = "all";
      $("bq").value = "";
      sel = 0;
      draw();
      $("bq").focus();
    });
  $("tasks-retry") && ($("tasks-retry").onclick = () => void refreshTasks());
  shown = rows;
  sel = Math.max(0, Math.min(sel, shown.length - 1));
}
export function openTasks() {
  active = true;
  $("bq").placeholder = "Search tasks (press /)";
  addEventListener(
    "kz-view",
    () => {
      active = false;
      sequence++;
      undock();
      $("bq").placeholder = "Filter cards (press /)";
    },
    { once: true },
  );
  draw();
  void refreshTasks();
}
export function initTasks(_goTo) {
  addEventListener("kz-state", () => {
    if (active) void refreshTasks();
  });
  $("tasksv")?.addEventListener("focusout", () => setTimeout(draw, 0));
  $("bq")?.addEventListener("input", () => {
    sel = 0;
    pg.at = 0;
    draw();
  });
  addEventListener("keydown", (e) => {
    if (!active || !shown.length || e.defaultPrevented) return;
    const t = e.target as HTMLElement;
    if (t.id !== "bq" && t.closest("input,textarea,select,[contenteditable],details,dialog")) return;
    if (["ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      sel = Math.max(0, Math.min(shown.length - 1, sel + (e.key === "ArrowDown" ? 1 : -1)));
      $("tasksv")
        .querySelectorAll<HTMLElement>("[data-task-row]")
        .forEach((b, i) => b.classList.toggle("kb", i === sel));
      $("tasksv").querySelector(`[data-task-row="${sel}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && t.id === "bq" && !e.isComposing) {
      e.preventDefault();
      void openTaskRecord(shown[sel]);
    }
  });
}
