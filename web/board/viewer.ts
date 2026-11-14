import { openFile, viewable } from "@lib/run";

// Files the board links to open in a popup over the board (components/run/file-viewer.tsx) rather than a new tab.
// Ctrl/Cmd/Shift or a middle click still gets the browser's own tab; external links are not files and are left alone.
export function initViewer() {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest?.("a[href]");
    const href = a?.getAttribute("href") ?? "";
    // The viewer's own "Open in new tab" goes to its tab; every other link to a file (target _blank or not) opens the viewer.
    if (!viewable(href) || a?.hasAttribute("data-viewer-tab")) return;
    e.preventDefault();
    openFile(href);
  });
}
