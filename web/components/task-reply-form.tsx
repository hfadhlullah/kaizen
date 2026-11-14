import { useRef } from "react";
import { toast } from "../lib/core/index.ts";
import { Button } from "../ui/button.tsx";
import { Textarea } from "../ui/textarea.tsx";
import { FormFrame } from "./form-frame.tsx";

// Answer a task's question in the agent's own words, as from the task page. An empty answer says so.
export function TaskReplyForm({
  question,
  busy,
  onCancel,
  onSend,
}: {
  question: string;
  busy?: boolean;
  onCancel: () => void;
  onSend: (text: string) => void;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  return (
    <FormFrame inline label="Reply">
      <div className="text-base font-medium">{question}</div>
      <div className="text-sm text-muted-foreground">Your answer goes to the agent, as from the task page.</div>
      <Textarea
        ref={ta}
        aria-label="Your answer"
        autoFocus
        className="min-h-18 rounded-sm border border-border bg-card px-3 py-2 hover:border-muted-foreground focus-visible:border-primary"
      />
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            const text = ta.current!.value.trim();
            if (text) return onSend(text);
            toast("Write your answer");
            ta.current!.focus();
          }}
        >
          Send
        </Button>
      </div>
    </FormFrame>
  );
}
