import { projectName, type ListedChat } from "@lib/home";
import { host, cn } from "@lib/core";
import { IconButton } from "@components/shared";

// The chats beside the conversation: title and project, a dot while the agent works, a bin on hover.
export function ChatList({
  chats,
  current,
  onOpen,
  onDelete,
}: {
  chats: ListedChat[];
  current?: string | null;
  onOpen: (id: string) => void;
  onDelete: (c: ListedChat) => void;
}) {
  return (
    <div className="flex h-full w-[260px] flex-col gap-2 py-3 pl-5 pr-2.5 max-[640px]:w-full">
      <div className="px-1.5 text-sm font-semibold text-muted-foreground">Chats</div>
      <nav aria-label="Chats" className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
        {chats.map((c) => (
          <div
            key={c.id}
            className={cn(
              "group flex items-center rounded-sm transition-colors hover:bg-muted",
              current === c.id && "bg-muted",
            )}
          >
            <button
              type="button"
              title={c.title}
              onClick={() => onOpen(c.id)}
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-px whitespace-nowrap px-2.5 py-[7px] text-left text-base",
                current === c.id ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span className="truncate">
                {c.busy && <span className="mr-1.5 inline-block size-[7px] rounded-full bg-running animate-hpulse" />}
                {c.title}
              </span>
              <span className="truncate text-xs opacity-80">
                {c.project ? projectName(c.project, host.projects()) : "No project"}
              </span>
            </button>
            <IconButton
              icon="trash"
              label={`Delete chat: ${c.title}`}
              className="size-(--btn-xs) opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              onClick={() => onDelete(c)}
            />
          </div>
        ))}
      </nav>
    </div>
  );
}
