import { useRef } from "react";
import { toast } from "@lib/core";
import { Button, Textarea } from "@web/ui";
import { FormFrame } from "@components/shared";

const box =
  "min-h-18 rounded-sm border border-border bg-card px-3 py-2 hover:border-muted-foreground focus-visible:border-primary";
// Send a run back with a comment: what the plan or the work should do differently, or what Explore should look at
// further. An empty comment says so and keeps the form.
export function ReviseForm({
  kind,
  busy,
  onCancel,
  onSend,
}: {
  kind: "plan" | "review" | "explore";
  busy?: boolean;
  onCancel: () => void;
  onSend: (why: string) => void;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const send = () => {
    const why = ta.current!.value.trim();
    if (why) return onSend(why);
    // Explore's form has no hint: it simply waits for text.
    if (kind !== "explore") {
      toast("Say what should change");
      ta.current!.focus();
    }
  };
  if (kind === "explore")
    return (
      <FormFrame inline label="Explore feedback">
        <label className="flex flex-col gap-1.5 text-base font-medium">
          What should we explore further?
          <Textarea ref={ta} aria-label="Explore feedback" autoFocus className={box} />
        </label>
        <Button variant="primary" disabled={busy} onClick={send}>
          Continue Explore
        </Button>
      </FormFrame>
    );
  return (
    <FormFrame inline label="Revise">
      <div className="text-base font-medium">
        {kind === "plan" ? "What should the plan do differently?" : "What should change in the work?"}
      </div>
      <div className="text-sm text-muted-foreground">
        Opens your agent on this run with your comment.
        {kind === "plan"
          ? " It revises the plan and comes back here for approval."
          : " It changes the work, rechecks it and comes back here."}
      </div>
      <Textarea ref={ta} aria-label="Revise comment" autoFocus className={box} />
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" disabled={busy} onClick={send}>
          Send back
        </Button>
      </div>
    </FormFrame>
  );
}
