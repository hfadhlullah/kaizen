import { useEffect } from "react";
import { TooltipProvider } from "@web/ui";
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
// layers over it. It holds no state: what shows is the page stores' and the router's (web/board/views.ts sets
// the view in lib/shell, a class on <body> shows one page area). The terminals live in the page and panel areas
// and are never unmounted by a page switch.
export function App() {
  // Hourly so a tab left open still hears of a release; the server's cache limits npm to every 6 h.
  useEffect(() => {
    void checkUpdate();
    const t = setInterval(checkUpdate, 3600_000);
    return () => clearInterval(t);
  }, []);
  return (
    <TooltipProvider>
      <Sprite />
      <Rail srcs={<SourceMarks />} before={<div style={{ display: "contents" }}><HomeWsRow /></div>} />
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
