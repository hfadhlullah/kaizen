import type { WsCard as Ws } from "../../lib/board/index.ts";
import { ProjectMark } from "../shared/index.ts";

// A workspace on the Board's Workspaces mode: its status dot, branch or name, project and what its newest run says.
// Pressing it opens the workspace in place (`kz-open-ws`, which the board answers); a modified click keeps the link.
// The dot is the sidebar's `.si` (conic rings and spin keyframes) until the rail moves over.
export function WsCard({ w }: { w: Ws }) {
  return (
    <a
      href={w.href}
      data-dir={w.dir}
      data-ws={w.path}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
        if (!dispatchEvent(new CustomEvent("kz-open-ws", { cancelable: true, detail: { dir: w.dir, ws: w.path } })))
          e.preventDefault();
      }}
      className="flex min-h-(--row-h) items-start gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-foreground hover:bg-muted focus-visible:-outline-offset-2"
    >
      <span className={`si mt-[3px] ${w.state}`} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <b className="flex min-w-0 items-center gap-1.5 truncate text-base font-medium">
          {w.label}
          {w.main && (
            <i className="rounded-xs border border-border px-1.5 text-xs font-normal not-italic text-muted-foreground">
              primary
            </i>
          )}
        </b>
        <small className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ProjectMark dir={w.dir} label={w.project} size={14} />
          {w.project}
        </small>
        <code className="truncate font-[inherit] text-sm text-muted-foreground">{w.line}</code>
      </span>
    </a>
  );
}
