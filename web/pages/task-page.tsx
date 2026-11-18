import { useEffect, useRef, useState } from "react";
import { useRoute } from "@lib/router";
import { ActionMenu, ConfirmDialog, EmptyState, IconButton } from "@components/shared";
import {
  ChangesView,
  Composer,
  PlanView,
  ResultChecks,
  ResultView,
  ReviewView,
  SavedResults,
  TaskPhone,
  TaskPanel,
  TaskTabs,
  type TabItem,
} from "@components/task";
import { DecisionBar } from "@components/decision";
import {
  conversationItems,
  runAction,
  savedLine,
  setDraft,
  tabFor,
  tabMarks,
  taskStatus,
  useTask,
  useTaskPage,
  useTaskRun,
  projectLabel,
  type TabId,
  type TaskModel,
  type TaskPageData,
  type TaskView,
} from "@lib/task";
import { host, useStore, usePhone } from "@lib/core";
import { Button } from "@web/ui";

const ACCEPT_HINT = "Accepting a result does not publish it. A preview alone does not prove that a backend works.";
// One durable task across clarification, production, saved outputs and revisions: the tab that needs the person opens
// first, the conversation sits beside it (a chat on its own on a phone), one message bar.
export function TaskPage() {
  const on = useRoute((r) => r.page === "task"),
    open = useStore((s) => (on ? s.taskId + "\n" + s.taskDir : ""));
  // A different task starts with its own state: the key remounts everything below.
  return open ? <Task key={open} /> : null;
}
function Task() {
  useTask();
  const page = useStore((s) => s.page),
    pageError = useStore((s) => s.pageError);
  if (!page?.task)
    return pageError ? (
      <EmptyState
        title={pageError === "offline" ? "The server could not be reached" : "This task could not be opened"}
        help={pageError === "offline" ? undefined : pageError}
      >
        <Button asChild>
          <a href="?view=tasks">Back to Tasks</a>
        </Button>
      </EmptyState>
    ) : (
      <p role="status" className="p-7 text-muted-foreground">
        Opening task…
      </p>
    );
  return <Loaded page={page} t={page.task} />;
}
function Loaded({ page, t }: { page: TaskPageData; t: TaskView }) {
  const phone = usePhone();
  return phone ? <PhoneLoaded page={page} t={t} /> : <DesktopLoaded page={page} t={t} />;
}
// The title in the browser's tab follows the task.
const useDocTitle = (title: string) =>
  useEffect(() => {
    document.title = title + " · kaizen";
  }, [title]);
const Confirm = ({ m, t }: { m: TaskModel; t: TaskView }) => (
  <ConfirmDialog
    open={!!m.confirm}
    title={m.confirm === "delete" ? "Delete this task?" : "Abandon this run?"}
    description={m.confirm === "delete" ? "It is not recorded anywhere." : "Saved files are not rolled back."}
    confirmLabel={m.confirm === "delete" ? "Delete" : "Abandon"}
    danger
    onCancel={() => m.setConfirm("")}
    onConfirm={() => {
      const op = m.confirm as string;
      m.setConfirm("");
      void m.finish(op, op === "abandon" ? { why: "abandoned from the task page" } : {});
    }}
  />
);
// While the agent waits on a permission the page says so with Allow and Deny; after Deny it waits for an instruction.
function Permission({ t, m }: { t: TaskView; m: TaskModel }) {
  const asking = !!(t.agentAsking && t.agentAlive),
    why = m.isCurrent && !t.decision ? t.actions?.acceptWhy : undefined;
  if (!m.note && !(m.denied && !t.agentAsking) && !why && !asking) return null;
  return (
    <div role="status" className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-base">
      {m.note && <span className="text-muted-foreground">{m.note}</span>}
      {m.denied && !t.agentAsking && (
        <span className="text-muted-foreground">
          Denied. The agent is waiting for your instruction: tell it what to do instead in the message box.
        </span>
      )}
      {why && <span className="text-muted-foreground">{why}</span>}
      {asking && (
        <span className="flex items-baseline gap-2 text-warning">
          Waiting for permission
          <Button
            disabled={m.pending}
            onClick={() => (m.setDenied(false), void runAction("prompt", { answer: "yes" }))}
          >
            Allow
          </Button>
          <Button
            disabled={m.pending}
            onClick={() => void runAction("prompt", { answer: "no" }).then((r) => r?.ok && m.setDenied(true))}
          >
            Deny
          </Button>
        </span>
      )}
    </div>
  );
}
function DesktopLoaded({ page, t }: { page: TaskPageData; t: TaskView }) {
  const [drawer, setDrawer] = useState<boolean | null>(null),
    [chatTick, setChatTick] = useState(0);
  const m = useTaskPage(page, t, () => (setDrawer(true), setChatTick((n) => n + 1)));
  const { run, loaded } = useTaskRun(t);
  const thread = useRef<HTMLDivElement>(null),
    items = conversationItems(t),
    showDrawer = drawer ?? true;
  useDocTitle(m.title);
  useEffect(() => {
    const el = thread.current?.parentElement;
    if (el) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
  }, [items.length, showDrawer]);
  // The tab that needs the person opens by itself, and again when what needs them changes.
  const target = tabFor(t),
    [tab, setTab] = useState<TabId>(target),
    seen = useRef(target);
  useEffect(() => {
    if (seen.current !== target) {
      seen.current = target;
      setTab(target);
    }
  }, [target]);
  const marks = tabMarks(t, m.current);
  const tabs: TabItem[] = [
    { id: "plan", label: "Plan", mark: marks.plan },
    { id: "result", label: "Result", mark: marks.result },
    ...(m.runs.length
      ? ([
          { id: "changes", label: "Changes", count: run?.files.length || undefined },
          { id: "review", label: "Review", count: run?.findings.filter((f) => !f.done).length || undefined },
        ] as TabItem[])
      : []),
  ];
  const ask = () => {
    setDrawer(true);
    setChatTick((n) => n + 1);
    requestAnimationFrame(() => m.input.current?.focus());
  };
  const dot = !showDrawer && !!(t.pendingDecision || t.inputs?.some((i) => i.state === "queued"));
  // Resume and Stop sit beside the agent in the conversation; with the conversation collapsed they are in the page's header.
  const controls = (
    <>
      {m.stop && (
        <Button size="sm" disabled={m.pending || t.status === "stopping"} onClick={() => void runAction("stop")}>
          {t.status === "stopping" ? "Stopping…" : "Stop"}
        </Button>
      )}
      {m.resume && (
        <Button size="sm" onClick={() => void runAction("resume")}>
          {t.status === "failed" ? "Retry" : "Resume"}
        </Button>
      )}
    </>
  );
  const lookGood = (
    <Button
      variant="primary"
      title={ACCEPT_HINT}
      onClick={() => void runAction("accept", { resultId: t.currentResultId })}
    >
      Looks good
    </Button>
  );
  return (
    <div className="relative flex min-h-0 flex-1">
      <section
        aria-label="Task"
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 pr-6 max-md:pr-0 max-md:data-[drawer=true]:hidden"
        data-drawer={showDrawer}
      >
        <header className="flex flex-none items-center gap-2.5 max-sm:flex-wrap">
          <IconButton
            icon="arrow"
            label="Back to tasks"
            href="?view=tasks"
            className="[&_svg]:rotate-180"
            onClick={(e) => (e.preventDefault(), host.go("tasks", true))}
          />
          <div className="mr-auto min-w-0">
            <p className="truncate text-xs text-muted-foreground">{projectLabel(t, page.projects)}</p>
            <h1 className="truncate text-[18px] font-semibold leading-snug">{m.title}</h1>
          </div>
          {!showDrawer && controls}
          {m.start && (
            <Button
              variant="primary"
              onClick={() =>
                host.runPopup(
                  { _k: "task:" + t.id, kind: "task", state: t.dir, text: t.title },
                  (pick) => void runAction("start", { pick }),
                )
              }
            >
              Start planning
            </Button>
          )}
          {m.accept && tab !== "result" && lookGood}
          <ActionMenu
            label="Task details"
            items={m.menu}
            footer={
              <div className="px-2 py-1.5 text-muted-foreground">
                <ResultChecks result={m.selected} />
                <p className="mb-2 text-sm">
                  {page.defaults?.agent
                    ? "Agent: " + page.defaults.agent + ". "
                    : "Configured project agent and workflow. "}
                  {page.defaults?.workflow ? "Workflow: " + page.defaults.workflow + ". " : ""}
                  {page.defaults?.permissions || "Tool permissions follow the existing project settings."}
                </p>
                <p className="mb-2 text-sm text-muted-foreground">
                  Permission prompts show here with Allow and Deny. Stop requests cancellation; it does not undo files.
                </p>
                {!m.runs.length && <p className="mb-2 text-sm">No run has started yet.</p>}
                <small className="mb-1 block break-words text-muted-foreground">
                  Task {t.id} · revision {t.revision}
                </small>
              </div>
            }
          />
        </header>
        <Permission t={t} m={m} />
        <TaskTabs tabs={tabs} active={tab} onPick={setTab} />
        <div
          key={tab}
          role="tabpanel"
          id={`task-pane-${tab}`}
          aria-labelledby={`task-tab-${tab}`}
          className="flex min-h-0 flex-1 flex-col overflow-auto motion-safe:animate-pane"
        >
          {tab === "plan" && (
            <PlanView
              run={run}
              loaded={loaded}
              waiting={!!t.decision || !t.dir}
              planning={t.status === "working" && ["plan", "explore"].includes(t.runStage ?? "")}
            >
              <DecisionBar
                decision={t.decision}
                needsProject={!t.dir || t.decision?.kind === "project"}
                projects={page.projects}
                pending={m.pending}
                onApprove={(decisionId) => void runAction("confirm", { decisionId })}
                onAnswer={(text) => (setDraft(text), void m.send())}
                onProject={(choice) => void runAction("project", choice)}
                onAsk={ask}
              />
            </PlanView>
          )}
          {tab === "result" && (
            <>
              {m.accept && (
                <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <b className="font-medium text-strong">Ready for you.</b> Check the result, then accept it.
                  </span>
                  {lookGood}
                  <Button onClick={ask}>Ask for a change</Button>
                </div>
              )}
              <SavedResults
                results={m.results}
                selectedId={m.selectedId}
                currentId={t.currentResultId}
                onPick={m.picked}
              />
              <div className="flex min-h-0 flex-1 flex-col">
                <ResultView
                  result={m.selected}
                  artifactId={m.artifactId}
                  working={t.status === "working" ? taskStatus(t) : undefined}
                  stage={t.runStage}
                  alive={t.agentAlive}
                  waiting={t.status === "waiting"}
                  onSelect={m.setArtifactId}
                />
              </div>
              <p className="mt-2 text-right text-xs text-muted-foreground">{savedLine(m.selected)}</p>
              {t.acceptedResultId && t.attention.category === "completed" && (
                <div className="mt-2.5 text-success">Accepted. Publishing is a separate action.</div>
              )}
            </>
          )}
          {tab === "changes" && <ChangesView run={run} workspace={m.workspace} />}
          {tab === "review" && <ReviewView run={run} workspace={m.workspace} />}
        </div>
      </section>
      <TaskPanel
        t={t}
        folded={!showDrawer}
        onFold={(folded) => setDrawer(!folded)}
        projectName={projectLabel(t, page.projects)}
        controls={controls}
        threadRef={thread}
        dot={dot}
        focusChat={chatTick}
        after={
          m.queue.length > 0 && (
            <div aria-label="Requests awaiting completion" className="mb-1.5 flex justify-end gap-1.5 px-1">
              {m.queue.map((i) => (
                <span key={i.id} title={`Receipt ${i.id.slice(0, 8)}`} className="text-xs text-warning">
                  {i.state === "received" ? "Received" : "Queued for next pass"}
                </span>
              ))}
            </div>
          )
        }
        footer={
          <Composer
            inputRef={m.input}
            value={m.draft}
            onChange={setDraft}
            onSend={() => void m.send()}
            pending={m.pending}
            answering={t.decision?.kind === "question"}
            help={m.help}
            receipt={m.receipt}
          />
        }
        actions={
          <>
            {m.menu.find((x) => x.id === "archive") && (
              <Button size="sm" variant="ghost" onClick={() => m.menu.find((x) => x.id === "archive")?.onSelect?.()}>
                Archive
              </Button>
            )}
            {m.menu.find((x) => x.id === "abandon") && (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() => m.menu.find((x) => x.id === "abandon")?.onSelect?.()}
              >
                Abandon
              </Button>
            )}
          </>
        }
      />
      <Confirm m={m} t={t} />
    </div>
  );
}
function PhoneLoaded({ page, t }: { page: TaskPageData; t: TaskView }) {
  const m = useTaskPage(page, t);
  useDocTitle(m.title);
  return (
    <>
      <TaskPhone page={page} t={t} m={m} permission={<Permission t={t} m={m} />} />
      <Confirm m={m} t={t} />
    </>
  );
}
