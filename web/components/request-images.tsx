import { useState } from "react";
import { pictures, type IceItem } from "../lib/icebox/index.ts";

// A request's pictures. They load only when asked: fetching one tells its host the item was opened.
export function RequestImages({ item, card }: { item: IceItem; card?: boolean }) {
  const [open, setOpen] = useState(false),
    n = pictures(item).length;
  if (!n) return null;
  return (
    <details
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="text-sm text-muted-foreground open:flex open:flex-wrap open:gap-1.5"
    >
      <summary className="basis-full cursor-pointer" title={card ? "Loads them from the source's site" : undefined}>
        {card ? `${n} pictures · show` : `Show images (${n}) — loads them from the source's site`}
      </summary>
      {open &&
        Array.from({ length: n }, (_, i) => {
          const src = `/ice-image?dir=${encodeURIComponent(item.dir)}&id=${encodeURIComponent(item.id)}&i=${i}`;
          return (
            <a key={i} href={src} target="_blank" rel="noopener noreferrer">
              <img
                src={src}
                alt=""
                referrerPolicy="no-referrer"
                className="h-[72px] max-w-[120px] rounded-xs border border-border object-cover"
              />
            </a>
          );
        })}
    </details>
  );
}
