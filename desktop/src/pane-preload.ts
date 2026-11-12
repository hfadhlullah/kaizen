// Runs inside the Browser tab's <webview>. kaizen's annotator (web/annotate.js) talks to the board
// with postMessage to its parent window; in a webview the page has no parent, so the two
// directions are relayed over the webview's IPC channel instead. Nothing else of Electron reaches the page.
import { contextBridge, ipcRenderer } from "electron";

// Lets annotate.js know a host is listening although window.parent is the window itself.
contextBridge.exposeInMainWorld("__kzHost", true);

// Page -> board: annotate.js marks its messages `out`. The board checks the per-open token.
window.addEventListener("message", (e) => {
  const d = e.data;
  if (e.source === window && d && d.kz === 1 && d.out === 1) ipcRenderer.sendToHost("kz-ann", d);
});
// Board -> page: delivered as a message to the page itself, which annotate.js accepts from "parent".
ipcRenderer.on("kz-ann", (_e, m) => window.postMessage(m, "*"));
