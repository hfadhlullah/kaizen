import { DocBody, PanelGrip, PanelHead, PanelTabs, ProjectNotes, RunFooter, RunPicker } from "@components/run";
import { NotesChat } from "@components/notes";
import { TerminalPane } from "@components/panes";
import { GitHost } from "@components/git";
import { usePanel } from "@lib/run";
import { SettingsPage } from "../settings-page.tsx";
import { Part } from "./host.tsx";

const Icon = ({ id }: { id: string }) => (
  <svg>
    <use href={`#${id}`} />
  </svg>
);
// What the panel's body shows: a document tab, Settings, the Notes chat, the in-card agent's terminal or the Source control
// tab. One at a time; the router and the panel code (web/board/panel.ts) choose through the panel store, and the one
// that is left unmounts, so nothing keeps running behind a tab that is not shown.
function PanelBody() {
  const body = usePanel((s) => s.body),
    term = usePanel((s) => s.term);
  return (
    <div className="body md" id="pbody">
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
      {body === "term" && term && (
        <Part>
          <TerminalPane key={term.key} sessionKey={term.key} onEnd={term.onEnd} label="Agent terminal" />
        </Part>
      )}
      {body === "git" && <GitHost />}
    </div>
  );
}
// The detail panel: a card's tabs, the run workspace's side panel, and the page Settings fills. Its title and buttons are
// the panel code's (web/board/panel.ts, settings.ts); the rest is React.
export function Panel() {
  return (
    <>
      <div className="scrim" id="scrim" />
      <aside id="panel" aria-label="detail">
        <header>
          <div className="t">
            <div className="pwrap">
              <Part>
                <RunPicker />
              </Part>
            </div>
            <b id="ptitle" />
            <div className="sub" id="psub">
              <Part>
                <PanelHead />
              </Part>
            </div>
          </div>
          <button className="ib" id="pterm" aria-label="Terminal" title="Terminal" hidden>
            <Icon id="i-term" />
          </button>
          <button className="ib" id="pclose" aria-label="Close" title="Close">
            <Icon id="i-close" />
          </button>
        </header>
        <div className="pstrip">
          <nav id="ptabs">
            <Part>
              <PanelTabs />
            </Part>
          </nav>
          <button className="pnotes" id="pnotes" title="Project notes" aria-label="Project notes">
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
