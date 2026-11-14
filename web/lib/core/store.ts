// The Tasks pages' shared state (Zustand). Server data lives here, fed by lib/hooks; what only one
// component cares about (an open popup, a hovered row) stays in that component.
import { create } from "zustand";
import type { TaskPageData, TaskView } from "@lib/task";

export type Store = {
  // The Tasks list.
  tasks: TaskView[];
  tasksLoaded: boolean;
  tasksError: string;
  filter: string;
  query: string; // the board's top search box, docked into the list
  scope: string; // the project dir the list is limited to; "" is every project
  // The open task.
  taskId: string;
  taskDir: string;
  page: TaskPageData | null;
  pageError: "" | "missing" | "offline" | string;
  pending: boolean; // an action is on its way: one at a time
  receipt: string;
  draft: string; // the composer's text, kept per task in sessionStorage
};
export const useStore = create<Store>()(() => ({
  tasks: [],
  tasksLoaded: false,
  tasksError: "",
  filter: "all",
  query: "",
  scope: "",
  taskId: "",
  taskDir: "",
  page: null,
  pageError: "",
  pending: false,
  receipt: "",
  draft: "",
}));
export const getStore = useStore.getState;
export const setStore = useStore.setState;
