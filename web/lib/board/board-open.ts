// Opening a card from the Board: a backlog item opens its source run on the Backlog tab with the item marked, anything
// else opens its run workspace or task panel.
import type { Card } from "../core/index.ts";
import { getBoard } from "./board-store.ts";
import { host, toast } from "../core/index.ts";

export function showCard(c: Card) {
  if (c.kind !== "backlog") return host.openCard(c);
  const r = getBoard().snap?.allCards.find((x) => x.kind === "run" && x.id === c.source && x.state === c.state);
  if (!r) return toast(c.source === "orphan" ? "Kept from a run that was pruned" : "That run was not found");
  host.openCard(r, "backlog", c.n);
}
