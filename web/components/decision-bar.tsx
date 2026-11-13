import { useState } from "react";
import { dirName, type TaskDecision, type TaskPageData } from "../lib/tasks.ts";
import { toast } from "../lib/toast.ts";
import { Button } from "../ui/button.tsx";
import { Field } from "./field.tsx";
import { InlineForm } from "./inline-form.tsx";
import { Picker } from "./picker.tsx";

const box = "mb-3 rounded-sm border border-[color:color-mix(in_srgb,var(--warn)_50%,var(--line))] p-3";
type Choice = { projectDir: string } | { name: string };
// What the agent is waiting on, with its one way forward: say which project the task belongs to, approve a plan,
// or pick an answer. Knows nothing about the page around it (the task page now, the run panel later): it takes
// the decision and callbacks.
export function DecisionBar({
  decision,
  needsProject,
  projects = [],
  pending,
  onApprove,
  onAnswer,
  onProject,
}: {
  decision?: TaskDecision | null;
  needsProject?: boolean;
  projects?: NonNullable<TaskPageData["projects"]>;
  pending?: boolean;
  onApprove: (decisionId: string) => void;
  onAnswer: (text: string) => void;
  onProject: (choice: Choice) => void;
}) {
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
              {d.options.map((o) => (
                <Button key={o} onClick={() => onAnswer(o)}>
                  {o}
                </Button>
              ))}
            </div>
          ) : null}
        </section>
      )}
    </>
  );
}
