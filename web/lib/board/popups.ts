// Forms and popups other modules open over the Board or any page: Edit, Abandon or Reject, the run form, and New task.
import { setBoard, closeNewForm } from "./board-store.ts";
import { getServer } from "@lib/server";

// The tool a launch opened, and why when it is not the one asked for.
export const via = (a: { name: string; note?: string }) => a.name + (a.note ? ". " + a.note : "");

// Edit, Abandon or Reject over the page it was asked from: a workspace never leaves for the Board.
export const formPopup = (c: any, mode: any) => setBoard({ popup: { kind: "form", mode, card: c } });
// The run form as a popup over any page: Start in the new-task form and on Tasks.
export const runPopup = (
  c: any,
  onStart?: (p: { kind: string; agent?: string; account?: string; yolo: boolean; explore?: boolean }) => void,
) => setBoard({ popup: { kind: "run", card: c, onStart } });
// New task from the top bar, the empty board or n: the form in a dialog. Opened from another page (Tasks, a
// workspace, the side menu): always the project picker, preset to that page's project or empty so one is chosen.
// The Board keeps its own rule.
export function newTask(from?: { dir: string | null }) {
  const { state, all } = getServer(),
    taskDir = from && "dir" in from ? from.dir : !all ? state.dir : null;
  if (!dispatchEvent(new CustomEvent("kz-new-task", { cancelable: true, detail: { dir: taskDir } }))) return;
  // The header button passes its click event: only an explicit { dir } is another page's call.
  const pick = from && "dir" in from ? from : null;
  closeNewForm();
  setBoard({ popup: { kind: "new", dir: pick?.dir ?? null, choose: !!pick } });
}
