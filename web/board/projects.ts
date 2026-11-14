import { react } from "./views.ts";
import { store } from "./store.ts";
import { load, post } from "./api.ts";
import { newTask, render } from "./cards.ts";
import { $ } from "./dom.ts";
import { toast } from "./toast.ts";
import { openAdd } from "@lib/project";

// The picked project outlives a reload. Saved only where the user changes it, so a
// second tab refreshing cannot undo it; a view the URL asked for is a one-off.
export const urlAll = new URLSearchParams(location.search).has("all");
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
    store.all = true;
    keep();
  } else {
    const j = await post("/cd", { dir: v });
    if (j.ok) {
      store.all = false;
      store.dir = v;
      keep(v);
    }
  }
  await load();
}
export function showable() {
  const l = [...store.S.projects];
  for (const c of store.S.cards) if (!l.some((p) => p.dir === c.state)) l.push({ dir: c.state, label: c.where });
  return l;
}
export function setShown() {
  try {
    localStorage.setItem("kz-show", JSON.stringify([...store.shown]));
  } catch (e) {}
  render();
  // The Icebox narrows by the same picker, so it redraws too.
  dispatchEvent(new Event("kz-shown"));
}

export function initProjects() {
  // The header's pickers are React (components/project/project-bar.tsx), drawn from what cards.ts publishes on every redraw.
  react.mountRunPart($("combo"), "projects");
  react.mountRunPart($("showc"), "showing");
  $("newtop").onclick = newTask;
}
