// Ctrl+Alt+D in a focused terminal. xterm's hidden textarea takes pastes, not typed values, so a stand-in field hands each
// chunk to that one terminal as a paste; the session runs as for any field. It works only while the page has focus.
import { toast } from "@lib/core";
import { hasMic, listeningFor, stopDictation, toggleMic, type Field } from "./engine.ts";

const HOT = "terminal";
function termField(box: HTMLTextAreaElement): Field {
  let first = true;
  return {
    value: "",
    selectionStart: 0,
    selectionEnd: 0,
    get isConnected() {
      return box.isConnected;
    },
    focus() {},
    onStart() {
      toast("Listening. Ctrl+Alt+D to stop");
    },
    dispatchEvent() {
      const data = new DataTransfer();
      data.setData("text/plain", (first ? "" : " ") + this.value);
      first = false;
      this.value = "";
      box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      return true;
    },
  };
}
let started = false;
export function startTerminalDictation() {
  if (started) return;
  started = true;
  addEventListener(
    "keydown",
    (e) => {
      if (!e.ctrlKey || !e.altKey || e.key.toLowerCase() !== "d") return;
      e.preventDefault();
      e.stopPropagation();
      // Pressed again while it listens: stop. A session that ended another way (mic refused, terminal closed) leaves nothing to stop.
      if (listeningFor(HOT)) return stopDictation(true);
      const box = document.activeElement as HTMLTextAreaElement | null;
      if (!box?.classList.contains("xterm-helper-textarea")) return toast("Click into a terminal first");
      if (!hasMic()) return toast("Dictation isn't available in this browser");
      const f = termField(box);
      void toggleMic({ id: HOT, target: () => f });
    },
    true,
  );
}
