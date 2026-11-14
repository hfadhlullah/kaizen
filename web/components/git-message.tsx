import { useLayoutEffect, useRef } from "react";
import { gitAct } from "../lib/git-actions.ts";
import { busyOf, useGit } from "../lib/git-store.ts";
import { cn } from "../lib/utils.ts";
import { Textarea } from "../ui/textarea.tsx";
import { IconButton } from "./icon-button.tsx";

// The commit message, with the AI button that writes one from the changes. It grows with its text; the first line
// over 72 characters says so.
export function GitMessage({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ta = useRef<HTMLTextAreaElement>(null),
    spark = useGit((s) => busyOf(s) === "spark");
  useLayoutEffect(() => {
    const t = ta.current!;
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight + 2, innerHeight / 2) + "px";
  }, [value]);
  return (
    <>
      <div className="relative">
        <Textarea
          ref={ta}
          aria-label="Commit message"
          placeholder="Message"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[calc(var(--row)*3)] resize-y rounded-sm border border-border bg-card py-2 pl-3 pr-8 hover:border-muted-foreground focus-visible:border-primary"
        />
        <IconButton
          icon="ai"
          label="Write a commit message from the changes"
          disabled={spark}
          onClick={() => void gitAct("spark")}
          className={cn(
            "absolute right-1.5 top-1.5 size-(--btn-xs) hover:text-primary [&_svg]:size-3.5",
            spark && "[&_svg]:motion-safe:animate-spin",
          )}
        />
      </div>
      {value.split("\n")[0]!.length > 72 && (
        <div className="text-sm text-muted-foreground">First line over 72 characters.</div>
      )}
    </>
  );
}
