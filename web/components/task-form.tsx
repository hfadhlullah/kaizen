import { useRef, useState } from "react";
import { addTask, taskDirs } from "../lib/board/index.ts";
import { pastedFiles, useDraft } from "../lib/shared/index.ts";
import { short } from "../lib/icebox/index.ts";
import { startDir, toast } from "../lib/core/index.ts";
import { Button } from "../ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu.tsx";
import { Icon } from "../ui/icon.tsx";
import { Input } from "../ui/input.tsx";
import { Label } from "../ui/label.tsx";
import { Textarea } from "../ui/textarea.tsx";
import { AttachButton } from "./attach-button.tsx";
import { FormFrame } from "./form-frame.tsx";
import { MicButton } from "./mic-button.tsx";
import { Picker } from "./picker.tsx";
import { ProjectMark } from "./project-mark.tsx";

// The last project a new task went to, offered first next time.
let lastDir: string | null = null;
// The new-task form, inline at the top of the Tasks column or in a dialog. `picking` shows the project choice (All
// projects, another page's call, a phone); `preset` is the project that page wants, `choose` makes a choice required
// even when the preset is not offered. Add posts the task; the menu beside it adds and then opens its Run form.
export function TaskForm({
  inline,
  picking,
  preset,
  choose,
  onDone,
}: {
  inline?: boolean;
  picking: boolean;
  preset: string | null;
  choose: boolean;
  onDone: () => void;
}) {
  const dirs = taskDirs(),
    title = useRef<HTMLInputElement>(null),
    notes = useRef<HTMLTextAreaElement>(null),
    [t0, saveT] = useDraft("f:new:0"),
    [t1, saveN] = useDraft("f:new:1"),
    [files, setFiles] = useState<File[]>([]),
    [dir, setDir] = useState<string | null>(() =>
      startDir(
        dirs.map((p) => p.dir),
        preset ?? lastDir,
        choose,
      ),
    ),
    [pickOpen, setPickOpen] = useState(false);
  const save = (run: boolean) => {
    const text = title.current!.value.trim();
    if (!text) return;
    if (picking && !dir) {
      toast("Choose a project for this task");
      return setPickOpen(true);
    }
    onDone();
    void addTask(text, notes.current!.value.trim(), picking ? dir : null, files, run);
  };
  const paste = (e: React.ClipboardEvent) => setFiles((f) => [...f, ...pastedFiles(e)]);
  return (
    <FormFrame inline={inline} label="New task">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">New task</h2>
        {picking && (
          <Picker
            label="Project for this task"
            placeholder="Choose project"
            value={dir ?? ""}
            open={pickOpen}
            onOpenChange={setPickOpen}
            options={dirs.map((p) => ({
              value: p.dir,
              label: short(p.label),
              search: p.label,
              icon: <ProjectMark dir={p.dir} label={p.label} />,
            }))}
            onChange={(v) => {
              lastDir = v;
              setDir(v);
              title.current?.focus();
            }}
          />
        )}
      </div>
      <Input
        ref={title}
        id="newidea"
        aria-label="Task"
        placeholder="What do you want to build?"
        defaultValue={t0}
        autoFocus
        onInput={(e) => saveT(e.currentTarget.value)}
        onPaste={paste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) (e.preventDefault(), save(false));
          if (e.key === "Escape") (e.preventDefault(), onDone());
        }}
      />
      <Label htmlFor="newnotes" className="mt-0.5 font-normal">
        Anything the planner should know <span className="text-muted-foreground">(optional)</span>
      </Label>
      <Textarea
        ref={notes}
        id="newnotes"
        className="h-21 min-h-21 rounded-sm border border-border bg-card px-3 py-2 hover:border-muted-foreground focus-visible:border-primary"
        placeholder="Context, constraints, examples, and what a good result looks like"
        defaultValue={t1}
        onInput={(e) => saveN(e.currentTarget.value)}
        onPaste={paste}
      />
      {files.length > 0 && <div className="text-sm text-muted-foreground">{files.map((f) => f.name).join(" · ")}</div>}
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <AttachButton className="mr-auto" onFiles={(fs) => setFiles((f) => [...f, ...fs])} />
        <MicButton field={title} also={[notes]} />
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <div className="inline-flex">
          <Button variant="primary" className="rounded-r-none" onClick={() => save(false)}>
            Add
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="primary"
                className="rounded-l-none border-l-[color-mix(in_srgb,var(--on-accent)_30%,transparent)] px-2"
                aria-label="More ways to add"
              >
                <Icon name="chev" className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem title="Add the task and run it now" onSelect={() => save(true)}>
                <Icon name="play" className="size-[15px]" />
                Start run
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </FormFrame>
  );
}
