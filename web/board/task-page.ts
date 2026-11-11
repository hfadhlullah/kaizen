// One durable task page across clarification, production, saved outputs and revisions.
// Polling patches the changing sections, leaving the composer and focused controls intact.
import { $, html, ico, modal, dataUrls, type Safe } from "./dom.ts";
import { store } from "./store.ts";
import { runPopup } from "./cards.ts";
import { toast } from "./toast.ts";
import { wireZoom } from "./zoom.ts";
import { attentionTasks, setTaskAttention } from "./badge.ts";
import { checksView, savedLine, resultView, loadTextArtifacts, loadLiveArtifacts, type TaskResult } from "./task-results.ts";

export type TaskAttention = { category: "needs-you" | "in-progress" | "completed"; reason: string; action: string };
export type TaskDecision = {
  id: string;
  kind: "question" | "proposal" | "project" | string;
  text: string;
  summary?: string;
  details?: string;
  options?: string[];
};
export type TaskView = {
  id: string;
  dir: string;
  title: string;
  goal: string;
  revision: number;
  updatedAt?: number | string;
  status?: string;
  attention: TaskAttention;
  decision?: TaskDecision | null;
  messages?: { id: string; role: string; text: string; at?: number | string }[];
  inputs?: { id: string; text: string; state: string; at?: number | string }[];
  activeRun?: string | null;
  runs?: (string | { id: string })[];
  acceptedResultId?: string | null;
  currentResultId?: string | null;
  files?: { name: string; url?: string }[];
  legacy?: { kind: string; id?: string; text?: string; state?: string };
  error?: string;
  projectName?: string;
};
export type TaskPageData = {
  task: TaskView;
  results?: TaskResult[];
  projects?: { dir: string; name?: string; label?: string }[];
  defaults?: { agent?: string; workflow?: string; permissions?: string };
};
const queued = (t: TaskView) => (t.inputs ?? []).filter((i) => ["received", "queued", "dispatched"].includes(i.state));
export function canAcceptTask(t: TaskView, result?: TaskResult) {
  return (
    !!result &&
    result.id === t.currentResultId &&
    !t.decision &&
    !t.activeRun &&
    !queued(t).length &&
    t.attention.category !== "completed"
  );
}
export const taskHref = (t: Pick<TaskView, "id" | "dir">) =>
  `?view=task&task=${encodeURIComponent(t.id)}&dir=${encodeURIComponent(t.dir || "")}`;
export const taskStatus = (t: TaskView) => t.attention?.reason || t.status || "Saved";
const readDraft = (key: string) => {
  try {
    return sessionStorage.getItem("kz-task:" + key) || "";
  } catch {
    return "";
  }
};
const saveDraft = (key: string, text: string) => {
  try {
    sessionStorage.setItem("kz-task:" + key, text);
  } catch {}
};
const operationId = () => crypto.randomUUID();
let go: (view: string, push?: boolean) => void = () => {};
let followCurrent = true;
let data: TaskPageData | null = null,
  generation = 0,
  selectedResult = "",
  selectedArtifact = "",
  signature = "",
  pending = false;
let currentId = "",
  currentDir = "";
let timer: ReturnType<typeof setTimeout> | undefined;
const projectName = (t: TaskView) =>
  t.projectName ||
  data?.projects?.find((p) => p.dir === t.dir)?.name ||
  data?.projects?.find((p) => p.dir === t.dir)?.label ||
  (t.dir
    ? t.dir
        .replace(/[\\/]\.kaizen$/, "")
        .split(/[\\/]/)
        .pop()
    : "Choose a project");

export async function taskRequest(body: Record<string, unknown>) {
  try {
    const r = await fetch("/task", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = await r.json();
    if (!r.ok || value.ok === false) {
      toast(value.why || value.error || "That did not work. Your message is still saved here.");
      return { ...value, ok: false, conflict: r.status === 409 };
    }
    return { ...value, ok: true };
  } catch {
    toast("The server could not be reached. Your draft is still here; try again.");
    return { ok: false };
  }
}
export function navigateTask(t: Pick<TaskView, "id" | "dir">, replace = false) {
  (replace ? history.replaceState : history.pushState).call(history, null, "", taskHref(t));
  go("task");
}
export async function openTaskRecord(t: TaskView) {
  if (t.legacy) {
    const r = await taskRequest({ op: "adopt", dir: t.dir, legacy: t.legacy, operationId: operationId() });
    if (r.ok && r.task) return navigateTask(r.task);
    return;
  }
  navigateTask(t);
}
function decisionView(t: TaskView): Safe | string {
  const d = t.decision;
  if (!d || d.kind === "project") return "";
  return html`<section class="tp-decision" aria-labelledby="tp-decision-title">
    <h3 id="tp-decision-title">
      ${d.kind === "proposal" ? "Confirm the proposal" : d.kind === "project" ? "Choose a project" : "Your answer is needed"}
    </h3>
    <p>${d.summary || d.text}</p>
    ${d.summary && d.text !== d.summary ? html`<p>${d.text}</p>` : ""}${
      d.details
        ? html`<details>
            <summary>Detailed plan</summary>
            <pre class="tp-text">${d.details}</pre>
          </details>`
        : ""
    }${
      d.kind === "proposal"
        ? html`<button
              type="button"
              class="btn pri"
              id="tp-confirm"
              data-decision-id="${d.id}"
              ${pending ? html` disabled` : ""}
            >
              Confirm proposal
            </button>
            <p class="dim">Production starts after you confirm this version. Ask for changes below if needed.</p>`
        : d.options?.length
          ? html`<div class="tp-options">
              ${d.options.map((o) => html`<button class="btn" type="button" data-answer="${o}">${o}</button>`)}
            </div>`
          : ""
    }
  </section>`;
}
function projectView(t: TaskView): Safe | string {
  if (t.dir && t.decision?.kind !== "project") return "";
  return html`<section class="tp-decision">
    <h3>Where should this task belong?</h3>
    <p>Your goal and files are saved. Choose a named project or create one.</p>
    <label for="tp-project">Project</label
    ><select id="tp-project" class="sel">
      <option value="">Choose a project</option>
      ${(data?.projects ?? []).map(
        (p) =>
          html`<option value="${p.dir}">
            ${(p.name || p.label || p.dir)
              .replace(/[\\/]\.kaizen$/, "")
              .split(/[\\/]/)
              .pop()}
          </option>`,
      )}</select
    ><button type="button" class="btn" id="tp-select-project">Use project</button>
    <form id="tp-project-form">
      <label for="tp-project-name">New project name</label>
      <div class="tp-inline">
        <input id="tp-project-name" class="sel" required placeholder="Community workshop" /><button
          type="submit"
          class="btn"
        >
          Create project
        </button>
      </div>
    </form>
  </section>`;
}
function conversationView(t: TaskView): Safe {
  return html`${projectView(t)}${decisionView(t)}
    ${
      t.files?.length
        ? html`<details class="tp-references">
            <summary>Reference files · ${t.files.length}</summary>
            <ul>
              ${t.files.map((f) => html`<li>${f.url && /^\/file\?/.test(f.url) ? html`<a href="${f.url}" target="_blank" rel="noopener noreferrer">${f.name}</a>` : f.name}</li>`)}
            </ul>
          </details>`
        : ""
    }
    <div class="tp-messages" role="log" aria-label="Task conversation" aria-live="polite" aria-relevant="additions">
      ${(t.messages ?? []).map((m) => {
        const long = m.text.length > 320;
        const body = long
          ? html`<details class="tp-long"><summary>${m.text.slice(0, 280).trimEnd()}… <span>Show more</span></summary>${m.text}</details>`
          : html`${m.text}`;
        return html`<article class="tp-message ${m.role === "user" ? "from-user" : "from-agent"}">
          <div>
            <strong>${m.role === "user" ? "You" : m.role === "system" ? "kaizen" : "Assistant"}</strong
            >${m.at ? html`<time>${new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>` : ""}
          </div>
          <p>${body}</p>
        </article>`;
      })}
    </div>
    ${
      queued(t).length
        ? html`<div class="tp-queue" aria-label="Requests awaiting completion">
            ${queued(t).map(
              (i) =>
                html`<span class="tp-receipt" title="Receipt ${i.id.slice(0, 8)}"
                  >${i.state === "dispatched" ? "Processing" : i.state === "received" ? "Received" : "Queued for next pass"}</span
                >`,
            )}
          </div>`
        : ""
    }`;
}
function technicalView(t: TaskView, current?: TaskResult): Safe {
  const runs = [
    ...new Set([
      ...(t.runs ?? []).map((r) => (typeof r === "string" ? r : r.id)),
      ...(t.activeRun ? [t.activeRun] : []),
    ]),
  ];
  return html`<div class="tp-technical" id="tp-technical-details">
    ${checksView(current)}
    <p>
      ${data?.defaults?.agent ? "Agent: " + data.defaults.agent + ". " : "Configured project agent and workflow. "}${data?.defaults?.workflow ? "Workflow: " + data.defaults.workflow + ". " : ""}${data?.defaults?.permissions || "Tool permissions follow the existing project settings."}
    </p>
    <p class="dim">
      Permission prompts may require the supported terminal controls in the workspace. Stop requests cancellation; it
      does not undo files.
    </p>
    ${runs.length ? html`<nav aria-label="Linked runs">${runs.map((id) => html`<a class="btn" href="?view=run&id=${id}&dir=${encodeURIComponent(t.dir)}">Open workspace · ${id}</a>`)}</nav>` : html`<p>No run has started yet.</p>`}<div class="tp-close" role="group" aria-label="Close this task"><button type="button" class="btn ghost" data-close="archive">Archive</button>${t.activeRun ? html`<button type="button" class="btn danger" data-close="abandon">Abandon</button>` : html`<button type="button" class="btn danger" data-close="delete">Delete</button>`}</div><small
      >Task ${t.id} · revision ${t.revision}</small
    >
  </div>`;
}
function updateActions() {
  if (!data) return;
  const t = data.task,
    current = (data.results ?? []).find((r) => r.id === t.currentResultId);
  $("tp-accept").hidden = selectedResult !== t.currentResultId || !canAcceptTask(t, current);
  $("tp-stop").hidden = !t.activeRun || ["interrupted", "failed", "stopped"].includes(t.status ?? "");
  $("tp-stop").textContent = t.status === "stopping" ? "Stopping…" : "Stop";
  $("tp-stop").disabled = pending || t.status === "stopping";
  $("tp-resume").hidden = !["interrupted", "failed", "stopped"].includes(t.status ?? "");
  $("tp-resume").textContent = t.status === "failed" ? "Retry" : "Resume";
  $("tp-start").hidden =
    !t.dir || !!t.activeRun || !!t.currentResultId || t.status !== "draft" || t.decision?.kind === "project";
  $("tp-submit").disabled = pending;
  $("tp-submit").textContent = pending ? "Sending…" : t.decision?.kind === "question" ? "Send answer" : "Send";
  $("tp-composer-help").textContent = t.activeRun
    ? "Changes are saved for the next safe pass. Questions do not interrupt production."
    : t.attention.category === "completed"
      ? "A new change stays in this task and starts a linked revision."
      : "Ask a question or describe a change. Your message stays with this task.";
}
function preservePatch(id: string, markup: Safe | string) {
  const box = $(id);
  if (!box) return false;
  const next = String(markup);
  if (box.dataset.markup === next) return true;
  // A focused decision/history control is not replaced by a background refresh.
  if (box.contains(document.activeElement) && document.activeElement !== document.body) return false;
  const opened = [...box.querySelectorAll<HTMLDetailsElement>("details")].map((d) => d.open);
  box.innerHTML = next;
  box.dataset.markup = next;
  box.querySelectorAll<HTMLDetailsElement>("details").forEach((d, i) => {
    if (opened[i] != null) d.open = opened[i];
  });
  return true;
}
// The conversation is a drawer: open by itself only while a decision waits for you, closed otherwise.
let drawer: boolean | null = null,
  threadCount = -1;
const drawerOpen = () =>
  drawer ?? !!data?.task.pendingDecision;
function applyDrawer() {
  const on = drawerOpen();
  $("tp-drawer").classList.toggle("on", on);
  $("tp-chat").setAttribute("aria-expanded", String(on));
  const t = data?.task;
  $("tp-chat").querySelector<HTMLElement>(".tp-dot")!.hidden = on || !(t?.pendingDecision || t?.inputs?.some?.((i: any) => i.state === "queued"));
}
function draw() {
  if (!data || !document.body.classList.contains("taskpagev")) return;
  const t = data.task,
    box = $("taskpagev");
  if (!box.querySelector("#tp-composer")) {
    box.innerHTML = String(
      html`<header class="tp-head">
          <a class="ib" href="?view=tasks" id="tp-back" aria-label="Back to tasks" title="Tasks">${ico("arrow")}</a>
          <h1 id="tp-title"></h1>
          <span id="tp-project-label" class="dim"></span>
          <button class="btn" type="button" id="tp-stop" hidden>Stop</button
          ><button class="btn" type="button" id="tp-resume" hidden>Resume</button
          ><button class="btn pri" type="button" id="tp-start" hidden>Start planning</button
          ><button type="button" class="btn pri" id="tp-accept" title="Accepting a result does not publish it. A preview alone does not prove that a backend works." hidden>Looks good</button
          ><button type="button" class="ib" id="tp-chat" aria-label="Conversation" aria-expanded="false" title="Conversation">${ico("note")}<i class="tp-dot" hidden></i></button
          ><details class="ice-filt" id="tp-info"><summary class="ib" aria-label="Task details" title="Details">${ico("more")}</summary><div class="ice-fpop tp-info-pop"><div id="tp-technical"></div></div></details>
        </header>
        <div class="tp-status" role="status"><span id="tp-status"></span><span id="tp-next"></span><span id="tp-saved" class="dim"></span></div>
        <div class="tp-layout">
          <section class="tp-results" aria-label="Task results">
            <div id="tp-history"></div>
            <div id="tp-result"></div>
            <div id="tp-accepted"></div>
          </section>
          <div class="tp-conversation" id="tp-drawer" role="complementary" aria-label="Conversation and requests">
          <header><h2>Conversation</h2><button type="button" class="ib" id="tp-drawer-x" aria-label="Close conversation">${ico("x")}</button></header>
          <div id="tp-thread"></div>
        </div>
        </div>
        <form id="tp-composer" class="tp-bar">
          <div class="tp-compose">
            <textarea id="tp-message" rows="1" aria-label="Your message" placeholder="Message the agent" title="Enter to send, Shift+Enter for a new line"></textarea>
            <button type="submit" class="btn pri" id="tp-submit">Send</button>
          </div>
          <p id="tp-composer-help" class="dim" hidden></p>
          <p id="tp-receipt" role="status"></p>
        </form>
`,
    );
    $("tp-message").value = readDraft(t.id);
    $("tp-message").oninput = () => saveDraft(t.id, $("tp-message").value);
    $("tp-back").onclick = (e) => {
      e.preventDefault();
      go("tasks", true);
    };
    $("tp-composer").onsubmit = (e) => {
      e.preventDefault();
      void sendMessage();
    };
    $("tp-message").onkeydown = (e) => {
      // Enter sends, Shift+Enter adds a line. A phone keyboard keeps Enter as a new line.
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !matchMedia("(pointer:coarse)").matches) {
        e.preventDefault();
        void sendMessage();
      }
    };
    $("tp-chat").onclick = () => {
      drawer = !drawerOpen();
      applyDrawer();
    };
    $("tp-drawer-x").onclick = () => {
      drawer = false;
      applyDrawer();
    };
    $("tp-info").addEventListener("click", async (e) => {
      const op = (e.target as HTMLElement).closest<HTMLElement>("[data-close]")?.dataset.close;
      if (!op) return;
      const ask = { delete: "Delete this task? It is not recorded anywhere.", abandon: "Abandon this run? Saved files are not rolled back." }[op];
      if (ask && !confirm(ask)) return;
      const r = await action(op, op === "abandon" ? { why: "abandoned from the task page" } : {});
      if (r?.ok && op !== "abandon") {
        history.pushState(null, "", "?view=tasks");
        go("tasks");
      }
    });
    $("tp-stop").onclick = () => void action("stop");
    $("tp-resume").onclick = () => void action("resume");
    $("tp-start").onclick = () => runPopup({ _k: "task:" + t.id, kind: "task", state: t.dir, text: t.title }, (pick) => void action("start", { pick }));
    $("tp-accept").onclick = () => void action("accept", { resultId: data?.task.currentResultId });
  }
  $("tp-title").textContent = t.title;
  $("tp-project-label").textContent = projectName(t);
  $("tp-status").textContent = taskStatus(t);
  $("tp-next").textContent = t.attention?.action || "";
  $("tp-status").className = "tp-state " + (t.attention?.category ?? "");
  document.title = t.title + " · kaizen";
  const results = [...(data.results ?? [])].sort(
      (a, b) => Number(new Date(a.createdAt ?? 0)) - Number(new Date(b.createdAt ?? 0)),
    ),
    selected =
      results.find((r) => r.id === selectedResult) ??
      results.find((r) => r.id === t.currentResultId) ??
      results[results.length - 1];
  if (followCurrent && t.currentResultId) selectedResult = t.currentResultId;
  else selectedResult = selected?.id ?? "";
  preservePatch(
    "tp-history",
    results.length > 1
      ? html`<select class="sel" id="tp-version" aria-label="Saved results" title="Files are retained without automatic expiry. Live links remain mutable.">
            ${[...results].reverse().map((r, i) => html`<option value="${r.id}" ${r.id === selectedResult ? html` selected` : ""}>${r.title || "Version " + (results.length - i)}${r.id === t.currentResultId ? " · current" : " · earlier saved output"}</option>`)}
          </select>`
      : "",
  );
  $("tp-saved").textContent = savedLine(results.find((r) => r.id === selectedResult) ?? selected);
  const resultMarkup = String(resultView(results.find((r) => r.id === selectedResult) ?? selected, selectedArtifact));
  if (signature !== resultMarkup) {
    if (preservePatch("tp-result", resultMarkup)) {
      signature = resultMarkup;
      void loadTextArtifacts($("tp-result"));
      void loadLiveArtifacts($("tp-result"));
    }
  }
  $("tp-version") &&
    ($("tp-version").onchange = () => {
      selectedResult = $("tp-version").value;
      followCurrent = selectedResult === t.currentResultId;
      selectedArtifact = "";
      signature = "";
      draw();
    });
  $("tp-result")
    .querySelectorAll<HTMLElement>("[data-artifact]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          selectedArtifact = b.dataset.artifact!;
          b.blur();
          signature = "";
          draw();
          $("tp-result")
            .querySelector<HTMLElement>(`[data-artifact="${CSS.escape(selectedArtifact)}"]`)
            ?.focus({ preventScroll: true });
        }),
    );
  wireZoom($("tp-result"));
  const count = (t.messages ?? []).length;
  const grew = preservePatch("tp-thread", conversationView(t)) && count !== threadCount;
  threadCount = count;
  if (grew) requestAnimationFrame(() => ($("tp-thread").scrollTop = $("tp-thread").scrollHeight));
  applyDrawer();
  preservePatch("tp-technical", technicalView(t, results.find((r) => r.id === selectedResult) ?? selected));
  $("tp-accepted").textContent =
    t.acceptedResultId && t.attention.category === "completed" ? "Accepted. Publishing is a separate action." : "";
  $("tp-confirm") &&
    ($("tp-confirm").onclick = () => void action("confirm", { decisionId: $("tp-confirm").dataset.decisionId }));
  $("tp-select-project") &&
    ($("tp-select-project").onclick = () => {
      const projectDir = $("tp-project").value;
      if (projectDir) void action("project", { projectDir });
      else toast("Choose a named project first");
    });
  $("tp-project-form") &&
    ($("tp-project-form").onsubmit = (e) => {
      e.preventDefault();
      const name = $("tp-project-name").value.trim();
      if (name) void action("project", { name });
    });
  $("tp-thread")
    .querySelectorAll<HTMLElement>("[data-answer]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          $("tp-message").value = b.dataset.answer;
          void sendMessage();
        }),
    );
  updateActions();
}
async function action(op: string, extra: Record<string, unknown> = {}) {
  if (pending || !data) return;
  pending = true;
  updateActions();
  const request = {
    op,
    id: data.task.id,
    dir: data.task.dir,
    operationId: operationId(),
    revision: data.task.revision,
    ...extra,
  };
  const r = await taskRequest(request);
  pending = false;
  if (r.task && r.ok) {
    if (r.task.dir !== currentDir || r.task.id !== currentId) return navigateTask(r.task, true);
    data.task = r.task;
  }
  if (r.ok)
    $("tp-receipt").textContent =
      op === "stop"
        ? "Cancellation requested. Waiting for confirmation; saved files are not rolled back."
        : op === "accept"
          ? "Result accepted. It has not been published by this action."
          : op === "confirm"
            ? "Proposal confirmed."
            : "Saved.";
  await refreshTask();
  if (r.conflict)
    $("tp-receipt").textContent =
      "This task changed. Your message is still saved. Review the current result and send it again when ready.";
  updateActions();
  return r;
}
async function sendMessage() {
  const input = $("tp-message"),
    text = input?.value.trim();
  if (!text || pending || !data) return;
  const original = input.value;
  const baseResultId = selectedResult || data.task.currentResultId || null;
  const identity = JSON.stringify([text, baseResultId, data.task.decision?.id, "auto"]);
  let saved;
  try {
    saved = JSON.parse(readDraft(currentId + ":operation"));
  } catch {}
  const messageOperation = saved?.identity === identity ? saved.id : operationId();
  saveDraft(currentId + ":operation", JSON.stringify({ identity, id: messageOperation }));
  const r = await action("message", {
    operationId: messageOperation,
    text,
    intent: "auto",
    baseResultId,
    decisionId: data.task.decision?.id,
  });
  if (r?.ok && input.value === original) {
    followCurrent = true;
    input.value = "";
    saveDraft(currentId, "");
    saveDraft(currentId + ":operation", "");
    $("tp-receipt").textContent = "Message received. Follow its receipt in the conversation.";
    drawer = true;
    applyDrawer();
  }
  input.focus();
}
export async function refreshTask() {
  if (!currentId) return;
  const id = currentId,
    dir = currentDir,
    gen = ++generation;
  try {
    const r = await fetch(`/task?id=${encodeURIComponent(id)}&dir=${encodeURIComponent(dir)}`),
      next = await r.json();
    if (gen !== generation || id !== currentId || !document.body.classList.contains("taskpagev")) return;
    if (!r.ok || !next.task) {
      if (!data)
        $("taskpagev").innerHTML = String(
          html`<div class="tk-empty">
            <p>This task could not be opened</p>
            <span>${next.why || next.error || "Refresh or return to Tasks."}</span
            ><a class="btn" href="?view=tasks">Back to Tasks</a>
          </div>`,
        );
      return;
    }
    if (data && next.task.revision < data.task.revision) return;
    data = next;
    if (attentionTasks)
      setTaskAttention([...attentionTasks.filter((t) => t.id !== next.task.id || t.dir !== next.task.dir), next.task]);
    draw();
  } catch {
    if (!data)
      $("taskpagev").innerHTML =
        '<div class="tk-empty"><p>The server could not be reached</p><a class="btn" href="?view=tasks">Back to Tasks</a></div>';
  }
}
export function openTaskPage() {
  const p = new URLSearchParams(location.search),
    id = p.get("task") || "",
    dir = p.get("dir") || "";
  if (id !== currentId || dir !== currentDir) {
    currentId = id;
    currentDir = dir;
    data = null;
    followCurrent = true;
    drawer = null;
    selectedResult = "";
    selectedArtifact = "";
    signature = "";
    $("taskpagev").innerHTML = '<p class="tp-loading" role="status">Opening task…</p>';
  }
  void refreshTask();
  clearTimeout(timer);
  const poll = () => {
    if (!document.body.classList.contains("taskpagev")) return;
    void refreshTask();
    timer = setTimeout(poll, 4000);
  };
  timer = setTimeout(poll, 4000);
}
export function initTaskPage(goTo: typeof go) {
  go = goTo;
  addEventListener("kz-state", () => {
    if (document.body.classList.contains("taskpagev")) void refreshTask();
  });
  addEventListener("kz-view", () => {
    generation++;
    clearTimeout(timer);
  });
  addEventListener("kz-open-task", (e: CustomEvent) => {
    e.preventDefault();
    navigateTask(e.detail);
  });
}
