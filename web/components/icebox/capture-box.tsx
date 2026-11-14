import { useEffect, useRef } from "react";
import {
  sameName,
  short,
  type Board,
  pickCaptureBoard,
  saveCapture,
  patchCap,
  useIce,
} from "../../lib/icebox/index.ts";
import { useNarrow } from "../../lib/shared/index.ts";
import { Button, Icon, Textarea } from "@web/ui";
import { ClientMark, IconButton, MicButton, Picker, ProjectMark } from "../shared/index.ts";

const NEW = "\n";
// The capture box: what is typed, pasted, attached or dictated lands in the icebox on the picked collection. In All
// projects it names the project too. `to` is the project it saves to, `projects` the choice (empty when the board
// shows one project), `boards` that project's collections.
export function CaptureBox({
  to,
  projects,
  boards,
  board,
}: {
  to: string | null;
  projects: { dir: string; label: string }[];
  boards: Board[];
  board: string;
}) {
  const cap = useIce((s) => s.cap),
    narrow = useNarrow(),
    ta = useRef<HTMLTextAreaElement>(null),
    file = useRef<HTMLInputElement>(null),
    focus = () => ta.current?.focus();
  // What the store holds is what shows: a saved note empties the field.
  useEffect(() => {
    if (ta.current && ta.current.value !== cap.text) ta.current.value = cap.text;
  }, [cap.text]);
  const add = (fs: File[]) => {
    patchCap({ files: [...useIce.getState().cap.files, ...fs] });
    focus();
  };
  const save = () => void saveCapture(to, focus);
  return (
    <div className="mb-3.5 mt-1 flex flex-col gap-1.5 rounded-lg border border-border bg-card py-3 pr-3 pl-4 shadow-sm transition-[border-color,box-shadow] focus-within:border-[color-mix(in_srgb,var(--accent)_60%,var(--line))] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_12%,transparent)] max-sm:mb-2.5 max-sm:rounded-md max-sm:py-2.5 max-sm:pr-2.5 max-sm:pl-3.5">
      <Textarea
        ref={ta}
        id="ice-cap-t"
        rows={2}
        defaultValue={cap.text}
        readOnly={cap.busy}
        aria-label="Drop anything into the icebox"
        placeholder={narrow ? "Drop a note, link or picture…" : "Drop anything: a note, a link, a picture — or dictate"}
        onInput={(e) => patchCap({ text: e.currentTarget.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            save();
          }
        }}
        // A pasted picture is a file; pasted text stays text.
        onPaste={(e) => {
          for (const it of e.clipboardData.items)
            if (it.kind === "file") {
              const x = it.getAsFile()!;
              e.preventDefault();
              add([new File([x], x.name === "image.png" ? `paste-${Date.now()}.png` : x.name, { type: x.type })]);
            }
        }}
        className="max-h-60 min-h-12 [field-sizing:content] py-0.5 text-[14px] leading-[1.55] read-only:opacity-60 max-sm:min-h-6 max-sm:text-[15px]"
      />
      {cap.files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {cap.files.map((f, n) => (
            <span
              key={n}
              className="inline-flex max-w-[260px] items-center gap-1 rounded-sm border border-border py-0 pr-0.5 pl-2 text-sm text-muted-foreground"
            >
              <Icon name="clip" className="size-3" />
              <span className="truncate">{f.name}</span>
              <IconButton
                icon="x"
                label={`Remove ${f.name}`}
                className="size-6"
                onClick={() => {
                  patchCap({ files: cap.files.filter((_, i) => i !== n) });
                  focus();
                }}
              />
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 max-sm:flex-nowrap max-sm:gap-0.5">
        <IconButton
          icon="clip"
          label="Attach files"
          className="size-[30px] border border-border max-sm:size-11 max-sm:border-0"
          onClick={() => file.current?.click()}
        />
        <input
          ref={file}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const fs = [...(e.target.files ?? [])];
            e.target.value = "";
            add(fs);
          }}
        />
        <MicButton
          field={ta}
          className="[&>button]:size-[30px] [&>button]:rounded-sm [&>button]:border [&>button]:border-border max-sm:[&>button]:size-11 max-sm:[&>button]:border-0"
        />
        {projects.length > 0 && (
          <Picker
            label="Project"
            placeholder="Choose project"
            className="h-[30px] text-sm max-sm:h-[30px] max-sm:max-w-[120px] max-sm:border-transparent max-sm:bg-muted"
            value={to ?? ""}
            options={projects.map((p) => ({
              value: p.dir,
              label: short(p.label),
              search: p.label,
              icon: <ProjectMark dir={p.dir} label={p.label} />,
            }))}
            onChange={(v) => patchCap({ dir: v })}
          />
        )}
        <Picker
          label="Collection"
          className="h-[30px] text-sm max-sm:max-w-[120px] max-sm:border-transparent max-sm:bg-muted"
          value={board}
          options={[
            { value: "", label: "Inbox" },
            ...boards.map((b) => ({ value: b.name, label: b.name, icon: b.client ? <ClientMark /> : undefined })),
            ...(board && !boards.some((b) => sameName(b.name, board))
              ? [{ value: board, label: `${board} (new)` }]
              : []),
            { value: NEW, label: "New collection…", icon: <Icon name="plus" className="size-3.5" /> },
          ]}
          onChange={async (v) => {
            await pickCaptureBoard(v, to);
            focus();
          }}
        />
        <span className="flex-1" />
        <Button
          variant="primary"
          size="sm"
          aria-label="Save to the icebox"
          disabled={cap.busy}
          onClick={save}
          className="h-[30px] px-3.5 max-sm:size-11 max-sm:min-w-11 max-sm:rounded-full max-sm:p-0"
        >
          <Icon name="send" className="hidden size-[17px] max-sm:block" />
          <span className="max-sm:sr-only">{cap.busy ? "Saving…" : "Save ↵"}</span>
        </Button>
      </div>
    </div>
  );
}
