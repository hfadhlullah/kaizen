// The popup's requests: both reads, killing a terminal, opening one, and the disk cleanup.
import { setResources, useResources } from "./resources-store.ts";

export async function loadResources() {
  try {
    const res = await (await fetch("/resources")).json();
    const h = useResources.getState().history;
    setResources({ res, history: [...h, (res.system.used / res.system.total) * 100].slice(-60) });
  } catch {
    /* board restarting */
  }
}
export async function loadDisk(refresh = false) {
  try {
    setResources({ disk: await (await fetch("/resources/storage" + (refresh ? "?refresh=1" : ""))).json() });
  } catch {
    /* board restarting */
  }
}
export async function killTerminal(key: string) {
  setResources({ confirm: "" });
  const r = await fetch("/pty/kill", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key }),
  }).catch(() => null);
  setResources({ failed: r?.ok ? "" : "Could not kill that terminal." });
  await loadResources();
}
// Cleanup: a new Claude Code in the Home window, starting on the disk-cleanup skill.
export const startCleanup = () =>
  void dispatchEvent(new CustomEvent("kz-home-start", { detail: { agent: "claude", prompt: "/disk-cleanup" } }));
// Open: the board shows that terminal in its workspace; with no board to answer, the page goes there.
export function openTerminal(t: { key: string; dir?: string; ws: string }) {
  setResources({ open: false, confirm: "", failed: "" });
  if (
    dispatchEvent(new CustomEvent("kz-open-term", { cancelable: true, detail: { dir: t.dir, ws: t.ws, key: t.key } }))
  )
    location.href = `/?view=ws&dir=${encodeURIComponent(t.dir ?? "")}&ws=${encodeURIComponent(t.ws)}`;
}
