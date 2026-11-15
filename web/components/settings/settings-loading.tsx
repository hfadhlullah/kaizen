import { Skeleton } from "@web/ui";
import { PageFrame } from "@components/layout";

// The Settings page while it loads: its sidebar and a card of rows, so nothing jumps when it arrives.
export function SettingsLoading() {
  return (
    <PageFrame
      title="Settings"
      phone="sidebar"
      sidebar={
        <div aria-busy="true" aria-label="Loading" className="flex flex-col px-3 pt-[18px]">
          <Skeleton className="mb-6 h-8 w-3/5" />
          <Skeleton className="mb-6 h-8 w-full" />
          {[4, 3, 4].map((n, g) => (
            <div key={g} className="mb-5 grid gap-0.5">
              <Skeleton className="mx-3 mb-3 h-[11px] w-2/5" />
              {Array.from({ length: n }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ))}
        </div>
      }
    >
      <div className="px-[clamp(16px,5vw,56px)] pt-9">
        <div className="mx-auto max-w-[720px]">
          <Skeleton className="mb-2 h-7 w-[30%]" />
          <Skeleton className="mb-6 h-3.5 w-[55%]" />
          <div className="rounded-lg border border-border bg-card px-3.5 py-1">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i}>
                <Skeleton className="mb-1.5 mt-3 h-[13px] w-[70%]" />
                <Skeleton className="mb-3 h-[11px] w-[45%]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageFrame>
  );
}
