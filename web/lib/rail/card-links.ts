// What the board does with a card or a workspace address: its state mark as the side menu would draw it, the address of a
// workspace, the Home workspace's folder, and the projects a workspace can be made in.
import { railDataNow } from "@lib/server";
import { attentionFor } from "./rail-store.ts";
import { projName, stateOf } from "./rules.ts";

// A card's state icon (.si) and the word under its title, with the attention the Tasks read says it has.
export const cardState = (c: any) => stateOf(c, attentionFor(c));
// The floating Home workspace's folder (~/.kaizen/home): never a project's `.kaizen` state dir, and it has no workspace view.
export const isHomeDir = (d: unknown) => typeof d === "string" && /[\\/]\.kaizen[\\/]home$/.test(d);
// A Home terminal's address opens the board with its panel (lib/home/home-events.ts), from any page.
export const wsHref = (dir: string, ws: string) =>
  isHomeDir(dir) ? "/?view=board&homews=1" : `/?view=ws&dir=${encodeURIComponent(dir)}&ws=${encodeURIComponent(ws)}`;
// Projects that are git repositories (the main checkout has a branch): where a workspace can be made.
export const gitProjects = () =>
  railDataNow()
    .projects.filter((p) => p.workspaces?.some((w) => w.branch))
    .map((p) => ({ dir: p.dir as string, name: projName(p.dir, railDataNow().projects) }));
