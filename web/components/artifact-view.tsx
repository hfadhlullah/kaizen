import { useEffect, useRef } from "react";
import { useLiveFrame } from "../lib/hooks/use-live-frame.ts";
import { useSavedText } from "../lib/hooks/use-saved-text.ts";
import { artifactMode, isLive, sizeLabel, type TaskArtifact } from "../lib/task-results.ts";
import { wireZoom } from "../lib/zoom.ts";
import { cn } from "../lib/utils.ts";
import { Button } from "../ui/button.tsx";

const soft = "rounded-md border border-[color:color-mix(in_srgb,var(--line)_40%,transparent)]";
const dim = "px-0 text-muted-foreground";
function LiveView({ href, name }: { href: string; name: string }) {
  const f = useLiveFrame(href);
  return (
    <>
      <p className="text-warning">Live preview — this address can change during later work.</p>
      <iframe
        title={`Live preview of ${name}`}
        src={f.hidden ? undefined : f.src}
        hidden={f.hidden}
        sandbox="allow-forms allow-scripts allow-popups"
        referrerPolicy="no-referrer"
        onLoad={f.loaded}
        onError={f.failed}
        className={cn("block min-h-[360px] w-full flex-1 border-0 bg-background", soft)}
      />
      <p className={dim}>{f.note}</p>
    </>
  );
}
function TextView({ href, name }: { href: string; name: string }) {
  return (
    <pre
      aria-label={name}
      className={cn(
        "min-h-[360px] flex-1 overflow-auto whitespace-pre-wrap break-words bg-background p-3 font-mono text-sm text-foreground",
        soft,
      )}
    >
      {useSavedText(href)}
    </pre>
  );
}
// An image with pinch, wheel, drag and double-click zoom (lib/zoom.ts drives the box and the percentage).
function ImageView({ href, name }: { href: string; name: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => void (box.current && wireZoom(box.current.parentElement!)), [href]);
  return (
    <div
      ref={box}
      aria-label={`${name}. Pinch, scroll or double-click to zoom.`}
      className={cn(
        "tp-zoom relative min-h-80 flex-1 touch-none cursor-zoom-in select-none overflow-hidden bg-[color-mix(in_srgb,var(--dim)_7%,var(--bg))] [&.zoomed]:cursor-grab",
        soft,
      )}
    >
      <img
        className="tp-image absolute inset-0 box-border size-full max-h-none max-w-none origin-top-left object-contain p-4 will-change-transform"
        src={href}
        alt={name}
        loading="lazy"
        draggable={false}
      />
      <div className="absolute bottom-2.5 right-2.5 z-[2] flex gap-0.5 rounded-sm border border-border bg-card p-0.5 shadow-sm">
        {[
          ["out", "Zoom out", "−"],
          ["reset", "Reset zoom", "100%"],
          ["in", "Zoom in", "+"],
        ].map(([k, label, text]) => (
          <button
            key={k}
            type="button"
            aria-label={label}
            {...{ [`data-zoom-${k}`]: "" }}
            className="grid h-7 min-w-7 place-items-center rounded-sm px-1.5 text-[14px] tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
// One saved output (or live link): its name and kind, a Download or Open link button, and the viewer its type
// allows. Only server-issued artifact routes are embedded; active HTML/SVG stay downloads; live addresses are
// labelled mutable.
export function ArtifactView({ artifact: a, selected = false }: { artifact: TaskArtifact; selected?: boolean }) {
  const { mode, href } = artifactMode(a, selected),
    live = isLive(a),
    media = "block max-h-[560px] w-full";
  return (
    <section className="my-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-visible">
      <div className="flex items-center justify-between gap-2 pb-2">
        <span className="min-w-0 break-words text-sm text-muted-foreground">
          {a.name}
          <small className="block text-xs text-muted-foreground">
            {live ? "Live link · mutable" : "Saved file"}
            {a.size != null ? " · " + sizeLabel(a.size) : ""}
          </small>
        </span>
        {href && (
          <Button asChild>
            <a
              href={live ? href : href + (href.includes("?") ? "&" : "?") + "download=1"}
              target="_blank"
              rel="noopener noreferrer"
              {...(live ? {} : { download: "" })}
            >
              {live ? "Open link" : "Download"}
            </a>
          </Button>
        )}
      </div>
      {mode === "missing" && (
        <p className="text-warning">
          {a.missing ? "This saved file is unavailable." : "No preview is available for this output."} Ask for the file
          again or inspect the technical details.
        </p>
      )}
      {mode === "live" && href && <LiveView href={href} name={a.name} />}
      {mode === "image" && href && <ImageView key={href} href={href} name={a.name} />}
      {mode === "video" && (
        <video className={cn(media, soft)} controls preload="metadata" src={href!}>
          Download this video to watch it.
        </video>
      )}
      {mode === "audio" && (
        <audio className={cn(media, soft)} controls preload="metadata" src={href!}>
          Download this audio to listen.
        </audio>
      )}
      {mode === "pdf" && (
        <>
          <iframe
            className={cn("block min-h-[360px] w-full flex-1 border-0 bg-background", soft)}
            src={href!}
            title={a.name}
            sandbox=""
          />
          <p className={dim}>Your browser may need you to download this PDF.</p>
        </>
      )}
      {mode === "text" && <TextView href={href!} name={a.name} />}
      {mode === "download" && (
        <p className={dim}>Download this file to open it. Executable files are kept separate from this task page.</p>
      )}
      {mode === "unavailable" && (
        <p className={dim}>Preview is unavailable for this format. Download to open it in your app.</p>
      )}
    </section>
  );
}
