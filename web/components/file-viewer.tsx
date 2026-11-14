import { closeFile, isImage, useViewer } from "../lib/viewer.ts";
import { Button } from "../ui/button.tsx";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog.tsx";

// A file the board links to, over the board: an image, or any other file in a frame, with a way out to a tab of its own.
export function FileViewer() {
  const file = useViewer((s) => s.file);
  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && closeFile()}>
      {file && (
        <DialogContent
          aria-describedby={undefined}
          className="h-[calc(100dvh-32px)] w-[min(1100px,calc(100vw-32px))] gap-0 overflow-hidden p-0"
        >
          <div className="flex items-center gap-3 border-b border-border px-3 py-2">
            <DialogTitle className="min-w-0 flex-1 truncate text-base font-semibold">{file.name}</DialogTitle>
            <a className="text-primary" href={file.href} target="_blank" rel="noopener">
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
