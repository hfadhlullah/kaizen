import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { host } from "@lib/core";
import { openWsMenu } from "@lib/project";
import {
  addWorkspace,
  bumpRail,
  currentWs,
  foldProject,
  openTask,
  openWs,
  orderProjects,
  railGroups,
  saveOrder,
  settleIn,
  taskDot,
  useRail,
  useRankDrag,
  wsMenuItems,
  type RailGroup,
  type RailRow,
  type RailTask,
} from "@lib/rail";
import { useRoute } from "@lib/router";
import { useRailData } from "@lib/server";
import { AgentChips } from "./agent-chips.tsx";

// The Projects list of the side menu. Rows keep the board's own markup and classes (.pgrp, .proj, .wsc, .row.ws ...):
// they sit in the legacy layer because the collapsed menu, the phone bar and the Home window's row share them.
// A plain click opens the row in place when the page can; Ctrl, Cmd, Shift or another button keep the browser's own link.
const inPlace = (e: MouseEvent, open: () => boolean) => {
  if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) && open()) e.preventDefault();
};

// A project's mark: its own logo, else its initial (also when the logo cannot be drawn).
export function RailLogo({ dir, name, logo }: { dir: string; name: string; logo: boolean }) {
  const [bad, setBad] = useState(false);
  return logo && !bad ? (
    <img
      className="plogo"
      src={"/project-logo?dir=" + encodeURIComponent(dir)}
      alt=""
      loading="lazy"
      onError={() => setBad(true)}
    />
  ) : (
    <span className="plogo" aria-hidden="true">
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}

const Pin = () => (
  <svg
    viewBox="0 0 24 24"
    aria-label="Pinned"
    style={{ width: 12, height: 12, flex: "none", marginLeft: 4, color: "var(--accent)" }}
  >
    <path
      d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);
const Worktree = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="8" r="2" />
      <path d="M6 8v8M18 10c0 4-6 3-12 6" />
    </g>
  </svg>
);

function TaskLink({ t }: { t: RailTask }) {
  return (
    <a
      className="rtask"
      href={`/?view=task&task=${encodeURIComponent(t.id)}&dir=${encodeURIComponent(t.dir)}`}
      data-task-id={t.id}
      title={`${t.attention.reason} · ${t.attention.action}`}
      onClick={(e) => inPlace(e, () => openTask(t.id, t.dir))}
    >
      <span className={`si ${taskDot(t)}`} />
      <span>
        <b>{t.title}</b>
        <small>{t.attention.reason}</small>
      </span>
    </a>
  );
}

function WsRow({ dir, r, now, current }: { dir: string; r: RailRow; now: number; current: boolean }) {
  return (
    <>
      <div className="wsr wsc">
        <a
          className="row ws"
          href={host.wsHref(dir, r.path)}
          data-dir={dir}
          data-ws={r.path}
          title={r.path}
          aria-current={current ? "true" : undefined}
          onClick={(e) => inPlace(e, () => openWs(dir, r.path))}
          onContextMenu={(e) => {
            const items = wsMenuItems(dir, r.path);
            if (!items.length) return;
            e.preventDefault();
            openWsMenu(
              Math.min(e.clientX, innerWidth - 190),
              Math.min(e.clientY, innerHeight - items.length * 34 - 16),
              items,
            );
          }}
        >
          <span className={`si ${r.st || "none"}`} />
          <div className="wl">
            <span className="l1">
              <b>{r.label}</b>
              {r.pinned && <Pin />}
            </span>
            <span className="l2">
              <span>{r.folder}</span>
              {!r.w.main && <Worktree />}
            </span>
          </div>
        </a>
        <AgentChips rows={r.agents} now={now} open={r.open} dir={dir} ws={r.path} />
      </div>
      {r.tasks.map((t) => (
        <TaskLink key={t.id} t={t} />
      ))}
    </>
  );
}

function Group({
  g,
  logo,
  now,
  cur,
  lift,
  before,
}: {
  g: RailGroup;
  logo: boolean;
  now: number;
  cur: { dir: string | null; ws: string | null };
  lift: boolean;
  before: boolean;
}) {
  const fold = (e: MouseEvent) => {
    e.preventDefault();
    // One that lists nothing has no rows to click, so it opens its main workspace instead.
    if (g.empty && openWs(g.dir, g.mainWs)) return;
    foldProject(g.dir);
  };
  return (
    <>
      <div className={`pgrp${before ? " rank-before" : ""}`}>
        <button
          type="button"
          className={`proj${g.shut ? " shut" : ""}${lift ? " rank-lift" : ""}`}
          data-proj={g.dir}
          data-ws={g.mainWs}
          data-empty={g.empty ? "" : undefined}
          title={g.dir}
          aria-expanded={!g.shut}
          onClick={fold}
        >
          <RailLogo dir={g.dir} name={g.name} logo={logo} />
          <span className="pname">{g.name}</span>
          <svg className="fchev" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M9 6l6 6-6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {g.git && (
          <button
            type="button"
            className="wadd"
            title={`New workspace in ${g.name}`}
            aria-label={`New workspace in ${g.name}`}
            onClick={(e) => (e.preventDefault(), addWorkspace(g.dir))}
          >
            <svg aria-hidden="true">
              <use href="#r-plus" />
            </svg>
          </button>
        )}
      </div>
      {!g.shut && (
        <div className="pws">
          {g.rows.map((r) => (
            <WsRow key={r.path} dir={g.dir} r={r} now={now} current={cur.dir === g.dir && cur.ws === r.path} />
          ))}
        </div>
      )}
    </>
  );
}

export function RailList() {
  const data = useRailData(),
    filt = useRail((s) => s.filt),
    folded = useRail((s) => s.folded),
    pins = useRail((s) => s.pins),
    open = useRail((s) => s.open),
    loc = useRoute((s) => s.search),
    tick = useRail((s) => s.tick);
  const box = useRef<HTMLDivElement>(null);
  const rank = useRankDrag(box, (order) => {
    orderProjects(order);
    saveOrder(order);
  });
  const { groups, now, wait } = useMemo(() => {
    const now = Date.now(),
      groups = railGroups(data, { filt, pins, folded, open, now });
    // Agents are read from this tick's payload; one held at "working" through the 3 s settle redraws when it ends.
    return { groups, now, wait: settleIn(data.agents, now) };
  }, [data, filt, pins, folded, open, tick]);
  useEffect(() => {
    if (wait === Infinity) return;
    const t = setTimeout(bumpRail, wait + 20);
    return () => clearTimeout(t);
  }, [wait, groups]);
  const cur = currentWs(loc, data.cards, data.projects);
  const logos = new Set(data.projects.filter((p) => p.logo).map((p) => p.dir));
  return (
    <div
      ref={box}
      className={`rlist${rank.view.to === groups.length ? " rank-end" : ""}`}
      onClickCapture={(e) => rank.swallow() && (e.preventDefault(), e.stopPropagation())}
    >
      {groups.map((g, i) => (
        <Group
          key={g.dir}
          g={g}
          logo={logos.has(g.dir)}
          now={now}
          cur={cur}
          lift={rank.view.lift === g.dir}
          before={rank.view.to === i}
        />
      ))}
      {!groups.length && <div className="none">No projects</div>}
    </div>
  );
}
