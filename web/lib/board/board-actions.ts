// What the Board's forms and menus ask the server to do. Routes and payloads are the old board's (cards.ts):
// /inbox, /note, /backlog, /abort, /run, /archive and GET /agents. Components call these; nothing here draws.
import { post, cardKey, type Card, host, toast } from "@lib/core";
import { getBoard, setBoard, type RunPick } from "./board-store.ts";
import { where } from "@lib/run";

export type AgentChoice = {
  cmd: string;
  name: string;
  yolo?: boolean;
  accounts?: { id: string; name: string }[];
  defaultAccount?: string;
};
export type Agents = { agents: AgentChoice[]; default?: string; explore?: boolean };
// The agents a project can run with. Antigravity and Gemini CLI are both Google's agent on Gemini; offer one of them.
export async function loadAgents(dir: string): Promise<Agents | null> {
  const d: Agents | null = await fetch("/agents?dir=" + encodeURIComponent(dir))
    .then((r) => r.json())
    .catch(() => null);
  if (!d?.agents?.length) return null;
  if (d.agents.some((a) => a.cmd === "agy")) d.agents = d.agents.filter((a) => a.cmd !== "gemini");
  return d;
}

// The Run form's choice, kept here and not in the form so it outlives a redraw; Yolo never outlives its form.
export async function startRun(c: Card, kind: "full" | "lite", pick: RunPick | null) {
  host.notify();
  const yolo = !!pick?.yolo,
    backlog = c.kind === "backlog" ? { source: c.source, n: c.n } : undefined;
  const r = await post("/run", {
    dir: c.state,
    text: c.text,
    backlog,
    kind,
    agent: pick?.agent,
    account: pick?.account,
    explore: pick?.explore,
    yolo,
  });
  if (r.ok) {
    toast(
      (kind === "full" ? "Full" : "Lite") + (yolo ? " yolo" : "") + " run " + where(r) + ": " + host.agentLine(r.agent),
    );
    // A backlog card has no terminal of its own; the run's card gets it once the run exists.
    if (r.pty && !backlog) host.launched(c, r.pty);
    // A task's run opens in its workspace; the view follows it once the run card exists.
    if (!backlog) host.openWorkspace(c);
  }
  void host.loadBoard();
}

export async function saveEdit(c: Card, next: string, notes: string, files: File[]) {
  if (!next) return false;
  if (next !== c.text || notes !== (c.notes || "")) {
    const r = await post("/inbox", { op: "edit", dir: c.state, text: c.text, next, notes });
    if (!r.ok) return false;
  }
  if (files.length) {
    const r = await post("/note", { dir: c.state, for: next, text: "", files: await host.dataUrls(files) });
    if (!r.ok) toast("Task saved, files not attached");
  }
  void host.loadBoard();
  return true;
}
export async function rejectCard(c: Card, why: string) {
  const task = c.kind !== "run",
    r =
      c.kind === "backlog"
        ? await post("/backlog", { op: "reject", dir: c.state, source: c.source, n: c.n, reason: why })
        : task
          ? await post("/inbox", { op: "reject", dir: c.state, text: c.text, reason: why })
          : await post("/abort", { dir: c.state, id: c.id, why });
  if (r.ok) toast(task ? "Rejected" : "Abandoned, reason recorded");
  void host.loadBoard();
}
export async function deleteTask(c: Card) {
  const r = await post("/inbox", { op: "delete", dir: c.state, text: c.text });
  if (r.ok) toast("Deleted");
  void host.loadBoard();
}
export async function moveTask(c: Card, to: string, name: string) {
  const r = await post("/inbox", { op: "move", dir: c.state, to, text: c.text });
  if (r.ok) toast(`Moved to ${name}`);
  void host.loadBoard();
}
// Add a task (in `dir`, or the board's own project when null); with `run`, its Run form opens on the new card.
export async function addTask(text: string, notes: string, dir: string | null, files: File[], run: boolean) {
  const r = await post("/inbox", dir ? { op: "add", dir, text, notes } : { op: "add", text, notes });
  if (r.ok) {
    toast("Task added");
    // The task exists first: a failed upload leaves it as plain text.
    if (files.length) {
      const n = await post("/note", { dir, for: text, text: "", files: await host.dataUrls(files) });
      if (!n.ok) toast("Task added, files not attached");
    }
    if (run) {
      await host.loadBoard();
      const c = getBoard().snap?.allCards.find(
        (x) => x.kind === "idea" && x.text === text && (!dir || x.state === dir),
      );
      if (c) return setBoard({ popup: { kind: "run", card: c } });
    }
  }
  void host.loadBoard();
}
export async function archiveMany(set: Card[]) {
  for (const c of set) await post("/archive", { dir: c.state, id: c.id });
  toast("Archived " + set.length);
  void host.loadBoard();
}
// The projects a new task can go to: the ones being shown, else every one.
export const taskDirs = () => {
  const sp = host.showable(),
    pick = sp.filter((p) => host.shown().has(p.dir));
  return pick.length ? pick : sp;
};
export { cardKey };
