// The board's status strip: one chip per status on the board with its count (a click filters to it), and the archive.
// No DOM: components/board/status-strip.tsx draws it from the snapshot; the filter and archive it changes are the board store's.
import { ICON, WORD } from "@lib/core";
import type { BoardSnap } from "./board-store.ts";

const ORDER = ["waiting", "running", "stalled", "starting", "idea", "done", "abandoned"] as const;
export type Chip = {
  id: string; // a status, or "__archive"
  icon?: string; // the status mark's name
  label: string;
  title: string;
  on: boolean;
  attn?: boolean; // waiting on you
};
type S = Pick<BoardSnap, "cards" | "allCards" | "archive" | "filter">;
const count = (s: S, st: string) => s.cards.filter((c) => c.status === st).length;
// Running always shows; the others only when something has that status.
export function stripChips(s: S): Chip[] {
  const out: Chip[] = [];
  for (const st of ORDER) {
    const k = count(s, st);
    if (!k && st !== "running") continue;
    out.push({
      id: st,
      icon: ICON[st],
      label: `${k} ${WORD[st]}${st === "idea" && k !== 1 ? "s" : ""}`,
      title: `Show only ${WORD[st]}`,
      on: s.filter === st,
      attn: st === "waiting",
    });
  }
  const nArch = s.allCards.filter((c) => c.archived).length;
  out.push({
    id: "__archive",
    label: s.archive ? "Back to board" : "Archive " + nArch,
    title: `${s.cards.filter((c) => c.kind === "idea").length} tasks · ${s.cards.filter((c) => c.kind === "run").length} runs on the board`,
    on: s.archive,
  });
  return out;
}
// The phone's status button: amber dot while a run waits, accent while a filter or the archive is on.
export const stripDot = (s: S): "on" | "wait" | "" =>
  s.filter || s.archive ? "on" : count(s, "waiting") > 0 ? "wait" : "";
