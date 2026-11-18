import { Markdown } from "@components/markdown";
import { cn } from "@lib/core";

// An agent's plan as plain, tidy reading: headings are small grey labels, lists have room between their items.
// The plan is the agent's own text, so this styles what is there and does not rearrange it. The board's old `section h2`
// rule (a sticky bar) would catch a plan inside a card, so the first rule line sets that back.
export function PlanText({ text, className }: { text: string; className?: string }) {
  return (
    <Markdown
      text={text}
      className={cn(
        "text-base leading-relaxed [&_:is(h1,h2)]:static [&_:is(h1,h2)]:block [&_:is(h1,h2)]:h-auto [&_:is(h1,h2)]:bg-transparent [&_:is(h1,h2)]:p-0 [&_:is(h1,h2)]:shadow-none [&_h1]:mb-1 [&_h1]:mt-4 [&_h1]:text-sm [&_h1]:font-medium [&_h1]:text-muted-foreground [&_h2]:mb-1 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-medium [&_h2]:text-muted-foreground [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-muted-foreground [&_li]:my-1.5 [&_ol]:pl-5 [&_ul]:pl-5",
        className,
      )}
    />
  );
}
