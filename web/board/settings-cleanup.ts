import { post } from "./api.ts";
import { $, html } from "./dom.ts";
import { toast } from "./toast.ts";

// Settings → General → Storage: the two halves of `kaizen prune`, one button each, so
// clearing dead launch records never takes run history with it.
export type Cleanup = { project: string | null; keep: number; records: { abandoned: number; unowned: number; gone: number }; runs: number; rescued: number };

const total = (d: Cleanup) => d.records.abandoned + d.records.unowned + d.records.gone;
const btn = (id: string, text: string, n: number) => html`<button type="button" class="btn" id="${id}"${n ? "" : " disabled"}>${text}</button>`;

export const cleanupRows = (d: Cleanup) => [
  {
    label: "Clean launch records",
    control: btn("s-clean-records", "Clean up", total(d)),
    hint: `${total(d)} older than a week: ${d.records.abandoned} abandoned · ${d.records.unowned} unowned · ${d.records.gone} run gone`,
    id: "s-clean-records",
    q: "cleanup clean launch records sessions prune",
  },
  {
    label: "Delete old runs",
    control: btn("s-clean-runs", "Delete", d.runs),
    hint: `${d.runs} finished runs beyond the newest ${d.keep}${d.rescued ? `; ${d.rescued} open backlog items move to backlog.md` : ""}`,
    id: "s-clean-runs",
    q: "cleanup delete old runs prune history",
  },
];

export function wireCleanup(d: Cleanup, redraw: () => Promise<unknown>) {
  const where = d.project ? ` in ${d.project}` : "";
  const go = (id: string, what: string, ask: string) => {
    const b = $(id);
    if (b) b.onclick = async () => {
      if (!confirm(ask)) return;
      const j = await post("/cleanup", { what });
      toast(j.error ?? `Removed ${j.removed}`);
      await redraw();
    };
  };
  go("s-clean-records", "records", `Delete ${total(d)} launch records${where}?`);
  go("s-clean-runs", "runs", `Permanently delete ${d.runs} finished runs${where}? Their plans, reviews and reports go, and this cannot be undone.`);
}
