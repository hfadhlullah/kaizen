import { Wordmark } from "@components/shell";
import { ProjectPicker, ShowingPicker } from "@components/project";
import { BoardModeSwitch, StatusButton } from "@components/board";
import { TerminalModes } from "@components/terminal";
import { ContextOpen } from "@components/context";
import { useShell } from "@lib/shell";

const Icon = ({ id }: { id: string }) => (
  <svg>
    <use href={`#${id}`} />
  </svg>
);
// The page title: the view's name, or the wordmark on a phone's Home.
function Title() {
  const { title, mark } = useShell();
  return <h1>{mark ? <Wordmark label="kaizen" /> : title}</h1>;
}
// The header of every page: the title, the pickers and filter the Board uses, and the buttons each view shows (CSS keys off
// <body> classes, set by the board's router). Its buttons are wired by the router and the cards code (web/board/).
export function Header() {
  return (
    <div className="hdr">
      <button
        type="button"
        className="ib"
        id="phone-menu"
        aria-label="Show navigation menu"
        aria-expanded="false"
        title="Show navigation menu"
      >
        <Icon id="i-more" />
      </button>
      <button className="ib" id="hsidetop" aria-label="Chats" title="Chats">
        <Icon id="i-side" />
      </button>
      <Title />
      <div className="combo" id="combo">
        <ProjectPicker />
      </div>
      <div className="combo" id="showc" hidden>
        <ShowingPicker />
      </div>
      <span id="fbtn-host" style={{ display: "contents" }}>
        <StatusButton />
      </span>
      <input
        type="search"
        className="sel"
        id="bq"
        placeholder="Filter cards (press /)"
        aria-label="Filter cards"
        spellCheck={false}
        autoComplete="off"
      />
      <span className="hx" id="hx">
        <BoardModeSwitch />
      </span>
      <span className="sp" />
      <span className="kz-ui" id="tmodes" role="group" aria-label="Layout">
        <TerminalModes />
      </span>
      <button className="btn pri" id="newtop">
        <Icon id="i-plus" />
        <span>New task</span>
      </button>
      <ContextOpen />
      <button className="ib" id="hpop" title="Pop out chat" aria-label="Pop out chat">
        <Icon id="i-popout" />
      </button>
      <button className="btn pri" id="hnewtop" aria-label="New chat">
        <Icon id="i-plus" />
        <span>New chat</span>
      </button>
    </div>
  );
}
