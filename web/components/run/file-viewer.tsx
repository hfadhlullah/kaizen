import { useEffect } from "react";
import { closeFile, isImage, openFile, useViewer, viewable } from "@lib/run";
import { Button, Dialog, DialogContent, DialogTitle } from "@web/ui";

// A file the board links to, over the board: an image, or any other file in a frame, with a way out to a tab of its own.
// Links to files open here rather than in a new tab; Ctrl/Cmd/Shift or a middle click still gets the browser's own tab,
// and external links are not files and are left alone.
export function FileViewer() {
  const file = useViewer((s) => s.file);
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest?.("a[href]");
      const href = a?.getAttribute("href") ?? "";
      // The viewer's own "Open in new tab" goes to its tab; every other link to a file (target _blank or not) opens the viewer.
      if (!viewable(href) || a?.hasAttribute("data-viewer-tab")) return;
      e.preventDefault();
      openFile(href);
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, []);
  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && closeFile()}>
      {file && (
        <DialogContent
          aria-describedby={undefined}
          className="h-[calc(100dvh-32px)] w-[min(1100px,calc(100vw-32px))] gap-0 overflow-hidden p-0"
        >
          <div className="flex items-center gap-3 border-b border-border px-3 py-2">
            <DialogTitle className="min-w-0 flex-1 truncate text-base font-semibold">{file.name}</DialogTitle>
            <a className="text-primary" href={file.href} target="_blank" rel="noopener" data-viewer-tab>
              Open in new tab
            </a>
            <Button size="sm" onClick={closeFile}>
              Close
            </Button>
          </div>
          {isImage(file.href, file.name) ? (
            <img
              src={file.href}
              alt={file.name}
              referrerPolicy="no-referrer"
              className="min-h-0 w-full flex-1 object-contain"
            />
          ) : (
            <iframe src={file.href} title={file.name} className="w-full flex-1 border-0 bg-white" />
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}
