import { useEffect, useLayoutEffect } from "react";
import { TooltipProvider } from "@web/ui";
import { useRouteClasses } from "@lib/router";
import { useRunView } from "@lib/run";
import { checkUpdate } from "@lib/settings";
import { SourceMarks } from "@components/rail";
import { HomeWsRow } from "@components/home";
import { Rail, Sprite } from "@components/shell";
import { FootBar } from "@components/footer";
import { ContextPanel } from "@components/context";
import { Header } from "./header.tsx";
import { KeyHelp } from "./help.tsx";
import { Pages } from "./pages.tsx";
import { Panel } from "./panel.tsx";
import { Portal } from "./portal.tsx";

// The Board app: the providers, then the shell (side menu, header, the page area, the detail panel, footer) and the
// layers over it. It holds no state: what shows is the router's (lib/router: the view the address names) and the page
// stores'. It is the page picker: `useRouteClasses` sets the <body> classes that show one page area, and `Pages` draws a
// page the first time it opens. The Terminal page's terminals stay mounted once opened and are hidden by CSS; the in-card
// terminal and the run workspace's panes still unmount with their panel or workspace (web/board/panel.ts, run-view.ts).
export function App() {
  useRouteClasses();
  // The run panel folded away: the stylesheet keys on this <body> class.
  const flip = useRunView((s) => s.flip);
  useLayoutEffect(() => void document.body.classList.toggle("rflip", flip), [flip]);
  // Hourly so a tab left open still hears of a release; the server's cache limits npm to every 6 h.
  useEffect(() => {
    void checkUpdate();
    const t = setInterval(checkUpdate, 3600_000);
    return () => clearInterval(t);
  }, []);
  return (
    <TooltipProvider>
      <Sprite />
      <Rail
        srcs={<SourceMarks />}
        before={
          <div style={{ display: "contents" }}>
            <HomeWsRow />
          </div>
        }
      />
      <div className="app">
        <Header />
        <Pages />
        <Panel />
      </div>
      <footer className="foot kz-ui" id="foot" aria-label="Usage and status">
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
