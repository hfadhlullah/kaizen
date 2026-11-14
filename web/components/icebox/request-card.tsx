import {
  ago,
  hostOf,
  hue,
  iceKey,
  isLive,
  short,
  srcName,
  webUrl,
  type IceItem,
  type RowCtx,
  setIce,
  openCard,
} from "@lib/icebox";
import { cn } from "@lib/core";
import { KindLabel } from "./kind-label.tsx";
import { ProjectMark } from "@components/shared";
import { RequestActions } from "./request-actions.tsx";
import { RequestBadges } from "./request-badges.tsx";
import { RequestImages } from "./request-images.tsx";

// A card: what it is, the words, where it sits, how old. A link leads with its title and summary, coloured from the
// site's name; nothing is fetched from the site to draw it. Opening it shows it in the Sort list.
export function RequestCard({ item, ctx }: { item: IceItem; ctx: RowCtx }) {
  const k = iceKey(item),
    cur = ctx.cur === k,
    lk = item.link && /^https?:\/\//i.test(item.link.url) ? item.link : null,
    site = lk ? hostOf(lk.url).replace(/^www\./, "") : "";
  return (
    <article
      data-cur={cur || undefined}
      data-key={k}
      onFocusCapture={() => !cur && setIce({ cur: k })}
      className="group/card relative mb-3 flex break-inside-avoid flex-col rounded-lg border border-[color:color-mix(in_srgb,var(--line)_80%,transparent)] bg-card shadow-sm hover:border-border hover:shadow-md data-[cur]:border-border data-[cur]:shadow-md data-[cur]:outline data-[cur]:outline-1 data-[cur]:outline-border"
    >
      {lk && (
        <a
          href={webUrl(lk.url)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ "--h": hue(site) } as React.CSSProperties}
          className="group/lk flex min-h-[88px] flex-col justify-end gap-[3px] rounded-t-lg bg-[hsl(var(--h)_42%_40%)] px-3 pb-2.5 pt-3.5 text-white"
        >
          <b className="break-words text-base leading-[1.35] group-hover/lk:underline">{lk.title || site}</b>
          {lk.summary && <span className="line-clamp-2 text-sm leading-[1.4] opacity-90">{lk.summary}</span>}
          <small className="text-xs opacity-85">{site}</small>
        </a>
      )}
      <div className="flex flex-col gap-2 px-3 pb-2.5 pt-3">
        <div className="flex min-h-4 items-center gap-2">
          <KindLabel kind={item.kind} />
          {item.sorted === "rules" && isLive(item) && (
            <span className="text-xs italic text-muted-foreground" title="Kind set by a rule: pick one with Kind">
              unsorted
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-2.5 text-xs text-muted-foreground">
            <RequestBadges item={item} />
          </span>
        </div>
        <button
          type="button"
          data-title
          title="Open in the Sort list"
          onClick={() => openCard(item)}
          className="line-clamp-6 cursor-pointer whitespace-pre-line break-words bg-transparent text-left text-[14px] leading-[1.45] text-foreground hover:underline hover:decoration-border hover:underline-offset-[3px]"
        >
          {item.text}
        </button>
        <RequestImages item={item} card />
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          {item.board && <span className="text-foreground">{item.board}</span>}
          {(item.tags || []).map((t) => (
            <span key={t} className="rounded-xs bg-muted px-1.5 text-xs leading-[18px]">
              #{t}
            </span>
          ))}
          {ctx.many && (
            <span className="inline-flex items-center gap-1.5" title={item.project || ""}>
              <ProjectMark dir={item.dir} label={item.project || ""} size={14} />
              {short(item.project || "")}
            </span>
          )}
          <span className="flex-1" />
          <span className="whitespace-nowrap tabular-nums">
            {item.source !== "manual" ? `${srcName(ctx.list, item)} · ` : ""}
            {ago(item.at)}
          </span>
        </div>
      </div>
      <RequestActions
        item={item}
        boards={ctx.boards}
        variant="card"
        className="hidden border-t border-[color:color-mix(in_srgb,var(--line)_50%,transparent)] px-1.5 pb-1.5 pt-1 group-focus-within/card:flex group-hover/card:flex group-data-[cur]/card:flex [@media(hover:none)]:flex"
      />
    </article>
  );
}
