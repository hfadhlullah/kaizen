// The board page's only door into the app: check for a newer desktop build and install it,
// say which OS it is on (for the title bar's room), and paint the window buttons for the theme.
// Nothing else of Electron or Node reaches the page.
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("kaizenDesktop", {
  check: () => ipcRenderer.invoke("kz-update-check"),
  install: () => ipcRenderer.invoke("kz-update-install"),
  platform: process.platform,
  titleBar: (dark: boolean) => ipcRenderer.invoke("kz-titlebar", !!dark),
});
