import { useEffect, useMemo, useState } from "react";
import { MarkdownBlocks } from "@components/markdown";
import { toast } from "@lib/core";
import { parse } from "@lib/markdown";
import {
  loadPreview,
  loopbackUrl,
  onLoopback,
  openAppWindow,
  run,
  shotName,
  splitShots,
  useLayout,
  type PreviewData,
} from "@lib/run";
import { Button, Icon } from "@web/ui";

// The report: the run's `## Preview` as text, its screenshots as a grid after it (each opens the image viewer on click),
// and, when it names a localhost address, a bar with that address and a button to open it in an app window.
function Report({ url, text }: { url?: string; text: string | null }) {
  const { blocks, shots } = useMemo(() => splitShots(text ? parse(text) : []), [text]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {url && (
        <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-sm select-text">{url}</span>
          {onLoopback() && loopbackUrl(url) && (
            <Button
              size="sm"
              variant="ghost"
              title="Open in an app window"
              onClick={() => void openAppWindow(url).then((why) => why && toast(why))}
            >
              <Icon name="popout" className="size-[15px]" />
              <span>Open in app window</span>
            </Button>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {text ? (
          <MarkdownBlocks blocks={blocks} />
        ) : (
          <p className="text-muted-foreground">This run has no Preview yet.</p>
        )}
        {shots.length > 0 && (
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {shots.map((s, n) => (
              <figure key={n} className="overflow-hidden rounded-xs border border-border bg-card">
                <a href={s.src} target="_blank" rel="noopener noreferrer">
                  <img src={s.src} alt={s.alt} className="block h-[180px] w-full object-cover object-top" />
                </a>
                <figcaption className="truncate px-2.5 py-1.5 text-sm text-muted-foreground">{shotName(s)}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// The Preview tab. It reads what it shows when it opens, and again when a screenshot is written for the workspace
// (the layout store's `previewTick`); the old picture stays up until the new one is ready.
export function PreviewPane() {
  const tick = useLayout((s) => s.previewTick),
    [data, setData] = useState<PreviewData | null>(null);
  useEffect(() => {
    const t = run.act.previewTarget();
    if (!t) return;
    let gone = false;
    void loadPreview(t).then((d) => !gone && setData(d));
    return () => {
      gone = true;
    };
  }, [tick]);
  if (!data) return null;
  if (data.kind === "frame")
    return <iframe className="min-h-0 w-full flex-1 border-0 bg-card" title="Preview" src={data.src} />;
  if (data.kind === "image")
    return (
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <figure>
          <img src={data.src} alt="Latest change" className="max-w-full rounded-xs" />
          <figcaption className="mt-1.5 text-sm text-muted-foreground">{data.name}</figcaption>
        </figure>
      </div>
    );
  return <Report url={data.url} text={data.text} />;
}
