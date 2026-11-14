import { useRef, useState } from "react";
import { cardKey, type Card, host, toast } from "../../lib/core/index.ts";
import { deleteTask, moveTask, rejectCard, saveEdit } from "../../lib/board/index.ts";
import { pastedFiles, useDraft } from "../../lib/shared/index.ts";
import { short } from "../../lib/icebox/index.ts";
import { Button } from "../../ui/button.tsx";
import { Input } from "../../ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select.tsx";
import { Textarea } from "../../ui/textarea.tsx";
import { AttachButton, FormFrame, MicButton } from "../shared/index.ts";

const q = "text-base font-medium",
  dim = "text-sm font-normal text-muted-foreground",
  area =
    "min-h-18 rounded-sm border border-border bg-card px-3 py-2 hover:border-muted-foreground focus-visible:border-primary";
type Mode = "edit" | "reject" | "delete" | "move";
// Edit, Reject (a task or backlog item) or Abandon (a run), Delete and Move over the card they act on: inline in its
// column, or in a dialog when asked from a panel. `onDone` closes it (cancelled or done).
export function CardForm({
  card,
  mode,
  inline,
  onDone,
}: {
  card: Card;
  mode: Mode;
  inline?: boolean;
  onDone: () => void;
}) {
  const k = cardKey(card),
    title = useRef<HTMLInputElement>(null),
    notes = useRef<HTMLTextAreaElement>(null),
    why = useRef<HTMLInputElement>(null),
    [files, setFiles] = useState<File[]>([]),
    [t0, saveT] = useDraft(`f:${mode}:${k}:0`, card.text ?? ""),
    [t1, saveN] = useDraft(`f:${mode}:${k}:1`, card.notes ?? ""),
    [w0, saveW] = useDraft(`f:${mode}:${k}:0`, ""),
    others = host.projects().filter((p) => p.dir !== card.state),
    [to, setTo] = useState(others[0]?.dir ?? ""),
    task = card.kind !== "run";
  const keep = (
    <Button variant="ghost" onClick={onDone}>
      {mode === "edit" || mode === "move" ? "Cancel" : "Keep it"}
    </Button>
  );
  if (mode === "edit") {
    const save = async () => {
      if (await saveEdit(card, title.current!.value.trim(), notes.current!.value.trim(), files)) onDone();
    };
    return (
      <FormFrame inline={inline} label="Edit task">
        <Input
          ref={title}
          aria-label="Task"
          defaultValue={t0}
          autoFocus
          onInput={(e) => saveT(e.currentTarget.value)}
          onPaste={(e) => setFiles([...files, ...pastedFiles(e)])}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.preventDefault(), void save());
            if (e.key === "Escape") (e.stopPropagation(), onDone());
          }}
        />
        <Textarea
          ref={notes}
          aria-label="Notes"
          className={area}
          placeholder="Anything the planner should know"
          defaultValue={t1}
          onInput={(e) => saveN(e.currentTarget.value)}
          onPaste={(e) => setFiles([...files, ...pastedFiles(e)])}
        />
        {files.length > 0 && (
          <div className="text-sm text-muted-foreground">{files.map((f) => f.name).join(" · ")}</div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <AttachButton className="mr-auto" onFiles={(fs) => setFiles([...files, ...fs])} />
          <MicButton field={title} also={[notes]} />
          {keep}
          <Button variant="primary" onClick={() => void save()}>
            Save
          </Button>
        </div>
      </FormFrame>
    );
  }
  if (mode === "reject") {
    const send = () => {
      const w = why.current!.value.trim();
      if (!w) return void toast("A reason is required");
      onDone();
      void rejectCard(card, w);
    };
    return (
      <FormFrame inline={inline} label={task ? "Reject" : "Abandon"}>
        <div className={q}>
          {card.kind === "backlog" ? "Not doing this backlog item?" : task ? "Reject this task?" : "Abandon this run?"}{" "}
          The reason is recorded.
        </div>
        <Input
          ref={why}
          aria-label="Reason"
          placeholder="Why not?"
          defaultValue={w0}
          autoFocus
          onInput={(e) => saveW(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.preventDefault(), send());
            if (e.key === "Escape") (e.stopPropagation(), onDone());
          }}
        />
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <MicButton field={why} />
          {keep}
          <Button className="border-warning text-warning" onClick={send}>
            {task ? "Reject" : "Abandon"}
          </Button>
        </div>
      </FormFrame>
    );
  }
  if (mode === "delete")
    return (
      <FormFrame inline={inline} label="Delete task">
        <div className={q}>Delete "{card.text}"?</div>
        <div className={dim}>Not recorded anywhere.</div>
        <div className="flex justify-end gap-1.5">
          {keep}
          <Button
            variant="danger"
            onClick={() => {
              onDone();
              void deleteTask(card);
            }}
          >
            Delete
          </Button>
        </div>
      </FormFrame>
    );
  return (
    <FormFrame inline={inline} label="Move task">
      <div className={q}>Move "{card.text}" to</div>
      <Select value={to} onValueChange={setTo}>
        <SelectTrigger aria-label="Project">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {others.map((p) => (
            <SelectItem key={p.dir} value={p.dir} title={p.label}>
              {short(p.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex justify-end gap-1.5">
        {keep}
        <Button
          variant="primary"
          onClick={() => {
            const p = others.find((x) => x.dir === to);
            onDone();
            if (p) void moveTask(card, to, short(p.label));
          }}
        >
          Move
        </Button>
      </div>
    </FormFrame>
  );
}
