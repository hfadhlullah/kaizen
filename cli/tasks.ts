// Durable task identity is independent of inbox text and run lifecycle. Mutations
// use an exclusive disk lock plus revision checks, including across board processes.
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { randomUUID, createHash } from "node:crypto";

export type InputState = "received" | "queued" | "dispatched" | "applied" | "failed";
export type TaskInput = { id: string; text: string; intent: "change" | "answer" | "status"; at: number; state: InputState; baseResult: string | null; baseRun: string | null; error?: string };
export type TaskEvent = { id: string; at: number; role: "user" | "assistant" | "system"; type: string; text: string; inputIds?: string[] };
export type TaskDecision = { id: string; kind: "question" | "proposal" | "rebase"; text: string; run: string | null; iteration: number; result: string | null; options?: string[]; summary?: string; details?: string; runRevision?: number };
export type TaskLaunch = { id: string; run: string | null; inputIds: string[]; phase: "intent" | "started" | "acknowledged" | "interrupted"; at: number; pty?: string };
export type Task = {
  schema: 1; id: string; title: string; goal: string; project: string | null; revision: number; created: number; updated: number;
  status: "draft" | "waiting" | "working" | "ready" | "accepted" | "stopping" | "interrupted" | "failed";
  runIds: string[]; activeRun: string | null; currentResult: string | null; acceptedResult: string | null;
  pendingDecision: TaskDecision | null; inputs: TaskInput[]; events: TaskEvent[]; operations: string[];
  files: { name: string; path: string }[]; launch: TaskLaunch | null; safe: boolean; queuePaused: boolean;
  initialConfirmed: boolean; writePhase: boolean; error?: string; legacyKey?: string; archived?: boolean; alias?: { state: string; id: string };
};
export type Mutation = { revision: number; opId: string };
export class TaskError extends Error { constructor(message: string, public status = 409) { super(message); } }
export const taskId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
export function taskDir(state: string, id: string) {
  if (!taskId(id)) throw new TaskError("Unknown task", 404);
  const dir = join(state, "tasks", id);
  const tasks = join(state, "tasks");
  if (existsSync(tasks) && existsSync(state) && !realpathSync(tasks).startsWith(realpathSync(state) + sep)) throw new TaskError("Task storage is outside this project", 404);
  if (existsSync(dir) && existsSync(state) && !realpathSync(dir).startsWith(realpathSync(state) + sep)) throw new TaskError("Task storage is outside this project", 404);
  return dir;
}
const fileOf = (state: string, id: string) => join(taskDir(state, id), "task.json");
const json = (file: string) => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } };
function atomic(file: string, value: unknown) { const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`; try { writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 }); renameSync(tmp, file); } finally { rmSync(tmp, { force: true }); } }
// Dead disk locks may be reclaimed; this is storage recovery only and never a
// safe-work boundary or permission to replay an unacknowledged launch.
export function acquireTaskLock(lock: string): () => void {
  try { mkdirSync(lock); }
  catch {
    // Serialize reclaimers separately, then reread ownership. Otherwise two
    // reclaimers could both observe a dead PID and the second steal a fresh lock.
    const recovery = lock + ".recovery";
    try { mkdirSync(recovery); } catch { throw new TaskError("Task lock recovery is in progress. Refresh and try again."); }
    try {
      const owner = json(join(lock, "owner.json")); let dead = false;
      if (Number.isSafeInteger(owner?.pid) && owner.pid > 0) {
        try { process.kill(owner.pid, 0); } catch (error) { dead = (error as NodeJS.ErrnoException).code === "ESRCH"; }
      } else { try { dead = Date.now() - statSync(lock).mtimeMs > 30_000; } catch { /* another process acquired it */ } }
      if (!dead) throw new TaskError("Task is being updated. Refresh and try again.");
      const stale = `${lock}.stale-${randomUUID()}`;
      try { renameSync(lock, stale); mkdirSync(lock); }
      catch { throw new TaskError("Task is being updated. Refresh and try again."); }
      finally { rmSync(stale, { recursive: true, force: true }); }
    } finally { rmSync(recovery, { recursive: true, force: true }); }
  }
  writeFileSync(join(lock, "owner.json"), JSON.stringify({ pid: process.pid }), { mode: 0o600 });
  return () => rmSync(lock, { recursive: true, force: true });
}
function locked<T>(state: string, id: string, fn: () => T): T {
  const dir = taskDir(state, id); mkdirSync(dir, { recursive: true, mode: 0o700 });
  const release = acquireTaskLock(join(dir, "mutation.lock"));
  try { return fn(); } finally { release(); }
}
export function readTask(state: string, id: string): Task | null {
  if (!taskId(id)) return null;
  try { const t = json(fileOf(state, id)); return t?.schema === 1 && t.id === id && Array.isArray(t.inputs) && Array.isArray(t.events) ? t : null; } catch { return null; }
}
export function resolveTask(state: string, id: string): { state: string; task: Task } | null {
  const seen = new Set<string>();
  for (let n = 0; n < 8; n++) {
    const key = resolve(state) + "\0" + id; if (seen.has(key)) return null; seen.add(key);
    const task = readTask(state, id); if (!task) return null;
    if (!task.alias) return { state, task };
    state = task.alias.state; id = task.alias.id;
  }
  return null;
}
export function listTasks(state: string): Task[] {
  try { return readdirSync(join(state, "tasks")).filter(taskId).map((id) => readTask(state, id)).filter((t): t is Task => !!t && !t.alias).sort((a, b) => taskProjection(a).rank - taskProjection(b).rank || b.updated - a.updated); } catch { return []; }
}
export function deleteTask(state: string, id: string) { rmSync(taskDir(state, id), { recursive: true, force: true }); }
export type NewTask = { goal: string; title?: string; project?: string | null; files?: Task["files"] };
export function createTask(state: string, input: NewTask, opId?: string): Task {
  if (!input.goal?.trim()) throw new TaskError("Describe what you want to make", 400);
  // The operation-derived UUID makes a retry safe even after process restart.
  const hash = opId ? createHash("sha256").update(opId).digest("hex") : null;
  const id = hash ? `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}` : randomUUID();
  return locked(state, id, () => {
    const existing = readTask(state, id); if (existing) return existing;
    const now = Date.now();
    const task: Task = { schema: 1, id, title: (input.title?.trim() || input.goal.trim().split("\n")[0]).slice(0, 160), goal: input.goal.trim(), project: input.project ?? null, revision: 0, created: now, updated: now, status: "draft", runIds: [], activeRun: null, currentResult: null, acceptedResult: null, pendingDecision: null, inputs: [], events: [{ id: randomUUID(), at: now, role: "user", type: "goal", text: input.goal.trim() }], operations: opId ? [opId] : [], files: input.files ?? [], launch: null, safe: true, writePhase: false, queuePaused: false, initialConfirmed: false };
    atomic(fileOf(state, id), task); return task;
  });
}
export function mutateTask(state: string, id: string, mutation: Mutation, update: (task: Task) => void): Task {
  if (!mutation.opId || mutation.opId.length > 200) throw new TaskError("A request id is required", 400);
  return locked(state, id, () => {
    const task = readTask(state, id); if (!task || task.alias) throw new TaskError("Task moved or is unavailable. Refresh.", 404);
    if (task.operations.includes(mutation.opId)) return task;
    if (task.revision !== mutation.revision) throw new TaskError("This task changed while you were reading (agent progress or another window). Refresh before sending.");
    update(task); task.revision++; task.updated = Date.now(); task.operations.push(mutation.opId);
    atomic(fileOf(state, id), task); return task;
  });
}
export function adoptTask(state: string, legacyKey: string, input: NewTask): Task {
  const task = createTask(state, input, `legacy:${legacyKey}`);
  if (task.legacyKey === legacyKey) return task;
  return mutateTask(state, task.id, { revision: task.revision, opId: `adopt:${legacyKey}` }, (t) => { t.legacyKey = legacyKey; });
}
// Destination is committed before the alias. A crash between those writes is safe:
// the same task UUID resumes transfer; the source remains readable until aliased.
export function transferDraft(state: string, id: string, destination: string, project: string): Task {
  if (resolve(state) === resolve(destination)) {
    const task = readTask(state, id); if (!task) throw new TaskError("Unknown draft", 404);
    return mutateTask(state, id, { revision: task.revision, opId: `project:${project}` }, (t) => { t.project = project; });
  }
  return locked(state, id, () => {
    const source = readTask(state, id); if (!source) throw new TaskError("Unknown draft", 404);
    if (source.alias) { const resolved = resolveTask(state, id); if (!resolved) throw new TaskError("Project transfer is unavailable"); return resolved.task; }
    const target = locked(destination, id, () => {
      const existing = readTask(destination, id); if (existing) return existing;
      const task = { ...source, project, revision: source.revision + 1, updated: Date.now() };
      // Attachment bytes are owned by intake and copied before calling this method;
      // preserving absolute file references prevents a draft transfer losing context.
      task.files = source.files.map((f) => ({ ...f, path: resolve(state, f.path) }));
      atomic(fileOf(destination, id), task); return task;
    });
    atomic(fileOf(state, id), { ...source, alias: { state: resolve(destination), id }, revision: source.revision + 1, updated: Date.now() });
    return target;
  });
}
export function addEvent(task: Task, role: TaskEvent["role"], type: string, text: string, inputIds?: string[]) {
  task.events.push({ id: randomUUID(), at: Date.now(), role, type, text, ...(inputIds ? { inputIds } : {}) });
}
export function receiveInput(task: Task, input: { id: string; text: string; intent?: TaskInput["intent"]; baseResult: string | null; baseRun?: string | null }): TaskInput {
  const existing = task.inputs.find((i) => i.id === input.id); if (existing) return existing;
  if (input.baseResult !== task.currentResult || (input.baseRun !== undefined && input.baseRun !== task.activeRun)) throw new TaskError("The result changed. Refresh and review your request before sending.");
  if (!input.text?.trim()) throw new TaskError("Write a message first", 400);
  const intent = input.intent ?? "change";
  const item: TaskInput = { id: input.id, text: input.text.trim(), intent, at: Date.now(), state: intent === "status" ? "applied" : "queued", baseResult: input.baseResult, baseRun: task.activeRun };
  task.inputs.push(item); addEvent(task, "user", intent, item.text, [item.id]);
  if (intent === "status") addEvent(task, "assistant", "status", taskProjection(task).reason, [item.id]);
  else if (task.status === "accepted") { task.acceptedResult = null; task.status = "ready"; }
  return item;
}
export function dispatchInputs(task: Task): TaskInput[] {
  if (!task.safe || task.writePhase || task.queuePaused || task.pendingDecision || task.status === "stopping" || task.status === "interrupted" || (task.launch && task.launch.phase !== "acknowledged")) return [];
  if (task.inputs.some((i) => i.state === "dispatched")) return [];
  const batch = task.inputs.filter((i) => i.state === "queued" || i.state === "received");
  if (!batch.length) return [];
  for (const i of batch) i.state = "dispatched";
  task.safe = false; task.status = "working"; return batch;
}
export function acknowledgeInputs(task: Task, ids: string[], outcome: "applied" | "failed", error?: string) {
  for (const id of ids) {
    const item = task.inputs.find((i) => i.id === id); if (!item || !["dispatched", outcome].includes(item.state)) throw new TaskError("Input acknowledgement does not match dispatched work");
  }
  for (const item of task.inputs.filter((i) => ids.includes(i.id))) { item.state = outcome; if (error) item.error = error; }
}
export function safeBoundary(task: Task, run: string, text = "Work paused at a safe boundary") {
  if (task.activeRun !== run) throw new TaskError("This acknowledgement belongs to another run");
  if (task.inputs.some((i) => i.state === "dispatched")) throw new TaskError("Acknowledge dispatched requests before the next pass");
  task.safe = true; task.writePhase = false; if (task.launch) task.launch.phase = "acknowledged";
  addEvent(task, "system", "boundary", text);
}
export function beginLaunch(task: Task, inputIds: string[] = []): TaskLaunch {
  if (task.queuePaused || task.launch && ["intent", "started", "interrupted"].includes(task.launch.phase)) throw new TaskError("Previous launch needs acknowledgement or explicit recovery");
  if (task.writePhase || task.pendingDecision || !task.safe && (!inputIds.length || !inputIds.every((id) => task.inputs.some((i) => i.id === id && i.state === "dispatched")))) throw new TaskError("Current work has not reached a safe boundary");
  task.launch = { id: randomUUID(), run: null, inputIds, phase: "intent", at: Date.now() }; task.safe = false; task.status = "working"; return task.launch;
}
export function acknowledgeLaunch(task: Task, launchId: string, run: string, pty?: string) {
  if (task.launch?.id !== launchId || task.launch.phase === "interrupted") throw new TaskError("Launch acknowledgement is stale");
  if (task.launch.run && task.launch.run !== run) throw new TaskError("A different run owns this launch");
  task.launch.run = run; task.launch.phase = "acknowledged"; if (pty) task.launch.pty = pty;
  task.activeRun = run; if (!task.runIds.includes(run)) task.runIds.push(run);
}
export function recoverLaunch(task: Task) {
  if (task.launch && ["intent", "started"].includes(task.launch.phase)) { task.launch.phase = "interrupted"; task.status = "interrupted"; task.queuePaused = true; task.safe = false; task.error = "The agent launch was interrupted before acknowledgement. Reconcile the session before resuming."; }
}
export function requestStop(task: Task) { task.queuePaused = true; task.status = "stopping"; task.safe = false; addEvent(task, "system", "stop", "Stop requested. Waiting for the agent to stop; existing edits are retained."); }
export function confirmStopped(task: Task) { if (task.status !== "stopping") throw new TaskError("Stop was not requested"); task.status = "interrupted"; if (task.launch) task.launch.phase = "interrupted"; addEvent(task, "system", "stopped", "The agent stopped. Queued requests are saved. This does not undo edits."); }
export function resumeTask(task: Task) {
  if (!["interrupted", "failed", "stopping", "ready"].includes(task.status)) throw new TaskError("This task does not need recovery");
  task.queuePaused = false; task.safe = true; task.launch = null; task.error = undefined;
  // Explicit recovery preserves ids and makes ambiguous work visible for reconciliation.
  for (const i of task.inputs) if (i.state === "dispatched" || i.state === "failed") i.state = "queued";
  task.status = task.currentResult ? "ready" : "draft";
  addEvent(task, "system", "resume", "Resume requested. Reconcile existing edits before applying the saved requests.");
}
// A pause only means something while the task is stopping, interrupted or failed. Anywhere else it
// is a leftover that blocks Looks good, so it is cleared. Returns whether anything changed.
export function normalizePause(task: Task): boolean {
  if (["stopping", "interrupted", "failed"].includes(task.status) || !(task.queuePaused || task.error)) return false;
  task.queuePaused = false; task.error = undefined; return true;
}
export function acceptTask(task: Task, result: string) {
  if (!result || result !== task.currentResult) throw new TaskError("This result is no longer current");
  if (task.status !== "ready" || !task.safe || task.writePhase || task.pendingDecision || task.queuePaused || task.inputs.some((i) => !["applied", "failed"].includes(i.state))) throw new TaskError("Finish the active work and pending decisions before accepting this result");
  task.acceptedResult = result; task.status = "accepted"; addEvent(task, "user", "accept", "Looks good. Result accepted; publishing is separate.");
}
export function taskProjection(task: Task): { filter: "needs-you" | "in-progress" | "completed"; label: string; reason: string; action: string; rank: number } {
  if (task.pendingDecision) return { filter: "needs-you", label: task.pendingDecision.kind === "proposal" ? "Approve plan" : "Your answer needed", reason: task.pendingDecision.text, action: task.pendingDecision.kind === "proposal" ? "Review plan" : "Reply", rank: 0 };
  if (["failed", "interrupted"].includes(task.status)) return { filter: "needs-you", label: task.status === "failed" ? "Needs recovery" : "Work interrupted", reason: task.error || "The update stopped before finishing. Saved results and requests remain available.", action: "Review and resume", rank: 1 };
  if (task.status === "accepted" && task.acceptedResult === task.currentResult) return { filter: "completed", label: "Completed", reason: "You accepted this result. Publishing is separate.", action: "View result", rank: 4 };
  if (task.status === "ready" && !task.inputs.some((i) => ["queued", "received", "dispatched"].includes(i.state))) return { filter: "needs-you", label: "Your feedback needed", reason: "The latest result is ready to review.", action: "Review result", rank: 2 };
  if (!task.project) return { filter: "needs-you", label: "Choose a project", reason: "Your goal is saved. Select or create a named project to continue.", action: "Choose project", rank: 0 };
  const queued = task.inputs.filter((i) => i.state === "queued").length;
  return { filter: "in-progress", label: task.status === "stopping" ? "Stopping" : queued ? "Changes queued" : task.status === "draft" ? "Ready to start" : "In progress", reason: task.status === "stopping" ? "Waiting for confirmed cancellation. Queued requests are paused." : queued ? `${queued} request${queued === 1 ? "" : "s"} saved for the next safe pass.` : task.events.filter((e) => e.role !== "user").at(-1)?.text || "Your goal is saved and ready to start.", action: task.status === "draft" ? "Start" : "Open task", rank: 3 };
}
