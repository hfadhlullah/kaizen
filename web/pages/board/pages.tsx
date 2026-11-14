import { StatusStrip } from "@components/board";
import { RunPanes, RunTabs } from "@components/run";
import { PhonePage } from "@components/phone";
import { useBoard } from "@lib/board";
import { BoardPage } from "../board-page.tsx";
import { HomePage } from "../home-page.tsx";
import { IceboxPage } from "../icebox-page.tsx";
import { TaskPage } from "../task-page.tsx";
import { TasksPage } from "../tasks-page.tsx";
import { TerminalPage } from "../terminal-page.tsx";
import { Fill, Once, Part } from "./host.tsx";

const Skeleton = () =>
  [0, 1, 2, 3, 4].map((i) => (
    <section key={i} aria-hidden="true">
      <span className="skel" style={{ height: 14, width: "40%", margin: "4px 0 12px" }} />
      <span className="skel" style={{ height: 72, marginBottom: 8 }} />
      <span className="skel" style={{ height: 72 }} />
    </section>
  ));
// The Board: a grid of columns, a skeleton of them until the first /state answer.
function BoardMain() {
  const loading = useBoard((s) => !s.snap);
  return (
    <main id="board" aria-live="polite" aria-busy={loading || undefined}>
      {loading && <Skeleton />}
      <Part>
        <BoardPage />
      </Part>
    </main>
  );
}
// Every view's area, side by side; the App sets a class on <body> from the route and CSS shows one. The Board,
// the Terminal page, the phone pages and the run workspace are always here; the others are drawn once first opened.
export function Pages() {
  return (
    <>
      <BoardMain />
      <div id="terms" className="kz-ui" aria-label="Terminals">
        <TerminalPage />
      </div>
      <div id="home" aria-label="Chat">
        <Once page="home">
          <Part>
            <HomePage />
          </Part>
        </Once>
      </div>
      <div id="phome" className="kz-ui" aria-label="Devices and runs">
        <PhonePage />
      </div>
      <div id="tasksv" aria-label="Tasks">
        <Once page="tasks">
          <Fill>
            <TasksPage />
          </Fill>
        </Once>
      </div>
      <div id="taskpagev" aria-label="Task">
        <Once page="task">
          <Fill>
            <TaskPage />
          </Fill>
        </Once>
      </div>
      <div id="icev" aria-label="Icebox">
        <Once page="icebox">
          <Fill>
            <IceboxPage />
          </Fill>
        </Once>
      </div>
      <div id="runv" aria-label="Run workspace">
        <div id="rbar">
          <nav id="rtabs" aria-label="Workspace tabs">
            <Part>
              <RunTabs />
            </Part>
          </nav>
          <button
            className="ib xs"
            id="rside"
            title="Show or hide the run panel"
            aria-label="Show or hide the run panel"
            aria-pressed="false"
          >
            <svg>
              <use href="#i-open" />
            </svg>
          </button>
        </div>
        <div id="rpanes">
          <Part>
            <RunPanes />
          </Part>
        </div>
      </div>
      <div className="ftr kz-ui" id="ftr">
        <StatusStrip />
      </div>
    </>
  );
}
