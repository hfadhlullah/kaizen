import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useRoute } from "@lib/router";
import { ActionMenu, ConfirmDialog, EmptyState, IconButton } from "@components/shared";
import {
  ChatBubble,
  ResultChecks,
  ResultView,
  StatusBadge,
  TypingDots,
} from "@components/task";
import { DecisionBar } from "@components/decision";
import {
  runAction,
  sendMessage,
  setDraft,
  useTask,
  savedLine,
  canAcceptTask,
  closeActions,
  projectLabel,
  queuedInputs,
  runIdsOf,
  sortedResults,
  taskStatus,
  visibleMessages,
} from "@lib/task";
import { host, useStore, cn } from "@lib/core";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@web/ui";

const ACCEPT_HINT = "Accepting a result does not publish it. A preview alone does not prove that a backend works.";
const caps = "text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground";
// One durable task across clarification, production, saved outputs and revisions: the result first, the
// conversation in a drawer, one message bar.
export function TaskPage() {
  const on = useRoute((r) => r.page === "task"),
    open = useStore((s) => (on ? s.taskId + "\n" + s.taskDir : ""));
  // A different task starts with its own state: the key remounts everything below.
  return open ? <Task key={open} /> : null;
}
function Task() {
  useTask();
  const { page, pageError, pending, receipt, draft } = useStore(
    useShallow((s) => ({
      page: s.page,
      pageError: s.pageError,
      pending: s.pending,
      receipt: s.receipt,
      draft: s.draft,
    })),
  );
  const [picked, setPicked] = useState(""),
    [follow, setFollow] = useState(true),
    [artifactId, setArtifactId] = useState(""),
    [drawer, setDrawer] = useState<boolean | null>(null),
    [confirm, setConfirm] = useState<"" | "abandon" | "delete">("");
  const thread = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null);
  const t = page?.task;
  const count = t?.messages?.length ?? 0;
  useEffect(() => {
    if (t) document.title = t.title + " · kaizen";
  }, [t?.title]);
  useEffect(() => {
    const el = thread.current;
    if (el) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
  }, [count, !!t]);
  if (!page || !t)
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
  const results = sortedResults(page.results),
    current = results.find((r) => r.id === t.currentResultId),
    selected =
      follow && current ? current : (results.find((r) => r.id === picked) ?? current ?? results[results.length - 1]),
    selectedId = selected?.id ?? "";
  const isCurrent = selectedId === t.currentResultId;
  const showDrawer = drawer ?? !!t.pendingDecision;
  const stop = t.actions?.stop ?? (!!t.activeRun && !["interrupted", "failed"].includes(t.status ?? ""));
  const resume = t.actions?.resume ?? ["interrupted", "failed"].includes(t.status ?? "");
  const start = !(
    t.actions?.start === false ||
    !t.dir ||
    !!t.activeRun ||
    !!t.currentResultId ||
    t.status !== "draft" ||
    t.decision?.kind === "project"
  );
  const accept = isCurrent && canAcceptTask(t, current);
  const queue = queuedInputs(t).filter((i) => i.state !== "dispatched");
  const close = closeActions(t);
  const finish = async (op: string, extra: Record<string, unknown> = {}) => {
    const r = await runAction(op, extra);
    if (r?.ok) {
      history.pushState(null, "", "?view=tasks");
      host.go("tasks");
    }
  };
  const send = async () => {
    if (!(await sendMessage(selectedId))) return void input.current?.focus();
    setFollow(true);
    setDrawer(true);
    input.current?.focus();
  };
  const menu = [
    ...runIdsOf(t).map((id) => ({
      id: "run-" + id,
      label: "Open workspace · " + id,
      href: `?view=run&id=${id}&dir=${encodeURIComponent(t.dir)}`,
    })),
    { id: "archive", label: "Archive", onSelect: () => void finish("archive") },
    ...(close.abandon
      ? [{ id: "abandon", label: "Abandon", danger: true, onSelect: () => setConfirm("abandon") }]
      : []),
    ...(close.delete ? [{ id: "delete", label: "Delete", danger: true, onSelect: () => setConfirm("delete") }] : []),
  ];
  const help = t.activeRun
    ? "Changes are saved for the next safe pass. Questions do not interrupt production."
    : t.attention.category === "completed"
      ? "A new change stays in this task and starts a linked revision."
      : "Ask a question or describe a change. Your message stays with this task.";
  const dot = !showDrawer && !!(t.pendingDecision || t.inputs?.some((i) => i.state === "queued"));
  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex flex-none items-center gap-2.5 max-sm:flex-wrap">
        <IconButton
          icon="arrow"
          label="Back to tasks"
          href="?view=tasks"
          className="[&_svg]:rotate-180"
          onClick={(e) => (e.preventDefault(), host.go("tasks", true))}
        />
        <h1 className="min-w-0 truncate text-[18px] font-semibold leading-snug">{t.title}</h1>
        <span className="mr-auto shrink-0 whitespace-nowrap text-sm text-muted-foreground">
          {projectLabel(t, page.projects)}
        </span>
        {stop && (
          <Button disabled={pending || t.status === "stopping"} onClick={() => void runAction("stop")}>
            {t.status === "stopping" ? "Stopping…" : "Stop"}
          </Button>
        )}
        {resume && (
          <Button onClick={() => void runAction("resume")}>{t.status === "failed" ? "Retry" : "Resume"}</Button>
        )}
        {start && (
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
        {accept && (
          <Button
            variant="primary"
            title={ACCEPT_HINT}
            onClick={() => void runAction("accept", { resultId: t.currentResultId })}
          >
            Looks good
          </Button>
        )}
        <IconButton icon="note" label="Conversation" aria-expanded={showDrawer} onClick={() => setDrawer(!showDrawer)}>
          {dot && (
            <i className="absolute right-[5px] top-[5px] size-2 rounded-full bg-warning shadow-[0_0_0_2px_var(--bg)]" />
          )}
        </IconButton>
        <ActionMenu label="Task details" items={menu}>
          <ResultChecks result={selected} />
          <p className="mb-2 text-sm">
            {page.defaults?.agent ? "Agent: " + page.defaults.agent + ". " : "Configured project agent and workflow. "}
            {page.defaults?.workflow ? "Workflow: " + page.defaults.workflow + ". " : ""}
            {page.defaults?.permissions || "Tool permissions follow the existing project settings."}
          </p>
          <p className="mb-2 text-sm text-muted-foreground">
            Permission prompts show here with Allow and Deny. Stop requests cancellation;
            it does not undo files.
          </p>
          {!runIdsOf(t).length && <p className="mb-2 text-sm">No run has started yet.</p>}
          <small className="mb-1 block break-words text-muted-foreground">
            Task {t.id} · revision {t.revision}
          </small>
        </ActionMenu>
      </header>
      <div role="status" className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-base">
        <StatusBadge category={t.attention?.category ?? "in-progress"}>{taskStatus(t)}</StatusBadge>
        <span className="text-muted-foreground">{t.attention?.action || ""}</span>
        <span className="text-muted-foreground">{isCurrent && !t.decision ? (t.actions?.acceptWhy ?? "") : ""}</span>
        {t.agentAsking && t.agentAlive && (
          <span className="flex items-baseline gap-2 text-warning">
            Waiting for permission
            <Button disabled={pending} onClick={() => void runAction("prompt", { answer: "yes" })}>
              Allow
            </Button>
            <Button disabled={pending} onClick={() => void runAction("prompt", { answer: "no" })}>
              Deny
            </Button>
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{savedLine(selected)}</span>
      </div>
      <div className="flex min-h-0 flex-1 items-stretch">
        <section
          aria-label="Task results"
          className="flex min-h-0 min-w-0 flex-1 flex-col max-md:data-[drawer=true]:hidden"
          data-drawer={showDrawer}
        >
          {results.length > 1 && (
            <div className="mb-3.5">
              <Select
                value={selectedId}
                onValueChange={(id) => {
                  setPicked(id);
                  setFollow(id === t.currentResultId);
                  setArtifactId("");
                }}
              >
                <SelectTrigger
                  aria-label="Saved results"
                  size="sm"
                  title="Files are retained without automatic expiry. Live links remain mutable."
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...results].reverse().map((r, i) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.title || "Version " + (results.length - i)}
                      {r.id === t.currentResultId ? " · current" : " · earlier saved output"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col">
            <ResultView
              result={selected}
              artifactId={artifactId}
              working={t.status === "working" ? taskStatus(t) : undefined}
              stage={t.runStage}
              alive={t.agentAlive}
              waiting={t.status === "waiting"}
              onSelect={setArtifactId}
            />
          </div>
          {t.acceptedResultId && t.attention.category === "completed" && (
            <div className="mt-2.5 text-success">Accepted. Publishing is a separate action.</div>
          )}
        </section>
        <div
          role="complementary"
          aria-label="Conversation and requests"
          className={cn(
            "flex min-h-0 w-0 flex-none flex-col gap-1.5 overflow-hidden opacity-0 invisible transition-[width,margin,opacity] duration-300 motion-reduce:transition-none",
            showDrawer &&
              "visible ml-6 w-[380px] border-l border-[color:color-mix(in_srgb,var(--line)_50%,transparent)] pl-5 opacity-100 max-md:ml-0 max-md:w-full max-md:border-l-0 max-md:pl-0",
          )}
        >
          <header className="flex min-w-[340px] items-center max-md:min-w-0">
            <h2 className={cn(caps, "mr-auto")}>Conversation</h2>
            <IconButton icon="x" label="Close conversation" onClick={() => setDrawer(false)} />
          </header>
          <div
            ref={thread}
            className="min-h-0 min-w-[340px] flex-1 overflow-auto max-md:min-w-0 [scrollbar-gutter:stable]"
          >
            <DecisionBar
              decision={t.decision}
              needsProject={!t.dir || t.decision?.kind === "project"}
              projects={page.projects}
              pending={pending}
              onApprove={(decisionId) => void runAction("confirm", { decisionId })}
              onAnswer={(text) => (setDraft(text), void send())}
              onProject={(choice) => void runAction("project", choice)}
            />
            {!!t.files?.length && (
              <details className="mb-3">
                <summary className="cursor-pointer">Reference files · {t.files.length}</summary>
                <ul className="list-disc pl-5">
                  {t.files.map((f, i) => (
                    <li key={i} className="my-1">
                      {f.url && /^\/file\?/.test(f.url) ? (
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="underline">
                          {f.name}
                        </a>
                      ) : (
                        f.name
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div
              role="log"
              aria-label="Task conversation"
              aria-live="polite"
              aria-relevant="additions"
              className="flex flex-col gap-3 pb-2 pt-1"
            >
              {visibleMessages(t.messages).map((m) => (
                <ChatBubble
                  key={m.id}
                  from={m.role === "user" ? "user" : "agent"}
                  name={m.role === "user" ? "You" : m.role === "system" ? "kaizen" : "Assistant"}
                  at={m.at}
                  text={m.text}
                />
              ))}
            </div>
            {resume && (
              <div className="mb-2 flex justify-start px-1">
                <Button variant="primary" disabled={pending} onClick={() => void runAction("resume")}>
                  {t.status === "failed" ? "Retry" : "Resume"}
                </Button>
              </div>
            )}
            {t.status === "working" && <TypingDots />}
            {queue.length > 0 && (
              <div aria-label="Requests awaiting completion" className="mb-1.5 flex justify-end gap-1.5 px-1">
                {queue.map((i) => (
                  <span key={i.id} title={`Receipt ${i.id.slice(0, 8)}`} className="text-xs text-warning">
                    {i.state === "received" ? "Received" : "Queued for next pass"}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <form
        className="flex-none"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="flex items-end gap-2 rounded-lg border border-border bg-card py-2 pl-3.5 pr-2 shadow-sm focus-within:border-muted-foreground">
          <Textarea
            ref={input}
            rows={1}
            aria-label="Your message"
            aria-describedby="task-composer-help"
            placeholder="Message the agent"
            title="Enter to send, Shift+Enter for a new line"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter adds a line. A phone keyboard keeps Enter as a new line.
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                !matchMedia("(pointer:coarse)").matches
              ) {
                e.preventDefault();
                void send();
              }
            }}
            className="max-h-[140px] min-h-[30px] min-w-0 flex-1 py-1 [field-sizing:content]"
          />
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Sending…" : t.decision?.kind === "question" ? "Send answer" : "Send"}
          </Button>
        </div>
        <p id="task-composer-help" className="sr-only">
          {help}
        </p>
        <p role="status" className={cn("mx-0.5 mt-1.5 text-sm text-muted-foreground", !receipt && "hidden")}>
          {receipt}
        </p>
      </form>
      <ConfirmDialog
        open={!!confirm}
        title={confirm === "delete" ? "Delete this task?" : "Abandon this run?"}
        description={confirm === "delete" ? "It is not recorded anywhere." : "Saved files are not rolled back."}
        confirmLabel={confirm === "delete" ? "Delete" : "Abandon"}
        danger
        onCancel={() => setConfirm("")}
        onConfirm={() => {
          const op = confirm as string;
          setConfirm("");
          void finish(op, op === "abandon" ? { why: "abandoned from the task page" } : {});
        }}
      />
    </div>
  );
}
