import { useEffect, useRef } from "react";
import { ChatList } from "../components/chat-list.tsx";
import { HomeComposer } from "../components/home-composer.tsx";
import { HomeMessage } from "../components/home-message.tsx";
import { projectName, SUGGEST } from "../lib/home.ts";
import { deleteChat, setSide, show, useHome } from "../lib/home-store.ts";
import { host } from "../lib/host.ts";
import { cn } from "../lib/utils.ts";
import { IconButton } from "../components/icon-button.tsx";

// Home: the chat list beside a conversation with kaizen's main agent. A new chat starts in the project picked above
// (none in All projects); the board follows the open chat. Requests and state are in lib/home-store.ts.
export function HomePage() {
  const s = useHome(),
    log = useRef<HTMLDivElement>(null),
    following = useRef(true);
  const { cur, chats, side, sending, remoteBusy, files, here } = s;
  const empty = !cur || !cur.messages.length;
  const working = sending || remoteBusy;
  const name = (d: string) => projectName(d, host.projects());
  const id = cur?.id ?? null;
  // Scrolling up pauses auto-follow until the reader reaches the bottom again; another chat starts at the bottom.
  useEffect(() => void (following.current = true), [id]);
  useEffect(() => {
    const el = log.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  });
  const phone = matchMedia("(max-width:640px)").matches;
  return (
    <>
      <div
        className={cn(
          "flex-none overflow-hidden border-r border-border/60 transition-[width,opacity,border-color] duration-300",
          side ? "w-[260px]" : "w-0 border-transparent opacity-0",
          "max-[640px]:absolute max-[640px]:inset-y-0 max-[640px]:left-0 max-[640px]:z-[6] max-[640px]:w-[280px] max-[640px]:max-w-[85%] max-[640px]:bg-card max-[640px]:opacity-100 max-[640px]:shadow-md max-[640px]:transition-transform",
          side ? "max-[640px]:translate-x-0" : "max-[640px]:-translate-x-[105%]",
        )}
      >
        <ChatList
          chats={chats}
          current={id}
          onOpen={(c) => (phone && setSide(false), void show(c))}
          onDelete={(c) => void deleteChat(c.id, c.title)}
        />
      </div>
      {side && (
        <div
          className="absolute inset-0 z-[5] hidden bg-[var(--shade)] max-[640px]:block"
          onClick={() => setSide(false)}
        />
      )}
      <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col items-center gap-3 pb-4", empty && "justify-start")}>
        <div className="flex items-center gap-1 self-stretch px-4 pt-2 max-[640px]:hidden">
          <IconButton
            id="htog"
            icon="side"
            label={side ? "Hide chats" : "Show chats"}
            aria-expanded={side}
            onClick={() => setSide(!side)}
          />
        </div>
        <div
          id="hlog"
          ref={log}
          aria-live="polite"
          onWheel={(e) => {
            const el = log.current!;
            if (e.deltaY < 0 && el.scrollHeight > el.clientHeight) following.current = false;
          }}
          onScroll={() => {
            const el = log.current!;
            following.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 0.5;
          }}
          className={cn(
            "box-border flex w-full flex-col gap-4 px-[max(20px,calc((100%-960px)/2))] py-2 [overflow-anchor:none] max-[640px]:px-4",
            empty ? "mt-auto flex-none max-[640px]:my-auto" : "flex-1 overflow-y-auto",
          )}
        >
          {empty ? (
            <div className="w-full text-center animate-hin">
              <h2 className="mb-1.5 text-[28px] font-semibold tracking-[-0.01em] text-strong max-[640px]:text-[22px]">
                {here ? `What should we do in ${name(here)}?` : "What should we work on?"}
              </h2>
              <p className="text-muted-foreground">
                {here
                  ? "Ask about this project or another one, or start a new one."
                  : "Name a project, or describe a new one and the agent will set it up."}{" "}
                Bigger work becomes a kaizen run on the Board.
              </p>
            </div>
          ) : (
            cur!.messages.map((m, i) => (
              <HomeMessage key={`${id}:${i}`} m={m} last={i === cur!.messages.length - 1} busy={working} />
            ))
          )}
        </div>
        <HomeComposer
          chatId={id}
          files={files}
          working={working}
          sending={sending}
          where={empty ? undefined : cur!.project ? name(cur!.project) : "No project"}
        />
        {empty && (
          <div className="flex w-[calc(100%-40px)] max-w-[960px] flex-wrap justify-center gap-2 animate-hin mb-auto max-[640px]:order-1 max-[640px]:mb-0 max-[640px]:w-full max-[640px]:flex-nowrap max-[640px]:justify-start max-[640px]:overflow-x-auto max-[640px]:px-4 [&::-webkit-scrollbar]:hidden">
            {SUGGEST.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => dispatchEvent(new CustomEvent("kz-home-suggest", { detail: t }))}
                className="flex-none whitespace-nowrap rounded-full px-3 py-1.5 text-base text-muted-foreground transition hover:-translate-y-px hover:bg-muted hover:text-foreground"
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
