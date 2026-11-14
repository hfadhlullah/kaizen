import { useEffect, useRef } from "react";
import { cn, isPhone } from "@lib/core";
import { useServer } from "@lib/server";
import {
  BUTTON_AT,
  closeAllHome,
  closeHomeTab,
  currentTab,
  homeTabs,
  AGENT_MARKS,
  refreshHomeWs,
  selectHomeTab,
  showHomeWs,
  toggleHome,
  toggleMax,
  useFloatDrag,
  useHomeWs,
  WINDOW_AT,
} from "@lib/home";
import { Icon, Tooltip, TooltipContent, TooltipTrigger } from "@web/ui";
import { TerminalPane } from "@components/panes";
import { HomeWsAdd } from "./home-ws-add.tsx";

const barBtn =
  "grid size-(--btn-xs) place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground max-[640px]:size-10";

function BarButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} onClick={onClick} className={cn(barBtn, className)}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
// The bar's own small glyphs (minimize, maximize, close), drawn as the old window drew them.
const glyph = "size-(--ico) fill-none stroke-current stroke-2 [stroke-linecap:round]";

// The panel over the board: a header (drag it by the empty part) with a tab per Home terminal, then the terminal of the
// tab shown. It stays in the page when minimized or closed, so its spot and size are kept; the terminal is only
// mounted while it is open. On a phone it is full screen, with no drag, minimize or maximize.
export function HomeWindow() {
  const s = useHomeWs(),
    el = useRef<HTMLElement>(null),
    shells = useServer((x) => x.shells),
    tabs = homeTabs(shells, s.ending),
    cur = currentTab(tabs, s.on),
    open = s.st === "open",
    drag = useFloatDrag(
      el,
      WINDOW_AT,
      Math.min(760, innerWidth - 32),
      (e) => isPhone() || s.max || !!(e.target as Element).closest("button,summary"),
    );
  // Read in capture, before a focused terminal sends the keys to its agent.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // AltGr reads as Ctrl+Alt on Windows: AltGr+A types a letter (ą) on some layouts, so it is left alone.
      if (
        !e.ctrlKey ||
        !e.altKey ||
        e.shiftKey ||
        e.metaKey ||
        e.code !== "KeyA" ||
        e.getModifierState?.("AltGraph") ||
        isPhone()
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      toggleHome();
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, []);
  return (
    <section
      ref={el}
      aria-label="Home workspace"
      hidden={!open}
      style={drag.at && !s.max ? { left: drag.at.x, top: drag.at.y, right: "auto", bottom: "auto" } : undefined}
      className={cn(
        open ? "flex" : "hidden",
        "fixed right-4 bottom-[calc(var(--foot-h,0px)+16px)] z-35 h-[min(480px,calc(100vh-96px))] max-h-[calc(100vh-16px)] min-h-[220px] w-[min(760px,calc(100vw-32px))] max-w-[calc(100vw-16px)] min-w-[360px] resize flex-col overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-[var(--shadow-2),0_18px_48px_-12px_var(--shade)]",
        s.max && "inset-2! h-auto! max-h-none! w-auto! max-w-none! resize-none",
        "max-[640px]:inset-0! max-[640px]:z-45 max-[640px]:h-auto! max-[640px]:max-h-none! max-[640px]:min-h-0 max-[640px]:w-auto! max-[640px]:max-w-none! max-[640px]:min-w-0 max-[640px]:resize-none max-[640px]:rounded-none max-[640px]:border-0 max-[640px]:pt-[env(safe-area-inset-top)] max-[640px]:pb-[env(safe-area-inset-bottom)] max-[640px]:shadow-none",
      )}
    >
      <header
        onPointerDown={drag.onPointerDown}
        className="flex h-(--tabbar) flex-none cursor-move touch-none items-center gap-1.5 border-b border-border pr-1.5 pl-3 select-none max-[640px]:h-12 max-[640px]:cursor-default max-[640px]:pr-1 max-[640px]:pl-3"
      >
        <Icon name="home" className="size-(--ico) flex-none stroke-[1.8] text-muted-foreground" />
        <b className="text-base font-semibold">Home</b>
        <div
          role="tablist"
          aria-label="Home terminals"
          className="ml-1.5 flex min-w-0 self-stretch overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
        >
          {tabs.map((t) => (
            <div
              key={t.key}
              role="presentation"
              className={cn(
                "group flex max-w-[220px] min-w-[120px] flex-none items-center gap-2 pr-1.5 pl-3 text-base max-[640px]:max-w-40 max-[640px]:min-w-0 max-[640px]:pr-1 max-[640px]:pl-2.5",
                t.key === cur
                  ? "text-strong shadow-[inset_0_-2px_var(--ink-hi)]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={t.key === cur}
                title={t.title}
                onClick={() => selectHomeTab(t.key)}
                className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
              >
                <Icon
                  name={t.agent && AGENT_MARKS.includes(t.agent) ? t.agent : "term"}
                  className="size-(--ico-s) flex-none"
                />
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
              </button>
              <button
                type="button"
                aria-label={`Close ${t.title}`}
                title="Close tab"
                onClick={() => void closeHomeTab(t.key)}
                className={cn(
                  "grid size-4 flex-none place-items-center rounded-xs opacity-0 group-hover:opacity-60 hover:bg-muted hover:opacity-100 max-[640px]:size-7 max-[640px]:opacity-60",
                  t.key === cur && "opacity-60",
                )}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <HomeWsAdd />
        <span className="flex-1" />
        <BarButton label="Minimize to the sidebar" onClick={() => showHomeWs("min")} className="max-[640px]:hidden">
          <svg viewBox="0 0 24 24" aria-hidden="true" className={glyph}>
            <path d="M5 18h14" />
          </svg>
        </BarButton>
        <BarButton label={s.max ? "Restore size" : "Maximize"} onClick={toggleMax} className="max-[640px]:hidden">
          <svg viewBox="0 0 24 24" aria-hidden="true" className={glyph}>
            <rect x="5" y="5" width="14" height="14" rx="2" />
          </svg>
        </BarButton>
        <BarButton
          label="Close the Home workspace"
          // On a phone × goes back and leaves the agents running (a tab's × ends one); on a computer it ends them all.
          onClick={() => (isPhone() ? showHomeWs("closed", false) : void closeAllHome())}
          className="max-[640px]:size-10"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className={glyph}>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </BarButton>
      </header>
      <div className={cn("flex min-h-0 flex-1 flex-col", cur ? "bg-(--term-bg,var(--bg))" : "bg-background")}>
        {!open ? null : cur ? (
          <TerminalPane
            key={cur}
            sessionKey={cur}
            focus
            onEnd={() => void refreshHomeWs()}
            className="p-[8px_4px_4px_10px] [&_.xterm]:h-full [&_.xterm-viewport]:bg-transparent!"
          />
        ) : (
          <p className="m-auto text-sm text-muted-foreground">No terminals. Start an agent or a shell with +.</p>
        )}
      </div>
    </section>
  );
}

// The round button at the bottom right while the window is not open: it opens it, and it drags like the window does.
export function HomeWsButton() {
  const open = useHomeWs((s) => s.st === "open"),
    el = useRef<HTMLButtonElement>(null),
    drag = useFloatDrag(el, BUTTON_AT, 40, () => false);
  return (
    <button
      ref={el}
      type="button"
      hidden={open}
      title="Home workspace (Ctrl+Alt+A)"
      aria-label="Home workspace"
      onPointerDown={drag.onPointerDown}
      onClick={() => !drag.wasDrag() && toggleHome()}
      style={drag.at ? { left: drag.at.x, top: drag.at.y, right: "auto", bottom: "auto" } : undefined}
      className={cn(
        "fixed right-4 bottom-[calc(var(--foot-h,0px)+16px)] z-34 size-10 touch-none place-items-center rounded-full border border-border bg-card text-foreground shadow-md hover:bg-[color-mix(in_srgb,var(--bg-2)_85%,var(--ink))] hover:text-strong max-[640px]:hidden!",
        open ? "hidden" : "grid",
      )}
    >
      <Icon sprite="r" name="term" className="size-[18px] fill-none stroke-current stroke-2" />
    </button>
  );
}

// The minimized window: the first row of the Projects list. It sits beside the list, not in it (board/home-ws.ts mounts
// it above #plist); the row's classes are the list's own.
export function HomeWsRow() {
  const s = useHomeWs(),
    shells = useServer((x) => x.shells),
    n = homeTabs(shells, s.ending).length;
  return (
    <div className="plist hwsslot" hidden={s.st !== "min"}>
      <div className="pgrp">
        <button
          type="button"
          className="proj"
          title="Home workspace: agents outside any project (Ctrl+Alt+A)"
          onClick={() => showHomeWs("open")}
        >
          <svg className="plogo hwsico" aria-hidden="true">
            <use href="#i-home" />
          </svg>
          <span className="pname">Home</span>
          <span className="c">{n || ""}</span>
        </button>
        <button
          type="button"
          className="wadd hwsrx"
          title="Close the Home workspace"
          aria-label="Close the Home workspace"
          onClick={() => void closeAllHome()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
