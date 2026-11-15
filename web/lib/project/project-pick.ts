import { post, toast } from "@lib/core";
import { load, setServer } from "@lib/server";
import { openAdd } from "./add-project.ts";

// The picked project outlives a reload. Saved only where the user changes it, so a
// second tab refreshing cannot undo it; a view the URL asked for is a one-off. Read once, as the page opened: a deep link
// that later rewrites the address to ?all=1 (a note's ?run=) does not make the person's own pick a one-off.
export const urlAll = typeof location !== "undefined" && new URLSearchParams(location.search).has("all");
export function keep(d) {
  if (urlAll) return;
  try {
    d ? localStorage.setItem("kz-proj", d) : localStorage.removeItem("kz-proj");
  } catch (e) {}
}
export async function pick(v) {
  if (v === "__find") {
    toast("Searching…");
    const j = await post("/find", {});
    if (j.ok) toast(j.added ? `Found ${j.added} new project${j.added === 1 ? "" : "s"}` : "No new projects found");
  } else if (v === "__new" || v === "__clone") {
    // The same sheet as the side menu's +; it adds the project and reloads onto it.
    openAdd({ start: v === "__new" ? "create" : "clone" });
    return;
  } else if (v === "all") {
    setServer({ all: true });
    keep();
  } else {
    const j = await post("/cd", { dir: v });
    if (j.ok) {
      setServer({ all: false });
      setServer({ dir: v });
      keep(v);
    }
  }
  await load();
}
