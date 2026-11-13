import { useState } from "react";
import type { PlanQuestion } from "../lib/plan-questions.ts";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { FormFrame } from "./form-frame.tsx";

// The plan's questions, answered with the approval: the recommended option preselected (else the first, for a single
// choice), a note for what the options miss. Each answer reaches the agent as one line: `question — "label"; note`.
export function PlanAnswersForm({
  questions,
  busy,
  onCancel,
  onApprove,
}: {
  questions: PlanQuestion[];
  busy?: boolean;
  onCancel: () => void;
  onApprove: (answers: string[]) => void;
}) {
  const initial = (x: PlanQuestion) =>
    x.options.flatMap((o, j) => (o.rec || (!x.multi && !j && !x.options.some((p) => p.rec)) ? [j] : []));
  const [picked, setPicked] = useState(() => questions.map(initial)),
    [notes, setNotes] = useState(() => questions.map(() => ""));
  const toggle = (i: number, j: number, multi: boolean) =>
    setPicked((p) =>
      p.map((v, k) => (k !== i ? v : multi ? (v.includes(j) ? v.filter((x) => x !== j) : [...v, j]) : [j])),
    );
  const approve = () =>
    onApprove(
      questions.map((x, i) => {
        const names = picked[i]!.map((j) => `"${x.options[j]!.label}"`).join(", ") || "none of the options",
          note = notes[i]!.trim();
        return `${x.q} — ${names}${note ? "; " + note : ""}`;
      }),
    );
  return (
    <div className="max-h-[60vh] min-w-0 flex-1 overflow-auto">
      <FormFrame inline label="Plan questions">
        <div className="text-base font-medium">
          The plan asks {questions.length === 1 ? "one question" : questions.length + " questions"}.
        </div>
        <div className="text-sm text-muted-foreground">
          Your answers go to your agent with the approval. It records them and builds the plan.
        </div>
        {questions.map((x, i) => (
          <fieldset key={i} className="flex flex-col gap-1">
            <legend className="text-base font-medium">{x.q}</legend>
            {x.options.map((o, j) => (
              <label key={j} className="flex items-baseline gap-2 text-base">
                <input
                  type={x.multi ? "checkbox" : "radio"}
                  name={`q${i}`}
                  checked={picked[i]!.includes(j)}
                  onChange={() => toggle(i, j, x.multi)}
                  className="relative top-0.5 shrink-0 accent-primary"
                />
                {o.text}
              </label>
            ))}
            <Input
              placeholder="Note (optional)"
              aria-label={`Note: ${x.q}`}
              value={notes[i]}
              onChange={(e) => setNotes((n) => n.map((v, k) => (k === i ? e.target.value : v)))}
            />
          </fieldset>
        ))}
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={approve}>
            Approve with these answers
          </Button>
        </div>
      </FormFrame>
    </div>
  );
}
