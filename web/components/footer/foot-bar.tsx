import { ResourcesButton } from "@components/resources";
import { UsageChips } from "@components/phone";
import { host, cn } from "@lib/core";
import { loadUsage, terminalsTitle, useFooter } from "@lib/footer";
import { Icon } from "@web/ui";

const quiet =
  "flex items-center gap-1.5 rounded-sm px-[7px] py-[3px] text-muted-foreground hover:bg-muted hover:text-foreground";

// The board's footer (the page keeps the bar itself, `.foot`): Claude and Codex usage with a refresh, then the resource
// monitor, the live terminal count (a link to the Terminal page) and whether a phone is on the tailnet.
export function FootBar() {
  const usage = useFooter((s) => s.usage),
    phone = useFooter((s) => s.phone),
    terms = useFooter((s) => s.terms);
  return (
    <>
      <span className="flex min-w-0 items-center gap-3.5">{usage && <UsageChips list={usage} hover side="top" />}</span>
      {usage && usage.length > 0 && (
        <button
          type="button"
          className={quiet}
          title="Refresh usage"
          aria-label="Refresh usage"
          onClick={() => void loadUsage(true)}
        >
          <Icon name="refresh" className="size-[15px]" />
        </button>
      )}
      <span className="flex-1" />
      <span className="kz-keep contents">
        <ResourcesButton />
      </span>
      {terms > 0 && (
        <a
          href="/?view=terminal"
          className={quiet}
          title={terminalsTitle(terms)}
          onClick={(e) => {
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
            e.preventDefault();
            host.go("terminal", true);
          }}
        >
          <Icon name="term" className="size-[15px]" />
          <span>{terms}</span>
        </a>
      )}
      {phone && (
        <span className="flex items-center gap-1.5" title={phone.tip}>
          <Icon name="phone" className="size-[15px]" />
          <span className="max-[640px]:hidden">{phone.text}</span>
          <span
            className={cn(
              "size-[7px] rounded-full",
              phone.on ? "bg-success shadow-[0_0_6px_var(--ok)]" : "bg-muted-foreground",
            )}
          />
        </span>
      )}
    </>
  );
}
