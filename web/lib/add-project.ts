// The Projects "+" sheet, modelled on Orca's "Add a project": a chooser (existing folder, clone from URL, create new
// project, new workspace), then one form with a way back. Every call is a JSON POST to the board; the server validates
// paths, URLs and refs again. Which sheet is open is this store; components/add-project-dialog.tsx draws it.
import { create } from "zustand";
import { branchSlug } from "./branch.ts";

export type Start = "folder" | "clone" | "create" | "ws";
// dir: the project the + was opened for (preselected in New workspace); start skips the chooser.
export type AddOpts = { dir?: string | null; start?: Start };
export const useAddProject = create<{ open: (AddOpts & { n: number }) | null }>()(() => ({ open: null }));
let opened = 0;
export const openAdd = (o: AddOpts = {}) => useAddProject.setState({ open: { ...o, n: ++opened } });
export const closeAdd = () => useAddProject.setState({ open: null });

export async function call(path: string, body?: object): Promise<{ ok: boolean; d: any }> {
  try {
    const r = await fetch(
      path,
      body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined,
    );
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, d: r.ok ? d : { error: d.error || d.why || "that did not work" } };
  } catch {
    return { ok: false, d: { error: "kaizen is offline" } };
  }
}
const SEP = (p: string) => (p.includes("\\") ? "\\" : "/");
// The folder dialog picked a parent: the project's own folder is the name appended to it.
export const childPath = (parent: string, name: string) => parent.replace(/[\\/]+$/, "") + SEP(parent) + name;
// A project name the server can make a folder of.
export const folderName = (n: string) => !!n && !/[\\/:*?"<>|]/.test(n);
// The branch a new workspace gets: the one typed, else one from its name, else a random one.
export const workspaceBranch = (typed: string, name: string, rand = () => Math.random().toString(36).slice(2, 6)) =>
  typed.trim() || branchSlug(name) || "workspace-" + rand();
export const CURRENT = "__current"; // the base-branch choice when the project has no branches to list
