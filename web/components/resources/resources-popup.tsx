import { useEffect, useRef, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger, Skeleton } from "@web/ui";
import { cn } from "@lib/core";
import {
  foldTile,
  heaviest,
  killTerminal,
  loadPorts,
  stopPortOf,
  type Port,
  loadDisk,
  loadResources,
  memParts,
  openTerminal,
  ringDash,
  setOpen,
  setResources,
  shortCmd,
  shareOf,
  size,
  sparkPoints,
  startCleanup,
  topParts,
  usedPct,
  useResources,
  wsName,
  type Terminal,
} from "@lib/resources";

// The footer's resource monitor, laid out like macOS Control Center: a Memory tile and a Storage tile side by side, each
// opening in place to its detail, and every live terminal heaviest first. The trigger keeps the footer's own `.fb`
// button (legacy layer); the popup is a kit popover, so it stays open while the numbers refresh.
const SEG = ["bg-primary", "bg-foreground/45", "bg-foreground/30", "bg-foreground/20", "bg-foreground/10"];
const tile = "min-w-0 flex-1 rounded-md border border-border/70 bg-foreground/4 px-3 py-2.5 text-left";
const cap = "block text-xs tabular-nums text-muted-foreground";
const Chev = ({ open }: { open: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={cn(
      "size-3.5 fill-none stroke-muted-foreground stroke-2 transition-transform duration-200",
      open && "rotate-180",
    )}
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

// A segmented bar with its legend beside the values, so identity is never colour alone.
function Split({ parts, rows = true, hide }: { parts: [string, number][]; rows?: boolean; hide?: boolean }) {
  return (
    <>
      <div className={cn("my-2 mb-1 flex h-1.5 gap-0.5 overflow-hidden rounded-xs", hide && "hidden")}>
        {parts.map(([n, v], i) => (
          <i
            key={n}
            className={cn("min-w-0.5", SEG[i] ?? SEG[4])}
            style={{ flex: `${v} 0 2px` }}
            title={`${n}: ${size(v)}`}
          />
        ))}
      </div>
      {rows &&
        parts.map(([n, v], i) => (
          <div key={n} className="flex min-h-5 items-center gap-2">
            <span className="min-w-0 flex-1 truncate">
              <u className={cn("mr-2 inline-block size-2 rounded-[2px]", SEG[i] ?? SEG[4])} />
              {n}
            </span>
            <em className="text-muted-foreground tabular-nums not-italic">{shareOf(parts, v)}%</em>
            <b className="font-medium tabular-nums">{size(v)}</b>
          </div>
        ))}
    </>
  );
}

function Spark() {
  const p = sparkPoints(useResources((s) => s.history));
  return p ? (
    <svg
      className="mb-1.5 block h-10 w-full"
      viewBox="0 0 100 36"
      preserveAspectRatio="none"
      role="img"
      aria-label="Memory use over recent minutes"
    >
      <polygon points={p.area} className="fill-primary/12 stroke-none" />
      <polyline points={p.line} vectorEffect="non-scaling-stroke" className="fill-none stroke-primary stroke-2" />
    </svg>
  ) : null;
}

function Memory({ slim }: { slim: boolean }) {
  const res = useResources((s) => s.res)!,
    open = useResources((s) => s.memOpen);
  const pct = usedPct(res);
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => foldTile("mem")}
      className={cn(tile, "hover:bg-foreground/7", slim && "grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2")}
    >
      <span
        className={cn(
          "mb-1.5 flex items-center justify-between gap-1.5 text-sm font-semibold text-strong",
          slim && "mb-0",
        )}
      >
        Memory
        <Chev open={open} />
      </span>
      <svg
        className={cn("mx-auto mt-0.5 mb-1 block size-[72px]", slim && "m-0 size-9")}
        viewBox="0 0 36 36"
        role="img"
        aria-label={`${pct}% of memory used`}
      >
        <circle cx="18" cy="18" r="15" className="fill-none stroke-border stroke-[3.5]" />
        <circle
          cx="18"
          cy="18"
          r="15"
          className="fill-none stroke-primary stroke-[3.5] transition-[stroke-dasharray] duration-500 ease-out"
          strokeLinecap="round"
          strokeDasharray={`${ringDash(pct)} 94.25`}
          transform="rotate(-90 18 18)"
        />
        <text
          x="18"
          y="20.6"
          textAnchor="middle"
          className="fill-strong stroke-none text-[7.5px] font-semibold tabular-nums"
        >
          {pct}%
        </text>
      </svg>
      <span className={cn(cap, "text-center", slim && "text-right")}>
        {size(res.system.used)} of {size(res.system.total)}
      </span>
      {open && (
        <span className="col-span-full mt-2.5 block border-t border-border pt-2.5">
          <Spark />
          <Split parts={memParts(res)} />
        </span>
      )}
    </button>
  );
}

const IconBtn = ({
  label,
  title,
  spin,
  onClick,
  children,
}: {
  label: string;
  title: string;
  spin?: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    title={title}
    aria-label={label}
    onClick={onClick}
    className="grid size-7 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-strong"
  >
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-4 fill-none stroke-current stroke-[1.8]", spin && "motion-safe:animate-spin")}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  </button>
);

function Storage({ slim }: { slim: boolean }) {
  const disk = useResources((s) => s.disk),
    open = useResources((s) => s.diskOpen);
  return (
    <div className={cn(tile, slim && "grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2")}>
      <div
        className={cn(
          "mb-1.5 flex items-center justify-between gap-1.5 text-sm font-semibold text-strong",
          slim && "mb-0",
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={() => foldTile("disk")}
          className="inline-flex cursor-pointer items-center gap-1 rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Storage
          <Chev open={open} />
        </button>
        <span className="inline-flex gap-0.5">
          <IconBtn label="Clean up" title="Clean up: a Claude Code in Home runs /disk-cleanup" onClick={startCleanup}>
            <path d="M14 3l-4 9" />
            <path d="M6.5 12h8l1.5 8.5a.5.5 0 0 1-.5.5H5.5a.5.5 0 0 1-.5-.5z" />
            <path d="M8 21l.5-4M11.5 21v-4M15 21l-.5-4" />
          </IconBtn>
          <IconBtn
            label="Rescan"
            title={disk?.scanning ? "Scanning…" : "Rescan"}
            spin={disk?.scanning}
            onClick={() => void loadDisk(true)}
          >
            <path d="M20 12a8 8 0 1 1-2.3-5.7" />
            <path d="M20 4v5h-5" />
          </IconBtn>
        </span>
      </div>
      {disk?.at ? (
        <>
          <div className="text-[22px] font-semibold tracking-tight text-strong tabular-nums">{size(disk.total)}</div>
          <span className={cn(cap, slim && "text-right")}>used by kaizen</span>
          <Split parts={topParts(disk.rows)} rows={false} hide={slim} />
          {open && (
            <div className="col-span-full mt-2.5 block border-t border-border pt-2.5">
              {disk.rows.slice(0, 6).map((r) => (
                <div key={r.name} className="flex min-h-5 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate" title={r.name}>
                    {r.name}
                  </span>
                  <b className="font-medium tabular-nums">{size(r.bytes)}</b>
                </div>
              ))}
              {disk.rows.length > 6 && (
                <div className="flex min-h-5 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{disk.rows.length - 6} more</span>
                  <b className="font-medium tabular-nums">
                    {size(disk.rows.slice(6).reduce((n, r) => n + r.bytes, 0))}
                  </b>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <Skeleton className="my-2 h-2.5 w-[70%]" />
          <Skeleton className="my-2 h-2.5 w-[45%]" />
        </>
      )}
    </div>
  );
}

const MARKS = ["claude", "codex", "gemini"];
function TermRow({ t }: { t: Terminal }) {
  const ask = useResources((s) => s.confirm === t.key);
  const btn = "h-[26px] rounded-sm border border-border bg-card px-2 text-xs text-foreground hover:bg-muted";
  return (
    <div className="group grid grid-cols-[24px_minmax(0,1fr)_auto_auto] items-center gap-2.5 border-t border-border/70 py-[7px] first:border-t-0">
      <span className="grid size-6 place-items-center rounded-md border border-border bg-card">
        <svg aria-hidden="true" className="size-3.5">
          <use href={`#i-${MARKS.includes(t.agent ?? "") ? t.agent : "term"}`} />
        </svg>
      </span>
      <span className="min-w-0">
        <b className="block truncate font-medium text-strong" title={t.title}>
          {t.title}
        </b>
        <small className="block truncate text-xs text-muted-foreground">{wsName(t)}</small>
      </span>
      <span className="tabular-nums">{t.rss == null ? "–" : size(t.rss)}</span>
      <span className="flex gap-1">
        {ask ? (
          <>
            <button type="button" className={btn} onClick={() => setResources({ confirm: "" })}>
              Keep
            </button>
            <button
              type="button"
              className={cn(btn, "border-danger/40 text-danger")}
              onClick={() => void killTerminal(t.key)}
            >
              Kill
            </button>
          </>
        ) : (
          <>
            {t.dir && (
              <button type="button" className={btn} onClick={() => openTerminal(t)}>
                Open
              </button>
            )}
            <button
              type="button"
              className={cn(
                btn,
                "[@media(hover:hover)]:opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
              )}
              aria-label={`Kill ${t.title}`}
              onClick={() => setResources({ confirm: t.key, failed: "" })}
            >
              Kill
            </button>
          </>
        )}
      </span>
    </div>
  );
}

function Terminals() {
  const res = useResources((s) => s.res)!,
    failed = useResources((s) => s.failed);
  const ts = heaviest(res.terminals);
  return (
    <div className={cn(tile, "col-span-full")}>
      <div className="mb-1.5 flex items-center justify-between gap-1.5 text-sm font-semibold text-strong">
        <span>Terminals</span>
        <small className="text-xs font-normal text-muted-foreground tabular-nums">
          {ts.length ? `${ts.length} running` : ""}
        </small>
      </div>
      {failed && (
        <div className="text-xs text-muted-foreground" role="alert">
          {failed}
        </div>
      )}
      {ts.length ? (
        <div className="-mr-1.5 max-h-[226px] overflow-y-auto overscroll-contain pr-1.5">
          {ts.map((t) => (
            <TermRow key={t.key} t={t} />
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">No terminals. Start one with + in a workspace.</div>
      )}
    </div>
  );
}

function PortRow({ p }: { p: Port }) {
  const ask = useResources((s) => s.confirmPort === p.port);
  const btn = "h-[26px] rounded-sm border border-border bg-card px-2 text-xs text-foreground hover:bg-muted";
  return (
    <div className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-border/70 py-[7px] first:border-t-0">
      <b className="min-w-12 font-mono text-sm font-medium text-strong tabular-nums">:{p.port}</b>
      <span className="min-w-0">
        <b className="block truncate font-medium text-strong" title={p.cmd}>
          {shortCmd(p.cmd) || p.name || "process"}
        </b>
        <small className="block truncate text-xs text-muted-foreground" title={p.cwd}>
          {p.project}
        </small>
      </span>
      <span className="flex gap-1">
        {ask ? (
          <>
            <button type="button" className={btn} onClick={() => setResources({ confirmPort: 0 })}>
              Keep
            </button>
            <button type="button" className={cn(btn, "border-danger/40 text-danger")} onClick={() => void stopPortOf(p.port)}>
              Stop
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={btn}
              onClick={() => window.open(`http://localhost:${p.port}`, "_blank", "noopener")}
            >
              Open
            </button>
            <button
              type="button"
              className={cn(btn, "[@media(hover:hover)]:opacity-0 group-focus-within:opacity-100 group-hover:opacity-100")}
              aria-label={`Stop localhost:${p.port}`}
              onClick={() => setResources({ confirmPort: p.port })}
            >
              Stop
            </button>
          </>
        )}
      </span>
    </div>
  );
}

// What listens on a port inside the board's projects (dev servers, mostly), with Open and Stop.
function Ports() {
  const ports = useResources((s) => s.ports),
    error = useResources((s) => s.portsError);
  // Nothing listening (or not read yet): no tile at all. A failed read still says so, so a board that is too old is not silent.
  if (!ports?.length && !error) return null;
  return (
    <div className={cn(tile, "col-span-full")}>
      <div className="mb-1.5 flex items-center justify-between gap-1.5 text-sm font-semibold text-strong">
        <span>Ports</span>
        <small className="text-xs font-normal text-muted-foreground tabular-nums">
          {ports?.length ? `${ports.length} listening` : ""}
        </small>
      </div>
      {ports?.length ? (
        <div className="-mr-1.5 max-h-[170px] overflow-y-auto overscroll-contain pr-1.5">
          {ports.map((p) => (
            <PortRow key={`${p.port}:${p.pid}`} p={p} />
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">{error}</div>
      )}
    </div>
  );
}

export function ResourcesButton() {
  const open = useResources((s) => s.open),
    res = useResources((s) => s.res),
    memOpen = useResources((s) => s.memOpen),
    diskOpen = useResources((s) => s.diskOpen);
  // Every 15 s while closed (the footer shows Kaizen's share); every 3 s while open, and the disk until it has been read.
  useEffect(() => {
    void loadResources();
    if (open) (void loadDisk(), void loadPorts());
    const t = setInterval(
      () => {
        void loadResources();
        if (open) void loadPorts();
        const d = useResources.getState().disk;
        if (open && (d?.scanning || !d?.at)) void loadDisk();
      },
      open ? 3000 : 15_000,
    );
    return () => clearInterval(t);
  }, [open]);
  const one = memOpen || diskOpen;
  // The popup sits 12 px from the window's right edge and 6 px above the footer, as it always has, not under its button.
  const btn = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState({ x: 0, y: 6 });
  const toggle = (o: boolean) => {
    const b = btn.current?.getBoundingClientRect(),
      f = btn.current?.closest("footer")?.getBoundingClientRect();
    if (o && b) setAt({ x: innerWidth - 12 - b.right, y: 6 + (f ? b.top - f.top : 0) });
    setOpen(o);
  };
  return (
    <Popover open={open} onOpenChange={toggle}>
      <PopoverTrigger asChild>
        <button
          ref={btn}
          type="button"
          className="fb"
          id="res"
          title={res ? `Kaizen uses ${size(res.kaizen)} of memory` : "Resources"}
          aria-haspopup="dialog"
        >
          <svg>
            <use href="#i-mem" />
          </svg>
          <span>{res ? size(res.kaizen) : ""}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={at.y}
        alignOffset={-at.x}
        collisionPadding={12}
        aria-label="Resources"
        className="grid max-h-(--radix-popover-content-available-height) w-[360px] grid-cols-2 content-start gap-2 overflow-auto rounded-lg bg-card/94 p-2.5 text-sm whitespace-normal backdrop-blur-xl"
      >
        {res ? (
          <>
            <div className={cn("flex min-w-0", one && "col-span-2")}>
              <Memory slim={one && !memOpen} />
            </div>
            <div className={cn("flex min-w-0", one && "col-span-2")}>
              <Storage slim={one && !diskOpen} />
            </div>
            <Terminals />
            <Ports />
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
