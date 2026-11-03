// The board page's only door into the app: check for a newer desktop build and
// install it. Nothing else of Electron or Node reaches the page.
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("kaizenDesktop", {
  check: () => ipcRenderer.invoke("kz-update-check"),
  install: () => ipcRenderer.invoke("kz-update-install"),
});
