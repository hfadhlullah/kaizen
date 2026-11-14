// What the page shell shows for a board view: the side menu item that is lit and the title in the header.
// views.ts go() hands the final view over (shell-store.ts setView); a phone's run workspace belongs to its Runs tab.
export const litItem = (view: string, phone: boolean) =>
  view === "task" ? (phone ? "device" : "tasks") : view === "run" && phone ? "device" : view;

const TITLES: Record<string, string> = {
  sources: "Icebox",
  tasks: "Tasks",
  task: "Task",
  run: "Run",
  terminal: "Terminal",
  chat: "Chat",
  device: "Runs",
};
// Home reads Chat on a computer and shows the wordmark on a phone (the header's title is the logo there).
export const viewTitle = (view: string, phone: boolean) =>
  view === "home" ? (phone ? "kaizen" : "Chat") : (TITLES[view] ?? "Board");
