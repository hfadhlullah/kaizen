// The side menu's start-up on every page (board, notebook, video): the live reads that feed its counts and marks (lib/server),
// the add-project sheet, the Search link and the board's footer height. The list itself is React (components/rail, data in the
// server store). Stands alone, so the notebook and video bundles can carry it without the board.
import { $ } from "./dom.ts";
import { openAdd, type AddOpts } from "@lib/project/add-project.ts";
import { cardHref as ruleCardHref, titleOf as ruleTitleOf, projName as ruleProjName, RANK as RULE_RANK, stateOf as ruleStateOf, wsLabel as ruleWsLabel, wsOfCard as ruleWsOfCard } from "@lib/rail/rules.ts";
import { startFooter } from "@lib/footer/footer-store.ts";
import { attentionFor } from "@lib/rail/rail-store.ts";
import { railDataNow, startRailFeed } from "@lib/server";
import { initSearch, leave } from "./search.ts";
import { setToaster, toast } from "./toast.ts";
import { kitHere, loadKit } from "../notebook/kit-loader.ts";

// A card's state icon (.si) and the word under its title.
export const stateOf = (c) => ruleStateOf(c, attentionFor(c));
export const titleOf = ruleTitleOf;
export const projName = ruleProjName;
export const cardHref = ruleCardHref;

// Projects that are git repositories (the main checkout has a branch): where a workspace can be made.
export const gitProjects = () =>
  railDataNow().projects.filter((p) => p.workspaces?.some((w) => w.branch)).map((p) => ({ dir: p.dir as string, name: projName(p.dir, railDataNow().projects) }));
// The Projects list, the sheet and the right-click menu are React. The board's App draws them; the Notebook page does the
// same in its own bundle (notebook/kit.ts, registered as window.kzKit) and opens them in place. On Video, which has no kit,
// the + button sends the person to the board with the sheet asked for (?add=), as Search does, and Video lists no projects.
const onBoard = () => !!document.getElementById("kz-portal");
// The kit for this page, with what only this page knows handed over: where a new workspace opens, the Projects list, and
// a way to leave that writes the open note first. The toast and question of the old code then show through the kit too.
export async function kitFor() {
  const k = await loadKit();
  setToaster(k.toast);
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
  if (onBoard()) return openAdd(o);
  const q = new URLSearchParams({ view: "board", add: o.start ?? "1" });
  if (o.dir) q.set("adddir", o.dir);
  kitFor().then((k) => k.openAdd(o), () => leave("/?" + q));
}
// Arriving from the notebook or Video with the sheet asked for.
function openAsked() {
  const q = new URLSearchParams(location.search),
    add = q.get("add");
  if (!add || !onBoard()) return;
  const dir = q.get("adddir");
  q.delete("add");
  q.delete("adddir");
  history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
  setTimeout(() => openAdd({ dir, ...(add === "ws" || add === "folder" || add === "clone" || add === "create" ? { start: add } : {}) }), 400);
}
// A card's workspace row (lib/rail/rules.ts), by the projects the last refresh listed.
export const wsOfCard = (c, projects = railDataNow().projects) => ruleWsOfCard(c, projects);
// The floating Home workspace's folder (~/.kaizen/home): never a project's `.kaizen` state dir, and it has no workspace view.
export const isHomeDir = (d: unknown) => typeof d === "string" && /[\\/]\.kaizen[\\/]home$/.test(d);
// A Home terminal's address opens the board with its panel (web/board/home-ws.ts), from any page.
export const wsHref = (dir, ws) => (isHomeDir(dir) ? "/?view=board&homews=1" : `/?view=ws&dir=${encodeURIComponent(dir)}&ws=${encodeURIComponent(ws)}`);
export const RANK = RULE_RANK;
export const wsLabel = ruleWsLabel;
// Rows are redrawn on every refresh, which restarts a CSS animation from 0deg: the state
// icons jumped back mid-turn. Pinning each to the page clock's origin keeps them in phase
// (the si-* animations have no delay for this to cancel).
const syncSpin = () =>
  document.getAnimations().forEach((a: any) => {
    if (a.animationName?.startsWith("si-") && a.startTime !== 0) a.startTime = 0;
  });
export function initRail() {
  initSearch();
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
  if (!$("plist")) return;
  startRailFeed(!!$("foot"));
  // The Notebook's popups (the add-project sheet, the worktree menu) take what only this page knows through the kit.
  if (!onBoard() && kitHere()) void kitFor().catch(() => {});
  // The sheet: add a folder, clone, create, or start a workspace; the current project is preselected.
  openAsked();
  $("padd").onclick = () => {
    const p = new URLSearchParams(location.search);
    addProject({ dir: ["run", "ws"].includes(p.get("view")) ? p.get("dir") : pickedDir() });
  };
}
// The one project the Projects filter is narrowed to (it keeps its choice in this browser; lib/rail/rail-store.ts).
function pickedDir() {
  try {
    const d = JSON.parse(localStorage.getItem("kz-rail-filter2") || "{}").dirs;
    return Array.isArray(d) && d.length === 1 ? (d[0] as string) : null;
  } catch {
    return null;
  }
}

// ---- footer (board page): components/footer draws it from lib/footer and the server store.
export function initFooter() {
  if (!$("foot")) return;
  // The Board drawer is position:fixed; it stops above the footer, whose height varies.
  const fh = () => document.documentElement.style.setProperty("--foot-h", $("foot").offsetHeight + "px");
  new ResizeObserver(fh).observe($("foot"));
  fh();
  startFooter();
}
