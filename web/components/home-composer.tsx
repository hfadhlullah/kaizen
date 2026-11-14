import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { addFiles, removeFile, send, stop } from "../lib/home/index.ts";
import { pastedFiles } from "../lib/shared/index.ts";
import { cn } from "../lib/core/index.ts";
import { Icon } from "../ui/icon.tsx";
import { AttachButton } from "./attach-button.tsx";
import { IconButton } from "./icon-button.tsx";

const DK = "kz-d:";
const phone = () => matchMedia("(max-width:640px)").matches;
const saved = (k: string) => {
  try {
    return sessionStorage.getItem(DK + k) ?? "";
  } catch {
    return "";
  }
};

// The message box: a growing textarea, paper-clip, files waiting, where the chat lives, and Send (Stop while a reply runs).
// The text is a draft per chat (sessionStorage, the board's "kz-d:home:" keys), kept across reloads.
export function HomeComposer({
  chatId,
  files,
  working,
  sending,
  where,
}: {
  chatId: string | null;
  files: File[];
  working: boolean;
  sending: boolean;
  where?: string; // the project name shown on a chat that has messages
}) {
  const key = "home:" + (chatId ?? "new");
  const [text, setText] = useState(() => saved(key));
  const box = useRef<HTMLTextAreaElement>(null);
  // Another chat opened: its draft. A first message gaining its id while its reply runs is the same chat: what is typed
  // for the next message stays, and becomes that chat's draft.
  const was = useRef(key);
  useEffect(() => {
    const before = was.current;
    was.current = key;
    if (before === "home:new" && working) {
      change(text);
      try {
        sessionStorage.removeItem(DK + before);
      } catch {}
    } else setText(saved(key));
  }, [key]);
  // Grows with what is typed, up to 220 px.
  useLayoutEffect(() => {
    const t = box.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 220) + "px";
  }, [text]);
  const change = (v: string) => {
    setText(v);
    try {
      sessionStorage.setItem(DK + key, v);
    } catch {}
  };
  const submit = () => {
    const v = text;
    // A reply still running refuses a new message (send() ignores it): the text stays in the box until it can go.
    if ((!v.trim() && !files.length) || working || sending) return;
    setText("");
    void send(v);
  };
  // A suggestion fills the box; one that ends in a space waits for the rest.
  useEffect(() => {
    const on = (e: Event) => {
      const s = (e as CustomEvent<string>).detail;
      box.current?.focus();
      if (s.endsWith(" ")) return change(s);
      if (working || sending) return;
      setText("");
      void send(s);
    };
    addEventListener("kz-home-suggest", on);
    return () => removeEventListener("kz-home-suggest", on);
  });
  return (
    <form
      id="hbox"
      onSubmit={(e) => (e.preventDefault(), submit())}
      onDragOver={(e) => [...(e.dataTransfer?.types ?? [])].includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) (e.preventDefault(), addFiles([...e.dataTransfer.files]));
      }}
      style={{ viewTransitionName: "hbox" }}
      className="relative flex w-[calc(100%-40px)] max-w-[960px] items-end gap-2 rounded-[22px] border border-border bg-card py-2.5 pl-4 pr-2.5 shadow-md transition-[border-color,box-shadow] focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_15%,transparent),var(--shadow-2)] max-[640px]:w-[calc(100%-32px)] max-[640px]:order-2"
    >
      <AttachButton onFiles={addFiles} className={cn(sending && "pointer-events-none opacity-50")} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {!!files.length && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((f, n) => (
              <span
                key={n}
                className="inline-flex max-w-full items-center gap-[5px] rounded-full border border-border px-2 py-1 text-xs [overflow-wrap:anywhere]"
              >
                <Icon name="clip" className="size-3 flex-none" />
                {f.name}
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  className="px-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => removeFile(n)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          id="hq"
          ref={box}
          rows={1}
          value={text}
          aria-label="Message the agent"
          placeholder={phone() ? "Ask or describe what to build…" : "Ask anything, or describe what to build…"}
          onChange={(e) => change(e.target.value)}
          onPaste={(e) => {
            const f = pastedFiles(e);
            if (f.length) addFiles(f);
          }}
          onKeyDown={(e) => {
            // No Shift on a phone: Enter is a new line there, the Send button sends.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !phone())
              (e.preventDefault(), submit());
          }}
          className="max-h-[220px] min-h-6 w-full resize-none bg-transparent pb-[5px] pt-[7px] text-lg leading-normal text-foreground outline-none max-[640px]:text-[16px]"
        />
      </div>
      {where !== undefined && (
        <span
          title="Project"
          className="flex h-[34px] max-w-[30%] flex-none items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-muted-foreground"
        >
          <Icon name="board" className="size-[13px]" />
          {where}
        </span>
      )}
      {working ? (
        <IconButton
          id="hstop"
          icon="x"
          label="Stop"
          className="size-[34px] rounded-full bg-foreground text-background hover:bg-foreground hover:text-background"
          onClick={stop}
        />
      ) : (
        <IconButton
          icon="send"
          label="Send (Enter)"
          type="submit"
          className="size-[34px] rounded-full bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground hover:brightness-110 active:scale-90"
        />
      )}
    </form>
  );
}
