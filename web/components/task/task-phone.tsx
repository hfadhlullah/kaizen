import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActionMenu, IconButton } from "@components/shared";
import { DecisionBar, PlanText } from "@components/decision";
import { host } from "@lib/core";
import {
  conversationItems,
  projectLabel,
  runAction,
  savedLine,
  setDraft,
  taskStatus,
  type TaskModel,
  type TaskPageData,
  type TaskView,
} from "@lib/task";
import { BottomSheetContent, Button, Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@web/ui";
import { AgentChip } from "./agent-chip.tsx";
import { Composer } from "./composer.tsx";
import { Thread } from "./conversation.tsx";
import { ReferenceFiles } from "./reference-files.tsx";
import { ResultView } from "./result-view.tsx";
import { SavedResults } from "./saved-results.tsx";

// A phone's task: no tabs, the task is the chat. What waits on the person docks above the message box (the plan's
// Approve and Ask for changes, or Looks good), the detailed plan opens in a sheet, and the result is a card in the
// chat that opens full screen.
export function TaskPhone({
  page,
  t,
  m,
  permission,
}: {
  page: TaskPageData;
  t: TaskView;
  m: TaskModel;
  permission: ReactNode;
}) {
  const [plan, setPlan] = useState<string | null>(null),
    [full, setFull] = useState(false);
  const items = conversationItems(t),
    box = useRef<HTMLDivElement>(null);
  const ask = () => m.input.current?.focus();
  // The newest message, and the result card after it, are what a phone opens on.
  useEffect(() => {
    const el = box.current;
    if (el) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
  }, [items.length, !!m.selected, !!t.decision]);
  const waiting = !!t.decision || !t.dir;
  const result = m.selected;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <header className="flex flex-none items-center gap-1.5">
        <IconButton
          icon="arrow"
          label="Back to tasks"
          href="?view=tasks"
          className="[&_svg]:rotate-180"
          onClick={(e) => (e.preventDefault(), host.go("tasks", true))}
        />
        <div className="mr-auto min-w-0">
          <p className="truncate text-xs text-muted-foreground">{projectLabel(t, page.projects)}</p>
          <h1 className="truncate text-base font-semibold leading-snug">{m.title}</h1>
        </div>
        <ActionMenu label="Task actions" items={m.menu}>
          <p className="mb-2 text-sm text-muted-foreground">
            Task {t.id} · revision {t.revision}
          </p>
        </ActionMenu>
      </header>
      <div className="flex flex-none items-center gap-2">
        <div className="mr-auto min-w-0">
          <AgentChip agents={t.agents ?? []} stage={t.runStage} />
        </div>
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
        {m.start && (
          <Button
            size="sm"
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
      </div>
      {permission}
      <div ref={box} className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
        <ReferenceFiles files={t.files} />
        <Thread items={items} working={t.status === "working"} />
        {result && (
          <button
            type="button"
            onClick={() => setFull(true)}
            className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left"
          >
            <span className="min-w-0 flex-1">
              <b className="block truncate font-medium text-strong">{result.title || "The result"}</b>
              {result.summary && <span className="line-clamp-2 text-sm text-muted-foreground">{result.summary}</span>}
              <em className="mt-1.5 block text-sm not-italic">Open the result ›</em>
            </span>
          </button>
        )}
        {t.acceptedResultId && t.attention.category === "completed" && (
          <p className="mb-3 text-success">Accepted. Publishing is a separate action.</p>
        )}
        {m.queue.length > 0 && (
          <div aria-label="Requests awaiting completion" className="mb-1.5 flex justify-end gap-1.5 px-1">
            {m.queue.map((i) => (
              <span key={i.id} className="text-xs text-warning">
                {i.state === "received" ? "Received" : "Queued for next pass"}
              </span>
            ))}
          </div>
        )}
      </div>
      {waiting && (
        <div className="max-h-[45dvh] flex-none overflow-auto">
          <DecisionBar
            decision={t.decision}
            needsProject={!t.dir || t.decision?.kind === "project"}
            projects={page.projects}
            pending={m.pending}
            onApprove={(decisionId) => void runAction("confirm", { decisionId })}
            onAnswer={(text) => (setDraft(text), void m.send())}
            onProject={(choice) => void runAction("project", choice)}
            onAsk={ask}
            onDetails={setPlan}
          />
        </div>
      )}
      {m.accept && (
        <div className="flex flex-none flex-col gap-2 rounded-lg border border-border bg-card p-3">
          <p>
            <b className="font-medium text-strong">Ready for you.</b> Check the result, then accept it.
          </p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={ask}>
              Ask for a change
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => void runAction("accept", { resultId: t.currentResultId })}
            >
              Looks good
            </Button>
          </div>
        </div>
      )}
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
      <Sheet open={plan != null} onOpenChange={(o) => !o && setPlan(null)}>
        <BottomSheetContent>
          <SheetTitle>Detailed plan</SheetTitle>
          <SheetDescription className="sr-only">The steps the agent will take once you approve.</SheetDescription>
          {plan && <PlanText text={plan} className="mt-3" />}
        </BottomSheetContent>
      </Sheet>
      <Sheet open={full} onOpenChange={setFull}>
        <SheetContent className="w-full max-w-full border-l-0">
          <div className="flex flex-none items-center gap-2 px-3 py-2">
            <SheetClose asChild>
              <IconButton icon="x" label="Close the result" />
            </SheetClose>
            <SheetTitle className="mr-auto">Result</SheetTitle>
            <span className="text-xs text-muted-foreground">{savedLine(result)}</span>
          </div>
          <SheetDescription className="sr-only">The task's result.</SheetDescription>
          <div className="flex min-h-0 flex-1 flex-col overflow-auto px-3 pb-3">
            <SavedResults
              results={m.results}
              selectedId={m.selectedId}
              currentId={t.currentResultId}
              onPick={m.picked}
            />
            <ResultView
              result={result}
              artifactId={m.artifactId}
              working={t.status === "working" ? taskStatus(t) : undefined}
              stage={t.runStage}
              alive={t.agentAlive}
              waiting={t.status === "waiting"}
              onSelect={m.setArtifactId}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
