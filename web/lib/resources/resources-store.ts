// The footer resource popup's state: the last /resources and /resources/storage reads, memory over the last minutes (kept in
// this page only), which tiles are open (kept in this browser) and the terminal being asked about killing.
import { create } from "zustand";
import type { Disk, Port, Resources } from "./rules.ts";

const flag = (k: string) => {
  try {
    return localStorage.getItem(k) === "1";
  } catch {
    return false;
  }
};
export const useResources = create<{
  res: Resources | null;
  disk: Disk | null;
  history: number[];
  ports: Port[] | null;
  confirmPort: number; // the port whose Stop awaits Keep or Stop
  open: boolean; // the popup
  memOpen: boolean;
  diskOpen: boolean;
  confirm: string; // the terminal key whose Kill awaits Keep or Kill
  failed: string;
}>()(() => ({
  res: null,
  disk: null,
  history: [],
  ports: null,
  confirmPort: 0,
  open: false,
  memOpen: flag("kz-res-mem"),
  diskOpen: flag("kz-res-disk"),
  confirm: "",
  failed: "",
}));
export const setResources = useResources.setState;
export function foldTile(which: "mem" | "disk") {
  const k = which === "mem" ? "memOpen" : "diskOpen",
    v = !useResources.getState()[k];
  try {
    localStorage.setItem("kz-res-" + which, v ? "1" : "0");
  } catch {}
  useResources.setState({ [k]: v });
}
// The popup closed: a half-answered Kill question and an old failure go with it.
export const setOpen = (open: boolean) => useResources.setState(open ? { open } : { open, confirm: "", confirmPort: 0, failed: "" });
