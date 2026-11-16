import { useEffect, useLayoutEffect, useRef } from "react";
import { TooltipProvider } from "@web/ui";
import { useRouteClasses } from "@lib/router";
import { useBoard } from "@lib/board";
import { useRunView } from "@lib/run";
import { checkUpdate } from "@lib/settings";
import { SourceMarks } from "@components/rail";
import { Rail, Sprite } from "@components/shell";
import { FootBar } from "@components/footer";
import { ContextPanel } from "@components/context";
import { Header } from "./header.tsx";
import { KeyHelp } from "./help.tsx";
import { Pages } from "./pages.tsx";
import { Panel } from "./panel.tsx";
import { useKeys } from "./keys.ts";
import { useBoot } from "./use-boot.ts";
import { Portal } from "./portal.tsx";

// The Board app: the providers, then the shell (side menu, header, the page area, the detail panel, footer) and the
// layers over it. It holds no state: what shows is the router's (lib/router: the view the address names) and the page
// stores'. It is the page picker: `useRouteClasses` sets the <body> classes that show one page area, and `Pages` draws a
// page the first time it opens. The Terminal page's terminals stay mounted once opened and are hidden by CSS; the in-card
// terminal and the run workspace's panes are mounted by the panel and the workspace engines (lib/run/use-panel-run.ts, workspace.ts).
export function App() {
  useRouteClasses();
  useKeys();
  useBoot();
  // The Board drawer is position:fixed; it stops above the footer, whose height varies.
  const foot = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const fh = () => document.documentElement.style.setProperty("--foot-h", foot.current!.offsetHeight + "px");
    const ro = new ResizeObserver(fh);
    ro.observe(foot.current!);
    fh();
    return () => ro.disconnect();
  }, []);
  // The run panel folded away: the stylesheet keys on this <body> class.
  const flip = useRunView((s) => s.flip);
  useLayoutEffect(() => void document.body.classList.toggle("rflip", flip), [flip]);
  // Workspaces mode of the Board: the stylesheet keys on this <body> class.
  const wsb = useBoard((s) => s.mode === "ws");
  useLayoutEffect(() => void document.body.classList.toggle("wsb", wsb), [wsb]);
  // Hourly so a tab left open still hears of a release; the server's cache limits npm to every 6 h.
  useEffect(() => {
    void checkUpdate();
    const t = setInterval(checkUpdate, 3600_000);
    return () => clearInterval(t);
  }, []);
  return (
    <TooltipProvider>
      <Sprite />
      <Rail srcs={<SourceMarks />} />
      <div className="app">
        <Header />
        <Pages />
        <Panel />
      </div>
      <footer className="foot kz-ui" id="foot" aria-label="Usage and status" ref={foot}>
        <FootBar />
      </footer>
      <div id="context-host" className="kz-ui" style={{ display: "contents" }}>
        <ContextPanel />
      </div>
      <KeyHelp />
      <Portal />
    </TooltipProvider>
  );
}
