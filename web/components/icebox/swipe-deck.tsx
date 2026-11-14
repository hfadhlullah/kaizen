import { useEffect, useMemo } from "react";
import {
  ago,
  iceKey,
  srcName,
  srcOf,
  webUrl,
  type IceItem,
  type Source,
  exitSwipe,
  streak,
  swGo,
  swUndo,
  setIce,
  useIce,
  type Swipe,
  flyCard,
  useCardDrag,
  short,
} from "../../lib/icebox/index.ts";
import { host, cn } from "../../lib/core/index.ts";
import { Button, Icon } from "@web/ui";
import { Favicon } from "./favicon.tsx";
import { ProjectMark } from "../shared/index.ts";
import { RequestImages } from "./request-images.tsx";

const stamp =
  "pointer-events-none absolute top-[18px] rounded-sm border-[3px] px-3 py-1 text-[20px] font-bold uppercase tracking-[.06em]";
// The one that is up: its source and project, the words, and PROMOTE/DISMISS stamps that fade in as it is dragged.
function TopCard({ item, list, projectName }: { item: IceItem; list: Source[]; projectName: string }) {
  const drag = useCardDrag((op) => void swGo(op, (d) => flyCard(drag.ref.current, d)));
  return (
    <div
      ref={drag.ref}
      id="sw-card"
      tabIndex={-1}
      aria-label="Request: swipe or press → to promote, ← to dismiss"
      onPointerDown={drag.onPointerDown}
      className="relative col-start-1 row-start-1 flex cursor-grab touch-pan-y select-none flex-col gap-3.5 overflow-auto rounded-lg border border-border bg-card p-6 shadow-md focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-[drag]:cursor-grabbing data-[lift]:fixed data-[lift]:z-[95] data-[lift]:m-0"
    >
      <Head item={item} list={list} projectName={projectName} />
      <p className="whitespace-pre-wrap break-words text-[20px] leading-normal font-medium text-strong max-sm:text-[18px]">
        {item.text}
      </p>
      {item.notes && (
        <div className="whitespace-pre-wrap break-words text-[14px] leading-[1.65] text-muted-foreground max-sm:text-[16px]">
          {item.notes}
        </div>
      )}
      <RequestImages item={item} />
      {item.post && (
        <a className="text-sm text-muted-foreground underline" href={webUrl(item.post)} target="_blank" rel="noopener">
          open post
        </a>
      )}
      <span className={cn(stamp, "left-[18px] -rotate-12 text-success opacity-[max(0,var(--p,0))]")}>Promote</span>
      <span className={cn(stamp, "right-[18px] rotate-12 text-danger opacity-[max(0,calc(-1*var(--p,0)))]")}>
        Dismiss
      </span>
    </div>
  );
}
function Head({ item, list, projectName }: { item: IceItem; list: Source[]; projectName: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Favicon url={item.source} social={srcOf(list, item)?.social} />
      <span className="min-w-0 truncate" title={srcName(list, item)}>
        {srcName(list, item)}
      </span>
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5"
        title={projectName}
      >
        <ProjectMark dir={item.dir} label={projectName} size={14} />
        {short(projectName)}
      </span>
      <span className="ml-auto whitespace-nowrap tabular-nums">{ago(item.at)}</span>
    </div>
  );
}
function ZeroState({ S, dir }: { S: Swipe; dir: string | null }) {
  const days = useMemo(() => (S.n ? streak(dir) : 0), []),
    s = Math.round((Date.now() - S.t0) / 1000),
    took = s < 60 ? s + " s" : Math.floor(s / 60) + " min " + (s % 60) + " s";
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-md border border-border bg-card px-4 py-10 text-center">
      {S.n > 0 && host.motion() && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {Array.from({ length: 14 }, (_, n) => (
            <i
              key={n}
              className="absolute -top-2.5 h-3 w-2 animate-fall bg-[hsl(var(--h)_80%_60%)]"
              style={
                {
                  left: `${(n * 37) % 100}%`,
                  animationDelay: `${(n % 5) * 0.08}s`,
                  "--h": (n * 53) % 360,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}
      <h4 className="text-[20px] font-medium">Icebox zero</h4>
      <p className="text-muted-foreground">
        {S.n ? `${S.n} sorted · ${S.pro} promoted · ${S.dis} dismissed · in ${took}` : "Nothing waiting here."}
      </p>
      {days > 0 && (
        <p className="text-muted-foreground">
          {days}-day streak{days > 1 ? " — cleared every day" : ""}
        </p>
      )}
      <p className="mt-3.5">
        <Button variant="primary" size="sm" onClick={exitSwipe}>
          Back to list
        </Button>
      </p>
    </div>
  );
}
const act = "min-h-11 gap-2 max-sm:min-h-12";
// Sort one at a time: the waiting requests the filters show, least skipped first. Decided by dragging the card, by
// the four buttons or by the arrow keys (the page's key handler).
export function SwipeDeck({ list, dir, name }: { list: Source[]; dir: string | null; name: (it: IceItem) => string }) {
  const S = useIce((s) => s.swipe)!,
    deck = useIce((s) => s.deck),
    total = S.n + deck.length,
    top = deck[0];
  // The "+1" rises once per decision.
  useEffect(() => {
    if (!S.pop) return;
    const t = setTimeout(() => setIce((s) => (s.swipe ? { swipe: { ...s.swipe, pop: false } } : {})), 900);
    return () => clearTimeout(t);
  }, [S.pop, S.n]);
  const key = (k: string) => (
    <kbd className="rounded-xs border border-border px-1.5 font-mono text-xs leading-4 text-muted-foreground max-sm:hidden">
      {k}
    </kbd>
  );
  return (
    <div
      id="sw"
      className="mx-auto flex h-[calc(100dvh-130px)] min-h-[420px] w-full max-w-[680px] flex-col justify-center gap-4 max-sm:fixed max-sm:inset-0 max-sm:z-[90] max-sm:h-auto max-sm:min-h-0 max-sm:max-w-none max-sm:justify-start max-sm:bg-background max-sm:px-4 max-sm:pt-[max(12px,env(safe-area-inset-top))] max-sm:pb-[max(16px,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center gap-2.5">
        <Button variant="ghost" size="sm" title="Back to the list (Esc)" onClick={exitSwipe} className="shrink-0">
          ← List
        </Button>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={S.n}
          className="h-[3px] flex-1 overflow-hidden rounded-xs bg-border"
        >
          <i
            className="block h-full bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${total ? Math.round((S.n / total) * 100) : 100}%` }}
          />
        </div>
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {top ? `${S.n + 1} of ${total}` : `${total} of ${total}`}
        </span>
        <span className="relative whitespace-nowrap text-sm text-muted-foreground" title="Sorted this session">
          {S.n} sorted
          {S.pop && <b className="absolute -top-3.5 -right-1 animate-rise text-sm text-success">+1</b>}
        </span>
      </div>
      {!top ? (
        <ZeroState S={S} dir={dir} />
      ) : (
        <>
          <div className="relative grid min-h-[300px] flex-none overflow-visible max-sm:flex-1">
            {deck[1] && (
              <div
                aria-hidden="true"
                className="pointer-events-none col-start-1 row-start-1 flex origin-center translate-y-2.5 scale-[.96] flex-col gap-3.5 overflow-hidden rounded-lg border border-border bg-card p-6 opacity-50 shadow-md"
              >
                <Head item={deck[1]} list={list} projectName={name(deck[1])} />
                <p className="text-[20px] leading-normal font-medium text-strong">{deck[1].text}</p>
              </div>
            )}
            <TopCard key={iceKey(top)} item={top} list={list} projectName={name(top)} />
          </div>
          <div className="grid grid-cols-[1fr_auto_auto_1fr] gap-2 max-sm:grid-cols-2">
            <Button
              id="sw-d"
              aria-label="Dismiss (←)"
              title="Dismiss (←)"
              className={cn(act, "text-danger max-sm:order-1")}
              onClick={() => void swGo("dismiss", (d) => flyCard(document.getElementById("sw-card"), d))}
            >
              <Icon name="x" className="size-4" />
              <small>Dismiss</small>
              {key("←")}
            </Button>
            <Button
              id="sw-s"
              aria-label="Skip (↓)"
              title="Skip (↓)"
              className={cn(act, "max-sm:order-3")}
              disabled={deck.length < 2}
              onClick={() => void swGo("skip")}
            >
              <span>↓</span>
              <small>Skip</small>
              {key("↓")}
            </Button>
            <Button
              id="sw-u"
              aria-label="Undo (z)"
              title="Undo (z)"
              className={cn(act, "max-sm:order-3")}
              disabled={!S.last}
              onClick={() => void swUndo()}
            >
              <Icon name="restore" className="size-4" />
              <small>Undo</small>
              {key("z")}
            </Button>
            <Button
              id="sw-p"
              variant="primary"
              aria-label="Promote (→)"
              title="Promote (→)"
              className={cn(act, "border-strong bg-strong text-background max-sm:order-2")}
              onClick={() => void swGo("promote", (d) => flyCard(document.getElementById("sw-card"), d))}
            >
              <Icon name="check" className="size-4" />
              <small>Promote</small>
              {key("→")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
