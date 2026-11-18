import type { RefObject } from "react";
import { cn } from "@lib/core";
import { Icon, Textarea } from "@web/ui";

// The one message box: a rounded field and a round send button. Enter sends and Shift+Enter adds a line, except on a
// phone, where Enter stays a new line. `help` is read to a screen reader, `receipt` is the server's answer to the send.
export function Composer({
  inputRef,
  value,
  onChange,
  onSend,
  pending,
  answering,
  help,
  receipt,
  className,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  pending?: boolean;
  answering?: boolean;
  help: string;
  receipt?: string;
  className?: string;
}) {
  const label = pending ? "Sending…" : answering ? "Send answer" : "Send";
  return (
    <form
      className={cn("flex-none", className)}
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <div className="flex items-end gap-2 rounded-[22px] border border-border bg-card py-1.5 pl-4 pr-1.5 shadow-sm focus-within:border-muted-foreground">
        <Textarea
          ref={inputRef}
          rows={1}
          aria-label="Your message"
          aria-describedby="task-composer-help"
          placeholder="Message the agent"
          title="Enter to send, Shift+Enter for a new line"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              !matchMedia("(pointer:coarse)").matches
            ) {
              e.preventDefault();
              onSend();
            }
          }}
          className="max-h-[140px] min-h-[28px] min-w-0 flex-1 py-1 [field-sizing:content]"
        />
        <button
          type="submit"
          aria-label={label}
          title={label}
          disabled={pending}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-50"
        >
          <Icon name="send" className="size-4" />
        </button>
      </div>
      <p id="task-composer-help" className="sr-only">
        {help}
      </p>
      <p role="status" className={cn("mx-0.5 mt-1.5 text-sm text-muted-foreground", !receipt && "hidden")}>
        {receipt}
      </p>
    </form>
  );
}
