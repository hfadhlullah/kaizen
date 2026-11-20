import { cardOpen, closeWhatsNew, shownEntry, useWhatsNew } from "@lib/settings";
import { Button } from "@web/ui";

// What's New, inline under About (not a dialog): the big improvements first, the fixes below, then Got it. Modelled on iOS's What's New:
// a short title and a version, each highlight a bold name over one grey line, one full-width button.
export function WhatsNewCard() {
  const s = useWhatsNew();
  const e = shownEntry(s.data),
    waiting = !!s.data?.next;
  if (!e || !cardOpen(s)) return null;
  return (
    <section
      aria-label="What's new"
      data-whats-new
      className="mb-6 rounded-lg border border-border bg-card px-[26px] py-[22px] text-base"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div
            role="heading"
            aria-level={2}
            className="text-[22px] font-extrabold leading-tight tracking-tight text-strong"
          >
            What's New in kaizen
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            Version {e.version}
            {waiting ? ` · ready to install, you have ${s.data!.version}` : ""}
          </div>
        </div>
        <button
          type="button"
          className="px-0.5 py-1 text-sm text-muted-foreground underline underline-offset-[3px] hover:text-foreground"
          onClick={() => void closeWhatsNew()}
        >
          Hide
        </button>
      </div>
      {e.highlights.map((h) => (
        <div key={h.title} className="mb-[18px]">
          <b className="block text-[15px] font-semibold leading-snug text-strong">{h.title}</b>
          <span className="mt-px block text-sm leading-[1.4] text-muted-foreground">{h.text}</span>
        </div>
      ))}
      {e.fixes.length > 0 && (
        <div className="mt-1.5 border-t border-border pt-4">
          <b className="mb-1.5 block text-[15px] font-semibold text-strong">Fixes</b>
          <ul className="m-0 list-disc pl-[18px] text-sm leading-normal text-muted-foreground">
            {e.fixes.map((f) => (
              <li key={f} className="my-0.5">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
      <a
        className="mt-3.5 inline-block text-sm text-foreground underline underline-offset-[3px]"
        href="https://github.com/hfadhlullah/kaizen/releases"
        target="_blank"
        rel="noopener"
      >
        Full release notes
      </a>
      <Button
        variant="primary"
        className="mt-4 w-full justify-center py-2.5 text-[15px] font-semibold"
        onClick={() => void closeWhatsNew()}
      >
        Got it
      </Button>
    </section>
  );
}
