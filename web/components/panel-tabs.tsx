import { usePanel } from "../lib/run/index.ts";
import { cn } from "../lib/core/index.ts";
import { Icon } from "../ui/icon.tsx";

// The run panel's tabs: a column of icons beside the panel (the name is the tooltip and the accessible name), or, in a
// narrow window outside the run workspace, a row of words. Where the strip sits is the board's CSS (the `col` variant).
export function PanelTabs() {
  const tabs = usePanel((s) => s.tabs),
    tab = usePanel((s) => s.tab),
    pick = usePanel((s) => s.pickTab);
  return (
    <>
      {tabs.map((t) => (
        <button
          key={t.k}
          type="button"
          data-k={t.k}
          title={t.label}
          aria-label={t.label}
          aria-current={t.k === tab || undefined}
          onClick={() => pick(t.k)}
          className={cn(
            "whitespace-nowrap p-3 text-base font-medium text-muted-foreground hover:text-foreground",
            t.k === tab && "text-foreground shadow-[inset_0_-2px_var(--accent)]",
            "col:grid col:size-8 col:place-items-center col:rounded-sm col:p-0 col:shadow-none col:hover:bg-muted",
            t.k === tab && "col:bg-muted",
            "max-[640px]:[body.runv_&]:size-11",
          )}
        >
          <Icon sprite="t" name={t.k} className="hidden size-[17px] col:block" />
          <span className="col:sr-only">{t.label}</span>
        </button>
      ))}
    </>
  );
}
