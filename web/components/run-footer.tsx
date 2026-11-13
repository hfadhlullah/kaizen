import { setBoard } from "../lib/board-store.ts";
import { host } from "../lib/host.ts";
import { usePanel } from "../lib/panel-store.ts";
import { planQuestions } from "../lib/plan-questions.ts";
import { backToTask } from "../lib/run-actions.ts";
import {
  acceptRun,
  acceptTask,
  answerKey,
  answerTask,
  archiveCard,
  decided,
  decideRun,
  resumeRun,
  skipExplore,
} from "../lib/run-actions.ts";
import { DecisionBar, type RunActions } from "./decision-bar.tsx";

// The footer of a run's panel: the decision strip for the run in it. It is DecisionBar, the piece the task page uses
// for the same decisions, wired to the run actions the card's buttons use.
export function RunFooter() {
  const input = usePanel((s) => s.footer);
  if (!input) return null;
  const { card: c, plan, sourceControl } = input,
    // A plan that asks questions takes their answers with the approval; one the board cannot read is null.
    questions = c.status === "waiting" && c.awaiting === "approvals.plan" ? planQuestions(plan) : [],
    actions: RunActions = {
      decide: (why, answers) => decideRun(c, why, answers),
      accept: () => acceptRun(c),
      resume: () => resumeRun(c),
      skipExplore: () => skipExplore(c),
      looksGood: () => acceptTask(c),
      answer: (text) => answerTask(c, text),
      archive: (on) => void archiveCard(c, on),
      backToTask: () => void backToTask(c),
      abandon: () => setBoard({ popup: { kind: "form", mode: "reject", card: c } }),
      sourceControl: () => host.gitTab(c),
      form: (mode) => setBoard({ popup: { kind: "form", mode, card: c } }),
      run: () => setBoard({ popup: { kind: "run", card: c } }),
    };
  return (
    <DecisionBar
      // A different run, or the same run asking something else, starts the strip afresh.
      key={`${c.id}:${c.status}:${c.awaiting}`}
      layout="strip"
      card={c}
      answered={decided.has(answerKey(c))}
      questions={questions}
      sourceControl={sourceControl}
      actions={actions}
    />
  );
}
