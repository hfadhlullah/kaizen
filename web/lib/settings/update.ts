// A newer kaizen on npm (or, in the desktop app, on GitHub Releases): what the About bar and the bottom-right card show,
// and the requests behind Check for updates, Update and Install. The server upgrades and starts a board on the new
// version, which replaces this one; the hello with its new boot id reloads the page (board/live.ts).
import { create } from "zustand";
import { ask, post, toast } from "@lib/core";

export type Version = {
  version: string;
  latest?: string;
  update?: boolean;
  behind?: boolean;
  failed?: string;
  notes?: { v: string; text: string }[];
};
type Desk = { check(): Promise<Version>; install(): Promise<{ ok: boolean; opened?: boolean; error?: string }> };
// Inside the desktop app (desktop/src/preload.ts) the version and the update are the app's own; anywhere else,
// kaizen's npm package.
const desk = (): Desk | undefined => (globalThis as { kaizenDesktop?: Desk }).kaizenDesktop;
export const appName = () => (desk() ? "Kaizen" : "kaizen");
export const useUpdate = create<{ ver: Version | null; later: string | null }>()(() => ({
  ver: null,
  later: (() => {
    try {
      return localStorage.getItem("kz-upd-later");
    } catch {
      return null;
    }
  })(),
}));
// A board that is the desktop app's own copy cannot update itself; say where to update it.
export const behindMsg = (v: Version) =>
  `${appName()} ${v.latest} is available. You are running ${v.version}. Update it from the desktop app on your computer.`;
export const upToDate = (v: Version) => (v.behind ? behindMsg(v) : `${appName()} ${v.version} is up to date.`);
export const available = (v: Version | null): v is Version => !!v?.update;
export const getVer = (fresh: boolean): Promise<Version> =>
  desk() ? desk()!.check() : fetch(fresh ? "/version?fresh=1" : "/version").then((r) => r.json());
export const gotVer = (ver: Version) => useUpdate.setState({ ver });
export const checkUpdate = () => getVer(false).then(gotVer, () => {});
// Later silences a version in this browser; the next release asks again.
export function later(v: string) {
  try {
    localStorage.setItem("kz-upd-later", v);
  } catch {}
  useUpdate.setState({ later: v });
}
// What the button says after: "no" (declined or failed: back to its label), "restarting", or "opened" (the desktop
// app opened the download page, since an unsigned macOS build cannot replace itself).
export async function upgrade(v: Version): Promise<"no" | "restarting" | "opened"> {
  const d = desk();
  const q = d
    ? {
        title: `Install Kaizen ${v.latest}?`,
        description: "The app restarts, and agents it runs stop.",
        confirmLabel: "Install",
      }
    : {
        title: `Update kaizen to ${v.latest}?`,
        description: "kaizen restarts, and agents it runs stop.",
        confirmLabel: "Update",
      };
  if (!(await ask(q))) return "no";
  if (d) {
    const r = await d.install().catch((e: unknown) => ({ ok: false, opened: false, error: String(e) }));
    if (r && !r.ok) toast(`Could not install the update: ${r.error}`);
    return r && r.opened ? "opened" : r && r.ok ? "restarting" : "no";
  }
  if (!(await post("/upgrade", {})).ok) return "no";
  setTimeout(() => location.reload(), 20000);
  return "restarting";
}
