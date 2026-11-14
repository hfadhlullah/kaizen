// The side menu's start-up on every page (board, notebook, video): the live reads that feed its counts and marks (lib/server),
// the add-project sheet, the Search link and the animation phase of its state icons. The list itself is React (components/rail, data in the
// server store). Stands alone, so the notebook and video bundles can carry it without the board.
import { openAdd, type AddOpts } from "@lib/project/add-project.ts";
import { startRailFeed } from "@lib/server";
import { gitProjects, wsHref } from "./card-links.ts";
import { initSearch, leave } from "@lib/search/search-rows.ts";
import { kitHere, loadKit } from "@lib/notebook/kit-loader.ts";
import { railActions } from "./rail-actions.ts";

// The Projects list, the sheet and the right-click menu are React. The board's App draws them; the Notebook page does the
// same in its own bundle (notebook/kit.ts, registered as window.kzKit) and opens them in place. On Video, which has no kit,
// the + button sends the person to the board with the sheet asked for (?add=), as Search does, and Video lists no projects.
// Set by the board's own start: the Notebook and Video are not the board.
let onBoard = false;
// The kit for this page, with what only this page knows handed over: where a new workspace opens, the Projects list, and
// a way to leave that writes the open note first. The toast and question of the old code then show through the kit too.
export async function kitFor() {
  const k = await loadKit();
  k.setHost({
    gitProjects,
    wsHref,
    navigate: leave,
    // The Notebook keeps its own project choice: pick it for the board too, then reload onto it.
    pickProject: async (dir: string) => {
      await fetch("/cd", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dir }) }).catch(() => null);
      try {
        localStorage.setItem("kz-proj", dir);
      } catch {}
      leave("/notebook?dir=" + encodeURIComponent(dir));
    },
  });
  return k;
}
function addProject(o: AddOpts) {
  if (onBoard) return openAdd(o);
  const q = new URLSearchParams({ view: "board", add: o.start ?? "1" });
  if (o.dir) q.set("adddir", o.dir);
  kitFor().then((k) => k.openAdd(o), () => leave("/?" + q));
}
// Arriving from the notebook or Video with the sheet asked for.
function openAsked() {
  const q = new URLSearchParams(location.search),
    add = q.get("add");
  if (!add || !onBoard) return;
  const dir = q.get("adddir");
  q.delete("add");
  q.delete("adddir");
  history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
  setTimeout(() => openAdd({ dir, ...(add === "ws" || add === "folder" || add === "clone" || add === "create" ? { start: add } : {}) }), 400);
}
// Rows are redrawn on every refresh, which restarts a CSS animation from 0deg: the state
// icons jumped back mid-turn. Pinning each to the page clock's origin keeps them in phase
// (the si-* animations have no delay for this to cancel).
const syncSpin = () =>
  document.getAnimations().forEach((a: any) => {
    if (a.animationName?.startsWith("si-") && a.startTime !== 0) a.startTime = 0;
  });
export function initRail(o: { board?: boolean; video?: { add: HTMLElement | null; search: HTMLElement | null } } = {}) {
  onBoard = !!o.board;
  initSearch(onBoard);
  let queued = false;
  const hasSi = (n: any) => n.nodeType === 1 && (n.classList.contains("si") || n.querySelector(".si"));
  new MutationObserver((rs) => {
    if (queued || !rs.some((r) => [...r.addedNodes].some(hasSi))) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      syncSpin();
    });
  }).observe(document.body, { childList: true, subtree: true });
  startRailFeed(onBoard);
  // The Notebook's popups (the add-project sheet, the worktree menu) take what only this page knows through the kit.
  if (!onBoard && kitHere()) void kitFor().catch(() => {});
  // The sheet: add a folder, clone, create, or start a workspace; the current project is preselected.
  openAsked();
  // Video's menu is static HTML, not the React Rail: its two buttons are handed over by the page.
  if (o.video) {
    if (o.video.add) o.video.add.onclick = railActions.add;
    if (o.video.search) o.video.search.onclick = (e) => (e.preventDefault(), railActions.search());
  }
}
// The + button: add a folder, clone, create, or start a workspace.
railActions.add = () => {
  const p = new URLSearchParams(location.search);
  addProject({ dir: ["run", "ws"].includes(p.get("view") ?? "") ? p.get("dir") : pickedDir() });
};
// The one project the Projects filter is narrowed to (it keeps its choice in this browser; lib/rail/rail-store.ts).
function pickedDir() {
  try {
    const d = JSON.parse(localStorage.getItem("kz-rail-filter2") || "{}").dirs;
    return Array.isArray(d) && d.length === 1 ? (d[0] as string) : null;
  } catch {
    return null;
  }
}
