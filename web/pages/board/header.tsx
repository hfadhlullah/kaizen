import { Wordmark } from "@components/shell";
import { ProjectPicker, ShowingPicker } from "@components/project";
import { BoardModeSwitch, FilterBox, StatusButton } from "@components/board";
import { TerminalModes } from "@components/terminal";
import { ContextOpen } from "@components/context";
import { newTask } from "@lib/board";
import { newChat, popOut, setSide, useHome } from "@lib/home";
import { toggleMenu, useRoute } from "@lib/router";
import { useServer } from "@lib/server";

const Icon = ({ id }: { id: string }) => (
  <svg>
    <use href={`#${id}`} />
  </svg>
);
// The page title: the view's name, or the wordmark on a phone's Home.
function Title() {
  const title = useRoute((r) => r.title),
    mark = useRoute((r) => r.mark);
  return <h1>{mark ? <Wordmark label="kaizen" /> : title}</h1>;
}
// The header of every page: the title, the pickers and filter the Board uses, and the buttons each view shows (CSS keys off
// <body> classes, set from the route by the App).
export function Header() {
  const menu = useRoute((r) => r.menu),
    label = menu ? "Hide navigation menu" : "Show navigation menu",
    all = useServer((s) => s.all),
    side = useHome((s) => s.side),
    sending = useHome((s) => s.sending);
  return (
    <div className="hdr">
      <button
        type="button"
        className="ib"
        id="phone-menu"
        aria-label={label}
        aria-expanded={menu}
        title={label}
        onClick={toggleMenu}
      >
        <Icon id="i-more" />
      </button>
      <button
        className="ib"
        id="hsidetop"
        aria-label="Chats"
        aria-expanded={side}
        title={side ? "Hide chats" : "Show chats"}
        onClick={() => setSide(!side)}
      >
        <Icon id="i-side" />
      </button>
      <Title />
      <div className="combo" id="combo">
        <ProjectPicker />
      </div>
      <div className="combo" id="showc" hidden={!all}>
        <ShowingPicker />
      </div>
      <span id="fbtn-host" style={{ display: "contents" }}>
        <StatusButton />
      </span>
      <FilterBox />
      <span className="hx" id="hx">
        <BoardModeSwitch />
      </span>
      <span className="sp" />
      <span className="kz-ui" id="tmodes" role="group" aria-label="Layout">
        <TerminalModes />
      </span>
      <button className="btn pri" id="newtop" onClick={() => newTask()}>
        <Icon id="i-plus" />
        <span>New task</span>
      </button>
      <ContextOpen />
      <button className="ib" id="hpop" title="Pop out chat" aria-label="Pop out chat" onClick={() => void popOut()}>
        <Icon id="i-popout" />
      </button>
      <button className="btn pri" id="hnewtop" aria-label="New chat" disabled={sending} onClick={newChat}>
        <Icon id="i-plus" />
        <span>New chat</span>
      </button>
    </div>
  );
}
