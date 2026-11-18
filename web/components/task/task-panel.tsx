import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { PanelFrame, PanelPicker, PanelProgress, PanelStrip, StateDot, type PanelStripItem } from "@components/shared";
import { openTask, taskDot } from "@lib/rail";
import { useServer } from "@lib/server";
import { cleanRequest, conversationItems, taskProgress, taskTitle, type TaskView } from "@lib/task";
import { AgentChip } from "./agent-chip.tsx";
import { ReferenceFiles } from "./reference-files.tsx";
import { Thread } from "./conversation.tsx";

type View = "chat" | "request" | "files";
const STRIP: PanelStripItem[] = [
  { id: "chat", icon: "request", label: "Conversation" },
  { id: "request", icon: "notes", label: "The request" },
  { id: "files", icon: "book", label: "Files" },
];

// The task page's right panel in the run workspace panel's frame: the task as a picker, its progress, the agent on it, the
// conversation (or the request, or the files) as the body, the message box and the quiet Archive and Abandon at the foot,
// and an icon strip down the edge. The strip folds the panel to itself. `controls` are Resume and Stop, `footer` the box.
export function TaskPanel({
  t,
  folded,
  onFold,
  controls,
  threadRef,
  footer,
  actions,
  after,
  focusChat,
  dot,
  projectName,
}: {
  t: TaskView;
  folded: boolean;
  onFold: (folded: boolean) => void;
  controls?: ReactNode;
  threadRef: RefObject<HTMLDivElement | null>;
  footer: ReactNode;
  actions: ReactNode;
  after?: ReactNode; // under the thread: the requests waiting for the agent
  focusChat?: number; // raised when the page opens the conversation itself (a send, Ask for changes)
  dot?: boolean;
  projectName: string;
}) {
  const [view, setView] = useState<View>("chat"),
    tasks = useServer((s) => s.tasks),
    items = conversationItems(t),
    progress = taskProgress(t),
    mine = (tasks ?? []).filter((x) => x.dir === t.dir),
    mineAll = mine.some((x) => x.id === t.id) ? mine : [{ ...t, attention: t.attention } as never, ...mine],
    pick = (id: string) => {
      if (!folded && id === view) return onFold(true);
      setView(id as View);
      onFold(false);
    };
  // The page opening the conversation (a send, Ask for changes) shows the Conversation view, at its newest message.
  useEffect(() => {
    if (focusChat) setView("chat");
  }, [focusChat]);
  useEffect(() => {
    const el = threadRef.current?.parentElement;
    if (view === "chat" && !folded && el) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
  }, [view, folded, items.length, threadRef]);
  const header = (
    <div className="flex flex-col gap-1.5">
      <PanelPicker
        current={taskTitle(t)}
        mark={<StateDot state={taskDot(t as never)} />}
        items={mineAll.map((x) => ({
          id: x.id,
          label: taskTitle(x),
          mark: <StateDot state={taskDot(x)} />,
          hint: x.attention.reason,
        }))}
        onPick={(id) => id !== t.id && openTask(id, t.dir)}
      />
      <div className="flex items-center gap-2.5">
        <span className="max-w-[120px] shrink-0 truncate text-xs text-muted-foreground">{projectName}</span>
        <PanelProgress {...progress} />
      </div>
      <div className="flex min-h-9 items-center gap-2">
        <div className="mr-auto min-w-0">
          <AgentChip agents={t.agents ?? []} stage={t.runStage} />
        </div>
        {controls}
      </div>
    </div>
  );
  const body =
    view === "request" ? (
      <p className="whitespace-pre-wrap break-words text-base">{cleanRequest(t.goal) || t.title}</p>
    ) : view === "files" ? (
      t.files?.length ? (
        <ReferenceFiles files={t.files} />
      ) : (
        <p className="text-muted-foreground">No files are attached to this task.</p>
      )
    ) : (
      <div ref={threadRef}>
        <ReferenceFiles files={t.files} />
        <Thread items={items} working={t.status === "working"} />
        {after}
      </div>
    );
  return (
    <PanelFrame
      label={folded ? "Conversation, collapsed" : "Conversation and requests"}
      folded={folded}
      header={header}
      body={body}
      foot={
        <>
          {footer}
          <div className="mt-2 flex gap-1.5">{actions}</div>
        </>
      }
      strip={
        <PanelStrip
          items={STRIP.map((s) => (s.id === "chat" ? { ...s, dot } : s))}
          active={view}
          folded={folded}
          onPick={pick}
        />
      }
    />
  );
}
