import { useEffect, useState } from "react";
import type { Card } from "../lib/core/index.ts";
import type { PlanQuestion } from "../lib/decision/index.ts";
import { need, toast } from "../lib/core/index.ts";
import { APPROVAL } from "../lib/run/index.ts";
import { dirName, type TaskDecision, type TaskPageData } from "../lib/task/index.ts";
import { Button } from "../ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";
import { Field } from "./field.tsx";
import { InlineForm } from "./inline-form.tsx";
import { Picker } from "./picker.tsx";
import { PlanAnswersForm } from "./plan-answers-form.tsx";
import { ReviseForm } from "./revise-form.tsx";
import { TaskReplyForm } from "./task-reply-form.tsx";

const box = "mb-3 rounded-sm border border-[color:color-mix(in_srgb,var(--warn)_50%,var(--line))] p-3";
type Choice = { projectDir: string } | { name: string };
// What the agent is waiting on, with its one way forward. One component for both places that ask: the task page
// draws it as sections (say which project the task belongs to, approve a plan, pick an answer), and the run panel's
// footer draws it as a strip (approve or revise a plan or a review, answer a plan's questions, fix findings, a task's
// question, Looks good, resume, archive, abandon). It knows nothing about the page around it: it takes the
// decision and callbacks.
export function DecisionBar(p: SectionProps | StripProps) {
  return p.layout === "strip" ? <RunStrip {...p} /> : <TaskSections {...p} />;
}
// What the strip can ask the server for; each answers whether it went through (a failure keeps the form and its text).
export type RunActions = {
  decide: (why?: string, answers?: string[]) => Promise<boolean>;
  accept: () => Promise<boolean>;
  resume: () => Promise<boolean>;
  skipExplore: () => Promise<boolean>;
  looksGood: () => Promise<boolean>;
  answer: (text: string) => Promise<boolean>;
  archive: (archived: boolean) => void;
  backToTask: () => void;
  abandon: () => void;
  sourceControl: () => void;
  // A task's own footer: Edit, Reject, Delete (a form over the page) and Run (the run form).
  form: (mode: "edit" | "reject" | "delete") => void;
  run: () => void;
};
type StripProps = {
  layout: "strip";
  card: Card;
  answered: boolean; // already answered from here: the decision buttons wait for the agent to move the run on
  questions: PlanQuestion[] | null; // the plan's questions; null when the plan has some the board cannot read
  sourceControl: boolean; // git work is left on a finished run: point at the Source control tab
  actions: RunActions;
};
type SectionProps = {
  layout?: "section";
  decision?: TaskDecision | null;
  needsProject?: boolean;
  projects?: NonNullable<TaskPageData["projects"]>;
  pending?: boolean;
  onApprove: (decisionId: string) => void;
  onAnswer: (text: string) => void;
  onProject: (choice: Choice) => void;
};
// A question's options as buttons: one press is the answer.
function QuestionOptions({
  options,
  onPick,
  disabled,
}: {
  options: string[];
  onPick: (o: string) => void;
  disabled?: boolean;
}) {
  return options.map((o) => (
    <Button key={o} data-a="tq-opt" disabled={disabled} onClick={() => onPick(o)}>
      {o}
    </Button>
  ));
}
function TaskSections({ decision, needsProject, projects = [], pending, onApprove, onAnswer, onProject }: SectionProps) {
  const [dir, setDir] = useState("");
  const d = decision && decision.kind !== "project" ? decision : null;
  return (
    <>
      {needsProject && (
        <section className={box}>
          <h3 className="mb-2 text-base font-semibold">Where should this task belong?</h3>
          <p className="my-2">Your goal and files are saved. Choose a named project or create one.</p>
          <Field label="Project">
            {(p) => (
              <div className="flex flex-wrap gap-2">
                <Picker
                  label="Project"
                  options={projects.map((x) => ({ value: x.dir, label: dirName(x.name || x.label || x.dir) }))}
                  value={dir}
                  onChange={setDir}
                  placeholder="Choose a project"
                />
                <Button
                  id={p.id}
                  onClick={() => (dir ? onProject({ projectDir: dir }) : toast("Choose a named project first"))}
                >
                  Use project
                </Button>
              </div>
            )}
          </Field>
          <InlineForm
            label="New project name"
            placeholder="Community workshop"
            submitLabel="Create project"
            onSubmit={(name) => onProject({ name })}
          />
        </section>
      )}
      {d && (
        <section className={box} aria-labelledby="decision-title">
          <h3 id="decision-title" className="mb-2 text-base font-semibold">
            {d.kind === "proposal" ? "Approve the plan" : "Your answer is needed"}
          </h3>
          <p className="my-2 whitespace-pre-wrap break-words">{d.summary || d.text}</p>
          {d.summary && d.text !== d.summary && <p className="my-2 whitespace-pre-wrap break-words">{d.text}</p>}
          {d.details && (
            <details>
              <summary className="cursor-pointer">Detailed plan</summary>
              <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words bg-background p-3 font-mono text-sm">
                {d.details}
              </pre>
            </details>
          )}
          {d.kind === "proposal" ? (
            <>
              <Button variant="primary" className="mt-2" disabled={pending} onClick={() => onApprove(d.id)}>
                Approve plan
              </Button>
              <p className="my-2 text-muted-foreground">
                The build starts after you approve this plan. Ask for changes below if needed.
              </p>
            </>
          ) : d.options?.length ? (
            <div className="flex flex-wrap gap-1.5">
              <QuestionOptions options={d.options} onPick={onAnswer} />
            </div>
          ) : null}
        </section>
      )}
    </>
  );
}

// The run panel's footer: its note, the buttons that fit the run's state, and the forms they open in its place.
function RunStrip({ card: c, answered, questions, sourceControl, actions: a }: Omit<StripProps, "layout">) {
  const [mode, setMode] = useState<"idle" | "revise" | "answers" | "reply">("idle"),
    [busy, setBusy] = useState("");
  // A pressed button waits for the run to move on; a new state or question starts afresh.
  useEffect(() => setBusy(""), [c.status, c.awaiting, c.moved, c.accept, c.pty?.alive]);
  const go = async (id: string, fn: () => Promise<boolean>) => {
    setBusy(id);
    const ok = await fn();
    if (ok) setMode("idle");
    setBusy("");
  };
  const q = c.task?.question;
  // Forms replace the strip until sent or cancelled.
  if (mode === "revise")
    return (
      <ReviseForm
        kind={c.awaiting === "explore" ? "explore" : c.awaiting === "approvals.plan" ? "plan" : "review"}
        busy={!!busy}
        onCancel={() => setMode("idle")}
        onSend={(why) => void go("send", () => a.decide(why))}
      />
    );
  if (mode === "answers" && questions?.length)
    return (
      <PlanAnswersForm
        questions={questions}
        busy={!!busy}
        onCancel={() => setMode("idle")}
        onApprove={(answers) => void go("send", () => a.decide(undefined, answers))}
      />
    );
  if (mode === "reply" && q)
    return (
      <TaskReplyForm
        question={q.text}
        busy={!!busy}
        onCancel={() => setMode("idle")}
        onSend={(text) =>
          void go("send", async () => {
            const ok = await a.answer(text);
            if (ok) setMode("idle");
            return ok;
          })
        }
      />
    );
  const note = (t: React.ReactNode) => (
      <span className="basis-full text-sm leading-normal text-muted-foreground">{t}</span>
    ),
    dec = (...k: React.ReactNode[]) => <span className="ml-auto flex gap-2">{k}</span>,
    resumeSession =
      c.pty && !c.pty.alive ? (
        <Button data-a="resume" disabled={busy === "resume"} onClick={() => void go("resume", a.resume)}>
          Resume session
        </Button>
      ) : null,
    archive = (
      <>
        {sourceControl && (
          <Button data-a="gittab" onClick={a.sourceControl}>
            Source control
          </Button>
        )}
        {c.archived ? (
          <Button variant="primary" data-a="restore" onClick={() => a.archive(false)}>
            Restore
          </Button>
        ) : (
          <Button variant="ghost" data-a="archive" onClick={() => a.archive(true)}>
            Archive
          </Button>
        )}
      </>
    ),
    abandon = (
      <Button variant="ghost" data-a="ab" onClick={a.abandon}>
        Abandon
      </Button>
    ),
    approve = (label: string) => (
      <Button
        variant="primary"
        data-a="approve"
        disabled={answered || !!busy}
        onClick={() => (questions?.length ? setMode("answers") : void go("approve", () => a.decide()))}
      >
        {label}
      </Button>
    ),
    acceptBtn = (
      <Button
        variant="primary"
        data-a="accept"
        disabled={busy === "accept"}
        onClick={() => void go("accept", a.accept)}
      >
        Approve
      </Button>
    );
  let body: React.ReactNode;
  // A task (not yet a run): Run, Edit, Reject, Archive, Delete; once started, Run again.
  if (c.kind === "idea") {
    if (c.archived) body = archive;
    else if (c.status === "idea")
      body = (
        <>
          <Button variant="ghost" className="text-danger" data-a="delete" onClick={() => a.form("delete")}>
            Delete
          </Button>
          {archive}
          {dec(
            <Button data-a="reject" onClick={() => a.form("reject")}>
              Reject
            </Button>,
            <Button data-a="edit" onClick={() => a.form("edit")}>
              Edit
            </Button>,
            <Button variant="primary" data-a="run" onClick={a.run}>
              Run
            </Button>,
          )}
        </>
      );
    else
      body = (
        <>
          {note(
            c.pty
              ? "Starting: the agent runs below."
              : "Starting: a run was launched for this task. No terminal with your agent? Run it again.",
          )}
          {dec(
            <Button data-a="run" onClick={a.run}>
              Run again
            </Button>,
          )}
        </>
      );
  } else if (c.archived) body = archive;
  // A task's question, answered here as on the task page or in the agent's terminal.
  else if (q)
    body = (
      <>
        {note(
          <>
            <b>Question:</b> {q.text}
          </>,
        )}
        {resumeSession}
        {dec(
          <QuestionOptions options={q.options} disabled={!!busy} onPick={(o) => void go("tq", () => a.answer(o))} />,
          <Button variant="primary" data-a="tq-reply" onClick={() => setMode("reply")}>
            Reply
          </Button>,
        )}
      </>
    );
  // The task's Looks good on its finished run, for a run that had no review approval to give.
  else if (c.task?.accept && c.status === "done" && c.accept !== "needs")
    body = (
      <>
        {note("Result ready.")}
        {archive}
        {resumeSession}
        <Button
          variant="primary"
          data-a="looks-good"
          disabled={busy === "lg"}
          onClick={() => void go("lg", a.looksGood)}
        >
          Looks good
        </Button>
      </>
    );
  else if (c.healed && c.awaiting === "approvals.review")
    body = (
      <>
        {note("Finished by its agent without your approval. Nothing is committed until you approve.")}
        {archive}
        {resumeSession}
        {acceptBtn}
      </>
    );
  else if ((c.status === "waiting" || c.awaiting === "findings") && APPROVAL[c.awaiting ?? ""]) {
    const asks = !questions
      ? " Has questions: answer in its terminal."
      : questions.length
        ? ` ${questions.length === 1 ? "1 question" : questions.length + " questions"}.`
        : "";
    body = (
      <>
        {note(answered ? "Sent to your agent." : APPROVAL[c.awaiting!] + asks)}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost">More</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem data-a="archive" onSelect={() => a.archive(true)} className="text-foreground">
              Archive
            </DropdownMenuItem>
            {c.column === 1 && (
              <DropdownMenuItem data-a="toidea" onSelect={a.backToTask} className="text-foreground">
                Back to task
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem data-a="ab" onSelect={a.abandon} className="text-danger data-[highlighted]:text-danger">
              Abandon
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {resumeSession}
        {dec(
          <Button data-a="revise" disabled={answered} onClick={() => setMode("revise")}>
            Revise
          </Button>,
          approve(
            c.awaiting === "explore" ? "Continue to Plan" : c.awaiting === "findings" ? "Approve as-is" : "Approve",
          ),
        )}
      </>
    );
  } else if (c.status === "waiting")
    body = (
      <>
        {note(`Waiting: ${need(c.awaiting)}.`)}
        {archive}
        {abandon}
        {resumeSession}
      </>
    );
  else if (c.status === "done" && c.accept === "needs")
    body = (
      <>
        {note("Done, not approved: its agent finished without your approval. Nothing is committed until you approve.")}
        {archive}
        {resumeSession}
        {acceptBtn}
      </>
    );
  else if (c.status === "done")
    body = (
      <>
        {archive}
        {resumeSession}
      </>
    );
  else if (c.status === "abandoned") body = archive;
  else
    body = (
      <>
        {note(c.pty && !c.pty.alive ? "Agent ended early." : c.status === "stalled" ? "Stalled." : "")}
        {archive}
        {abandon}
        {c.status === "stalled" || (c.pty && !c.pty.alive) ? (
          <Button
            variant="primary"
            data-a="resume"
            disabled={busy === "resume"}
            onClick={() => void go("resume", a.resume)}
          >
            Resume
          </Button>
        ) : null}
      </>
    );
  return (
    <>
      {body}
      {c.stage === "explore" && (
        <Button data-a="skip-explore" disabled={busy === "skip"} onClick={() => void go("skip", a.skipExplore)}>
          Skip Explore
        </Button>
      )}
    </>
  );
}
