// What a run's card, its panel and the task page ask the server to do, one function each, so two places showing the
// same button share one code path. Routes and payloads are the old board's, unchanged.
import { post } from "./api.ts";
import { cardKey, type Card } from "./board.ts";
import { host } from "./host.ts";
import { toast } from "./toast.ts";

export const where = (r: { pty?: unknown }) => (r.pty ? "running in its workspace" : "opened in your terminal");
const via = (r: { agent: { name: string; note?: string } }) => host.agentLine(r.agent);

// A run whose in-card agent ended, or one stalled with no progress, can get its agent back (its conversation, where
// the tool can resume one), in its card.
export const resumable = (c: Card) => c.status === "stalled" || !!(c.pty && !c.pty.alive);
export async function resumeRun(c: Card) {
  host.notify();
  const r = await post("/resume", { dir: c.state, id: c.id });
  if (!r.ok) return false;
  toast("Resumed, " + where(r) + ": " + via(r as any));
  if (r.pty) host.launched(c, r.pty);
  if (host.panelOpenFor(c)) host.reopenPanel(c);
  return true;
}
export async function archiveCard(c: Card, archived: boolean) {
  const r = await post(
    "/archive",
    c.kind === "idea" ? { dir: c.state, text: c.text, archived } : { dir: c.state, id: c.id, archived },
  );
  if (r.ok) toast(archived ? "Archived" : "Restored");
  host.closePanel();
  void host.loadBoard();
}
export async function backToTask(c: Card) {
  const r = await post("/to-task", { dir: c.state, id: c.id });
  if (r.ok) toast("Back in Tasks");
  void host.loadBoard();
}
export { cardKey };
