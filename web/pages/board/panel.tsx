import { useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@lib/core";
import {
  DocBody,
  PanelGrip,
  PanelHead,
  PanelTabs,
  ProjectNotes,
  RunAgent,
  RunFooter,
  RunPicker,
} from "@components/run";
import { NotesChat } from "@components/notes";
import { TerminalPane } from "@components/panes";
import { GitHost } from "@components/git";
import { bindSheetSwipe } from "@lib/phone";
import { isPhone } from "@lib/core";
import {
  dismissPanel,
  openProjectNotes,
  panelBody,
  setFlip,
  setPanel,
  useRunView,
  usePanel,
  usePanelRun,
} from "@lib/run";
import { getRoute, useRoute } from "@lib/router";
import { SettingsPage } from "../settings-page.tsx";
import { Part } from "./host.tsx";

const Icon = ({ id }: { id: string }) => (
  <svg>
    <use href={`#${id}`} />
  </svg>
);
// What the panel's body shows: a document tab, Settings, the Notes chat, the in-card agent's terminal or the Source control
// tab. One at a time; the router and the panel's hook (usePanelRun) choose through the panel store, and the one
// that is left unmounts, except the in-card terminals: each is mounted once and hidden by CSS while another body shows.
function PanelBody() {
  const body = usePanel((s) => s.body),
    term = usePanel((s) => s.term),
    terms = usePanel((s) => s.terms),
    top = usePanel((s) => s.top),
    el = useRef<HTMLDivElement>(null);
  // The body starts at its top whenever the panel asks (a new document, a new note), and is findable for the keys.
  useLayoutEffect(() => {
    panelBody.el = el.current;
    return () => void (panelBody.el = null);
  }, []);
  useLayoutEffect(() => void (el.current!.scrollTop = 0), [top]);
  return (
    <div className="body md" id="pbody" ref={el}>
      {body === "doc" && (
        <div className="kz-ui">
          <DocBody />
        </div>
      )}
      {body === "settings" && (
        <div className="kz-ui" style={{ height: "100%", display: "contents" }}>
          <SettingsPage />
        </div>
      )}
      {body === "notes" && (
        <div className="kz-ui">
          <NotesChat />
        </div>
      )}
      {terms.length > 0 && (
        <div className="pterms" hidden={body !== "term"}>
          {terms.map((t) => (
            <Part key={t.key} off={body !== "term" || term?.key !== t.key}>
              <TerminalPane sessionKey={t.key} onEnd={t.onEnd} label="Agent terminal" />
            </Part>
          ))}
        </div>
      )}
      {body === "git" && <GitHost />}
    </div>
  );
}
// The detail panel: a card's tabs, the run workspace's side panel, and the page Settings fills. What frames it (shown,
// docked, wide, parked, its title) is the panel store's; usePanelRun reads the open run and writes what is drawn.
export function Panel() {
  usePanelRun();
  const cls = usePanel((s) =>
      cn(s.open && "open", s.docked && "docked", s.wide && "wide", s.parked && "parked", s.pn && "pn", s.ro && "ro"),
    ),
    on = usePanel((s) => s.open),
    title = usePanel((s) => s.title),
    tip = usePanel((s) => s.titleTip),
    instant = usePanel((s) => s.instant),
    inRun = useRoute((r) => r.view === "run"),
    aside = useRef<HTMLElement>(null);
  // A panel that left as a page is undocked without the slide: one frame with no transition, forced into effect, then
  // the transition is back.
  useLayoutEffect(() => {
    if (!instant) return;
    void aside.current!.offsetWidth;
    setPanel({ instant: false });
  }, [instant]);
  // A phone's run sheet: drag it down from anywhere its content is at the top, or tap outside it (lib/phone/sheet-swipe.ts).
  useEffect(
    () =>
      bindSheetSwipe({
        panel: aside.current!,
        active: () => isPhone() && getRoute().view === "run" && useRunView.getState().flip,
        close: () => setFlip(false),
        keep: "#panel,#rside,dialog,.toast,[data-sonner-toast]",
      }),
    [],
  );
  return (
    <>
      <div className={cn("scrim", on && "on")} id="scrim" onClick={dismissPanel} />
      <aside
        id="panel"
        aria-label="detail"
        ref={aside}
        className={cls || undefined}
        style={instant ? { transition: "none" } : undefined}
      >
        <header>
          <div className="t">
            {inRun && (
              <div className="pagent">
                <Part>
                  <RunAgent />
                </Part>
              </div>
            )}
            <div className="pwrap">
              <Part>
                <RunPicker />
              </Part>
            </div>
            <b id="ptitle" title={tip}>
              {title}
            </b>
            <div className="sub" id="psub">
              <Part>
                <PanelHead />
              </Part>
            </div>
          </div>
          <button className="ib" id="pclose" aria-label="Close" title="Close" onClick={dismissPanel}>
            <Icon id="i-close" />
          </button>
        </header>
        <div
          className="pstrip"
          // Folded away, the strip is what is left of the panel: pressing it brings the panel back.
          onClickCapture={() => inRun && useRunView.getState().flip && !isPhone() && setFlip(false)}
        >
          <button
            className="pexpand"
            type="button"
            aria-label="Expand the panel"
            title="Expand the panel"
            onClick={() => setFlip(false)}
          >
            <Icon id="i-side" />
          </button>
          <nav id="ptabs">
            <Part>
              <PanelTabs />
            </Part>
          </nav>
          <button
            className="pnotes"
            id="pnotes"
            title="Project notes"
            aria-label="Project notes"
            onClick={openProjectNotes}
          >
            <Icon id="t-book" />
          </button>
        </div>
        <div className="body md" id="pnlist">
          <Part>
            <ProjectNotes />
          </Part>
        </div>
        <PanelBody />
        <div className="foot" id="pfoot">
          <Part>
            <RunFooter />
          </Part>
        </div>
        <Part>
          <PanelGrip />
        </Part>
      </aside>
    </>
  );
}
