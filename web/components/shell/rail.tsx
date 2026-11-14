import { cn } from "@lib/core";
import type { CSSProperties, ReactNode } from "react";
import { useUpdate } from "@lib/settings";
import { railActions } from "@lib/rail";
import { useRoute } from "@lib/router";
import { useServer, iceNewCount, needYouCount } from "@lib/server";
import { setHelp, toggleRail, toggleTheme, useShell } from "@lib/shell";
import { useHiddenTerminals } from "@lib/terminal";
import { RailFilter, RailList } from "../rail/index.ts";
import { Wordmark } from "./wordmark.tsx";

// A page-level link of the side menu. The board's router (web/board/views.ts) takes its clicks; on the Notebook it is a link.
function Item(p: {
  href: string;
  view: string;
  title: string;
  label?: ReactNode;
  className?: string;
  icon: string;
  aria?: string;
  n?: number; // a count on the item (the legacy stylesheet draws data-n)
  children?: ReactNode;
}) {
  const lit = useRoute((r) => r.lit);
  return (
    <a
      className={p.className ?? "it"}
      href={p.href}
      data-view={p.view}
      data-n={p.n || undefined}
      title={p.title}
      aria-label={p.aria}
      aria-current={lit === p.view ? "page" : undefined}
    >
      <svg>
        <use href={`#${p.icon}`} />
      </svg>
      <span className="lbl">{p.label ?? p.title}</span>
      {p.children}
    </a>
  );
}

// The side menu, the same on the board and the Notebook: the logo and fold button, search, the pages, the Projects list
// with its filter and Add button, and Settings with the theme switch. `srcs` holds the Icebox's source marks and `before`
// the minimized Home window's row (both the board's only).
export function Rail(p: { srcs?: ReactNode; before?: ReactNode }) {
  const { min, dark, setup } = useShell(),
    lit = useRoute((r) => r.lit);
  // A dot on Settings while a newer kaizen is known (the About bar and the update card read the same store).
  const latest = useUpdate((s) => (s.ver?.update ? s.ver.latest : ""));
  // Counts the server store gives the menu: tasks that need you, new Icebox requests, Terminal tiles hidden on its page.
  const need = useServer((s) => needYouCount(s.tasks)),
    known = useServer((s) => s.tasks !== null),
    ice = useServer((s) => iceNewCount(s.sources)),
    live = useServer((s) => s.loaded),
    hidden = useHiddenTerminals();
  const tasksTitle = !known ? "Tasks: every task and run, filtered" : need ? `Tasks · ${need} need you` : "Tasks";
  const fold = min ? "Expand menu" : "Collapse menu";
  const theme = dark ? "Dark theme: switch to light" : "Light theme: switch to dark";
  return (
    <nav className="rail" aria-label="Main">
      <div className="top">
        <a className="home" href="/" title="Home" aria-label="kaizen home">
          <Wordmark />
          <span className="mascot" />
        </a>
        <button className="ib" id="fold" aria-label={fold} title={fold} aria-expanded={!min} onClick={toggleRail}>
          <svg>
            <use href="#i-side" />
          </svg>
        </button>
      </div>
      <a
        className="it gs-it"
        href="#"
        id="gsearch"
        title="Search everything"
        onClick={(e) => (e.preventDefault(), railActions.search())}
      >
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="lbl">Search</span>
      </a>
      <a
        className="it"
        href="/"
        data-view="home"
        title="Chat with the project's agent"
        aria-current={lit === "home" ? "page" : undefined}
      >
        <svg className="dkl">
          <use href="#r-chat" />
        </svg>
        <svg className="phl">
          <use href="#i-home" />
        </svg>
        <span className="lbl">
          <span className="dkl">Chat</span>
          <span className="phl">Home</span>
        </span>
      </a>
      <Item
        className="it ponly"
        href="/?view=chat"
        view="chat"
        title="Chat with kaizen's agent"
        label="Chat"
        icon="r-chat"
      />
      <Item
        className="it ponly"
        href="/?view=device"
        view="device"
        title="This computer's runs"
        label="Runs"
        icon="r-runs"
      />
      <Item
        className="it ponly"
        href="/?view=terminal"
        view="terminal"
        n={hidden}
        title={
          live
            ? "Terminal: every agent kaizen runs" + (hidden ? ` (${hidden} hidden)` : "")
            : "Open terminals across all projects"
        }
        label="Terminal"
        icon="r-term"
      />
      <Item
        className="it fold"
        href="/?view=icebox"
        view="sources"
        title="Icebox: requests gathered from your sources"
        label="Icebox"
        icon="r-tray"
      >
        <span className="srcs" id="rail-srcs">
          {p.srcs}
        </span>
        <span className="n" id="ice-n">
          {ice || ""}
        </span>
      </Item>
      <Item
        href="/?view=tasks"
        view="tasks"
        n={need}
        title={tasksTitle}
        aria={known ? tasksTitle : undefined}
        label="Tasks"
        icon="r-bulb"
      />
      <a
        className="it"
        href="/?setup=1"
        id="rsetup"
        hidden={!setup}
        title={setup ? `Continue setup: step ${setup.step + 1} of ${setup.total}` : "Continue setup"}
      >
        <span
          className="ring"
          style={setup ? ({ "--p": Math.round((setup.step / setup.total) * 100) + "%" } as CSSProperties) : undefined}
        />
        <span className="lbl">Setup</span>
      </a>
      <div className="psec">
        <span className="lbl">Projects</span>
        <a
          className="pbd"
          href="/?view=board"
          data-view="board"
          title="Board"
          aria-label="Board"
          aria-current={lit === "board" ? "page" : undefined}
        >
          <svg>
            <use href="#i-board" />
          </svg>
        </a>
        <span id="pfilter-host" style={{ display: "contents" }}>
          <RailFilter />
        </span>
        <button
          id="padd"
          title="Add project or workspace"
          aria-label="Add project or workspace"
          onClick={() => railActions.add()}
        >
          <svg>
            <use href="#r-plus" />
          </svg>
        </button>
      </div>
      {p.before}
      <div className="plist" id="plist" aria-label="Tasks and runs by project">
        <RailList />
      </div>
      <div className="rbot">
        <Item
          className={cn("it fold", latest && "upd")}
          href="/?view=settings"
          view="settings"
          title={
            latest
              ? `Settings: ${(globalThis as { kaizenDesktop?: unknown }).kaizenDesktop ? "Kaizen" : "kaizen"} ${latest} is available`
              : "Settings"
          }
          aria="Settings"
          icon="i-gear"
        />
        <a
          className="ib xs"
          href="/issue"
          target="_blank"
          rel="noopener"
          title="Report an issue"
          aria-label="Report an issue"
        >
          <svg>
            <use href="#r-bug" />
          </svg>
        </a>
        <button
          className="ib xs"
          id="kbd"
          title="Keyboard shortcuts"
          aria-label="Keyboard shortcuts"
          onClick={() => setHelp(true)}
        >
          <svg>
            <use href="#r-kbd" />
          </svg>
        </button>
        <button
          className="ib xs th"
          id="themet"
          title={theme}
          aria-label={theme}
          data-dark={dark}
          onClick={toggleTheme}
        >
          <svg className="sun">
            <use href="#i-sun" />
          </svg>
          <svg className="moon">
            <use href="#i-moon" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
