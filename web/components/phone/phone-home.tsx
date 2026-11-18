import type { MouseEvent, ReactNode } from "react";
import { cn, host } from "@lib/core";
import {
  agentGroups,
  agentMark,
  askingCount,
  homeStats,
  newSheet,
  openTerm,
  pickAgent,
  recentRuns,
  rowKey,
  runGroups,
  shownDevices,
  stateWord,
  subline,
  toggleDevices,
  usePhone,
  wsName,
  type AgentGroup,
} from "@lib/phone";
import { cardHref, DOT, projName, taskForCard, WORD } from "@lib/rail";
import { useRailData } from "@lib/server";
import { Button, Icon } from "@web/ui";
import { ProjectMark, StateDot } from "@components/shared";
import { UsageChips } from "./usage-chips.tsx";

const press = "active:bg-muted focus-visible:outline-2 focus-visible:outline-primary";
const card = "rounded-xl border border-border bg-card";
const Chev = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="size-4 flex-none fill-none stroke-muted-foreground stroke-2 [stroke-linecap:round] [stroke-linejoin:round]"
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
);
const Note = ({ children }: { children: ReactNode }) => (
  <p className="m-1 text-[12.5px] text-muted-foreground">{children}</p>
);
// A page section: a small heading over its rows.
const Section = ({ title, children }: { title: ReactNode; children: ReactNode }) => (
  <section>
    <h3 className="mx-1 mt-[26px] mb-2 text-[11px] font-semibold tracking-[.06em] text-muted-foreground uppercase">
      {title}
    </h3>
    {children}
  </section>
);
// A plain click follows the link in place; a modified one (new tab) is left to the browser.
const plain = (e: MouseEvent) => !(e.ctrlKey || e.metaKey);

function AgentCards() {
  const { agents, projects: agentProjects } = useRailData(),
    groups = agentGroups(agents ?? [], Date.now()),
    asking = askingCount(groups);
  const open = (g: AgentGroup) => (g.rows.length > 1 ? pickAgent(g.rows) : openTerm(g.rows[0]!.a));
  return (
    <section>
      <div className="mt-2 flex items-center justify-between gap-2">
        <h3 className="mx-1 mb-0 flex-1 text-[11px] font-semibold tracking-[.06em] text-muted-foreground uppercase">
          Agents
          {!!asking && <span className="float-right tracking-normal normal-case">{asking} asking</span>}
        </h3>
        <button
          type="button"
          onClick={() => void newSheet()}
          className={cn("flex min-h-11 items-center pr-1 pl-3 text-[14px] font-semibold", press)}
        >
          New
        </button>
      </div>
      {groups.length ? (
        <div
          className={cn(
            groups.length > 2 ? "grid-rows-2" : "grid-rows-1",
            "-mx-4 grid snap-x snap-proximity auto-cols-[min(44vw,164px)] grid-flow-col gap-2 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          )}
        >
          {groups.map((g) => {
            const { a, st } = g.rows[0]!;
            return (
              <button
                key={g.k}
                type="button"
                onClick={() => open(g)}
                className={cn(
                  "flex min-h-[92px] min-w-0 snap-start flex-col gap-1.5 px-3 py-2.5 text-left transition-colors",
                  card,
                  "active:border-foreground focus-visible:outline-2 focus-visible:outline-primary",
                  (st === "asking" || DOT[st] === "fail") && "border-warning",
                )}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <StateDot state={DOT[st]} />
                  {g.rows.length > 1 ? g.rows.length + " agents" : WORD[st]}
                  <span className="ml-auto flex gap-1">
                    {g.rows.map((r, i) => (
                      <Icon key={i} name={agentMark(r.a.agent || "")} className="size-4 flex-none" />
                    ))}
                  </span>
                </span>
                <span className="truncate font-mono text-[12px]">{wsName(a)}</span>
                <small className="truncate text-[12px] text-muted-foreground">{projName(a.dir, agentProjects)}</small>
              </button>
            );
          })}
        </div>
      ) : (
        <Note>No agents running. Tap New to start one.</Note>
      )}
    </section>
  );
}

// A run (or a task not started) as a row: its state dot, title, project and what it waits on.
function RunRow({ c, now }: { c: any; now: number }) {
  const data = useRailData(),
    name = projName(c.state, data.projects);
  // The agent on this row: the one working a task now, else the card's own.
  const task = taskForCard(c, data.tasks),
    mark = task?.agents?.find((a) => a.current)?.agent ?? task?.agents?.at(-1)?.agent ?? c.agent;
  const open = (e: MouseEvent) => {
    if (!plain(e)) return;
    e.preventDefault();
    // A task not started has nothing in a workspace yet: pick its agent and mode instead.
    if (c.kind === "idea" && c.status === "idea") host.runPopup(c);
    else host.openWorkspace(c);
  };
  return (
    <a
      href={cardHref(c)}
      data-id={rowKey(c)}
      onClick={open}
      className="flex items-start gap-3 border-b border-border/60 px-1 py-[11px] last:border-b-0"
    >
      <span className="mt-1 flex">
        <StateDot state={stateWord(c, data)} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="truncate text-[14px] font-semibold">{(c.title || c.text || "").split("\n")[0]}</b>
        <small className="flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
          <ProjectMark
            dir={c.state}
            label={name}
            size={14}
            logo={data.projects?.some((p) => p.dir === c.state && p.logo)}
          />
          {name}
        </small>
        <code className="truncate font-mono text-[11.5px] leading-[1.4] text-muted-foreground">
          {subline(c, now, taskForCard(c, data.tasks))}
        </code>
      </span>
      {mark && <Icon name={agentMark(mark)} className="mt-1 size-4 flex-none" />}
    </a>
  );
}

function Device({ d }: { d: { name: string; dns: string; os: string; online: boolean } }) {
  return (
    <a
      href={d.dns ? "https://" + d.dns + "/" : "#"}
      target="_blank"
      rel="noopener"
      aria-disabled={d.dns ? undefined : true}
      onClick={(e) => !d.dns && e.preventDefault()}
      className={cn("mb-2 flex items-center gap-3 px-3 py-2.5", card, !d.dns && "opacity-60")}
    >
      <span className="grid size-9 flex-none place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon sprite="r" name="desk" className="size-[18px] fill-none stroke-current stroke-[1.8]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="truncate text-[14px] font-semibold">{d.name}</b>
        <small className="flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
          <i className={cn("size-[7px] flex-none rounded-full bg-muted-foreground", d.online && "bg-success")} />
          {d.online ? "Connected" : "Disconnected"}
          {d.os ? " · " + d.os : ""}
        </small>
      </span>
      <Chev />
    </a>
  );
}

function Home() {
  const data = useRailData(),
    { net, usage, allDevices } = usePhone(),
    now = Date.now(),
    st = homeStats(data),
    devs = shownDevices(net.computers, allDevices);
  return (
    <>
      <AgentCards />
      <Section title="Devices on your Tailnet">
        <a
          href="/?view=device"
          onClick={(e) => plain(e) && (e.preventDefault(), host.go("device", true))}
          className={cn("mb-2 flex items-center gap-3 px-3 py-2.5", card)}
        >
          <span className="grid size-9 flex-none place-items-center rounded-full bg-muted text-muted-foreground">
            <Icon sprite="r" name="desk" className="size-[18px] fill-none stroke-current stroke-[1.8]" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <b className="truncate text-[14px] font-semibold">{net.self?.name || "This computer"}</b>
            <small className="flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
              <i className="size-[7px] flex-none rounded-full bg-success" />
              Connected · {st.projects} project{st.projects === 1 ? "" : "s"} · {st.active} active
              {!!st.waiting && (
                <>
                  {" · "}
                  <em className="text-warning not-italic">{st.waiting} waiting</em>
                </>
              )}
            </small>
          </span>
          <Chev />
        </a>
        {devs.list.map((d) => (
          <Device key={d.dns || d.name} d={d} />
        ))}
        {devs.hidden > 0 && (
          <button
            type="button"
            aria-expanded={allDevices}
            onClick={toggleDevices}
            className={cn("mb-2 flex min-h-12 w-full items-center justify-between px-3 text-[15px]", card, press)}
          >
            <span>{allDevices ? "Show less" : `Show ${devs.hidden} more`}</span>
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className={cn(
                "size-[18px] fill-none stroke-muted-foreground stroke-2 [stroke-linecap:round] [stroke-linejoin:round] motion-safe:transition-transform",
                allDevices && "rotate-180",
              )}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
        {!net.tailscale && <Note>Tailscale is off on this computer: other devices do not show.</Note>}
      </Section>
      <Section title="Tasks">
        <div className="flex flex-col">
          {recentRuns(data.cards).map((c, i) => (
            <RunRow key={i + c.state + rowKey(c)} c={c} now={now} />
          ))}
          {!recentRuns(data.cards).length && <Note>No tasks yet.</Note>}
        </div>
      </Section>
      {usage.length > 0 && (
        <Section title="Usage">
          <div className={cn("flex flex-wrap gap-3.5 p-3 text-[13px]", card)}>
            <UsageChips list={usage} />
          </div>
        </Section>
      )}
    </>
  );
}

// One group of the Runs page: a heading with its count that folds (Done starts folded). The fold is the browser's own
// <details>, so a redraw from the poll leaves what the person opened or shut as it is.
function Group({ title, cards, shut }: { title: string; cards: any[]; shut?: boolean }) {
  const now = Date.now();
  if (!cards.length) return null;
  return (
    <details open={!shut} className="group mt-1.5">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-1 pt-3 pb-1.5 text-[13px] font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
        <span className="size-1.5 -rotate-45 border-r-[1.5px] border-b-[1.5px] border-current motion-safe:transition-transform group-open:rotate-45" />
        {title}
        <span>{cards.length}</span>
      </summary>
      <div className="flex flex-col">
        {cards.map((c, i) => (
          <RunRow key={i + c.state + rowKey(c)} c={c} now={now} />
        ))}
      </div>
    </details>
  );
}

function Runs() {
  const data = useRailData(),
    g = runGroups(data);
  return (
    <>
      <Button asChild>
        <a href="?view=tasks" onClick={(e) => plain(e) && (e.preventDefault(), host.go("tasks", true))}>
          Search and filter tasks
        </a>
      </Button>
      <Group title="Needs you" cards={g.wait} />
      <Group title="Working" cards={g.active} />
      <Group title="Not started" cards={g.tasks} />
      <Group title="Done" cards={g.done} shut />
      {g.none && <Note>No tasks yet.</Note>}
    </>
  );
}

// A phone's Home (agents, devices, recent runs, usage) and Runs pages, inside #phome (board.html shows it on a phone
// width, over the board). State and rules: lib/phone.
export function PhonePage() {
  const mode = usePhone((s) => s.mode);
  return mode === "home" ? <Home /> : mode === "device" ? <Runs /> : null;
}
