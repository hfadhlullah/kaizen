// What the side menu's rows do: ask the page to open something, and the worktree menu's requests. Open-in-place goes
// through the page's own events (the board answers them and cancels the event); when nobody does, the address changes.
import { ask, host, toast } from "@lib/core";
import { openAdd, type WsMenuItem } from "@lib/project";
import { getServer } from "@lib/server";
import { togglePin, useRail } from "./rail-store.ts";
import { wsLabel } from "./rules.ts";

// The two buttons the menu only draws: + (add a project) and Search. lib/rail/rail-boot.ts and lib/search/search-rows.ts answer.
export const railActions = { add: () => {}, search: () => {} };

// True when the page opened it in place.
export const handled = (name: string, detail: unknown) =>
  !dispatchEvent(new CustomEvent(name, { cancelable: true, detail }));
export const openTask = (id: string, dir: string) => handled("kz-open-task", { id, dir });
export const openWs = (dir: string, ws: string) => handled("kz-open-ws", { dir, ws });
// An agent's mark: the board opens that terminal tab in its workspace; the notebook page opens the workspace.
export const openTerm = (dir: string, ws: string, key: string) => {
  if (!handled("kz-open-term", { dir, ws, key })) host.navigate(host.wsHref(dir, ws));
};
export const addWorkspace = (dir: string) => openAdd({ dir, start: "ws" });

async function wsOp(dir: string, ws: string, op: "update" | "delete") {
  toast(op === "update" ? "Updating…" : "Deleting…");
  const r = await fetch("/workspace", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dir, ws, op }),
  }).catch(() => null);
  const j = await r?.json().catch(() => ({}));
  toast(r?.ok ? (op === "update" ? j.out || "Updated" : "Deleted") : j?.error || j?.why || "Failed");
}
const copy = (text: string) =>
  navigator.clipboard.writeText(text).then(
    () => toast("Copied"),
    () => toast("Could not copy"),
  );
// The right-click menu on a worktree row: update, copy path, copy name, pin, delete (the main checkout has neither Update nor Delete).
export function wsMenuItems(dir: string, ws: string): WsMenuItem[] {
  const w = getServer()
    .every?.projects.find((p) => p.dir === dir)
    ?.workspaces?.find((x) => x.path === ws);
  if (!w) return [];
  const name = wsLabel(w),
    pinned = useRail.getState().pins.includes(dir + "\0" + ws);
  return [
    ...(w.main ? [] : [{ label: "Update", run: () => void wsOp(dir, ws, "update") }]),
    { label: "Copy path", run: () => void copy(ws) },
    { label: "Copy worktree name", run: () => void copy(name) },
    { label: pinned ? "Unpin" : "Pin", run: () => togglePin(dir, ws) },
    ...(w.main
      ? []
      : [
          {
            label: "Delete",
            run: async () => {
              const yes = await ask({
                title: `Delete worktree "${name}"?`,
                description: `Removes the folder. Refused while it has uncommitted changes. The branch stays.\n\n${ws}`,
                confirmLabel: "Delete",
                danger: true,
              });
              if (yes) void wsOp(dir, ws, "delete");
            },
          },
        ]),
  ];
}
export const saveOrder = (dirs: string[]) => {
  const fail = () => toast("Could not save the project order");
  void fetch("/projects/order", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dirs }),
  }).then((r) => !r.ok && fail(), fail);
};
