import { useEffect, useRef } from "react";
import {
  iceKey,
  type IceItem,
  cancelPromote,
  submitPromote,
  taskDraft,
  setIce,
  useIce,
} from "../../lib/icebox/index.ts";
import { Button } from "../../ui/button.tsx";
import { Icon } from "../../ui/icon.tsx";
import { fieldClass, Input } from "../../ui/input.tsx";
import { Textarea } from "../../ui/textarea.tsx";
import { cn } from "../../lib/core/index.ts";
import { Field } from "../shared/index.ts";

// Promote: a clean title for the task's card and the person's own details; what was gathered is added to the task's
// notes by the server. With ChatGPT connected it offers a draft, which never overwrites what the person typed.
export function PromoteForm({ item, chat }: { item: IceItem; chat: boolean }) {
  const k = iceKey(item),
    form = useIce((s) => (s.form?.k === k ? s.form : null)),
    t = useIce((s) => (s.task?.k === k ? s.task : null)),
    title = useRef<HTMLInputElement>(null),
    say = t?.wait
      ? "Drafting a task with ChatGPT…"
      : t?.kept
        ? "ChatGPT's draft came after you started typing, so your words stay. Redraft to use it."
        : t?.note
          ? `No draft: ${t.note}`
          : t?.title
            ? "Drafted by ChatGPT. Edit it before promoting."
            : "",
    set = (p: { title?: string; details?: string }) =>
      setIce({ form: { k, title: form?.title ?? item.text, details: form?.details ?? "", ...p } }),
    go = () => submitPromote(item) || title.current?.focus();
  useEffect(() => {
    title.current?.focus();
    title.current?.select();
  }, []);
  return (
    <div className="grid gap-1.5 border-t border-border pt-2">
      <Field label="Task title">
        {(p) => (
          <Input
            {...p}
            ref={title}
            maxLength={200}
            value={form?.title ?? item.text}
            onChange={(e) => set({ title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") go();
              if (e.key === "Escape") cancelPromote();
            }}
          />
        )}
      </Field>
      <Field label="Details">
        {(p) => (
          <Textarea
            {...p}
            rows={t?.details ? 5 : 3}
            value={form?.details ?? ""}
            onChange={(e) => set({ details: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) go();
              if (e.key === "Escape") cancelPromote();
            }}
            className={cn(fieldClass, "h-auto resize-y bg-card py-1.5")}
          />
        )}
      </Field>
      {say && (
        <span role="status" className="text-sm text-muted-foreground">
          {say}
        </span>
      )}
      <div className="flex items-center gap-1.5">
        {chat && (
          <Button
            variant="ghost"
            size="sm"
            disabled={t?.wait}
            title="Ask ChatGPT for another draft"
            onClick={() => {
              setIce({ task: null });
              void taskDraft(item);
            }}
          >
            <Icon name="ai" className="size-3.5" />
            {t?.title ? "Redraft" : "Draft with ChatGPT"}
          </Button>
        )}
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={cancelPromote}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={go}>
          Promote
        </Button>
      </div>
    </div>
  );
}
