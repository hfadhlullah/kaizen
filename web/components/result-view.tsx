import { isImage, isLegacyResult, storedUrl, webUrl, type TaskResult } from "../lib/task-results.ts";
import { cn } from "../lib/utils.ts";
import { Spinner } from "../ui/spinner.tsx";
import { ArtifactView } from "./artifact-view.tsx";

// What the task made: the building state, an empty promise, or the selected result with its outputs rail and
// the viewer for the selected output. `working` is the status line shown while the agent builds.
export function ResultView({
  result,
  artifactId,
  working,
  onSelect,
}: {
  result?: TaskResult;
  artifactId?: string;
  working?: string;
  onSelect: (id: string) => void;
}) {
  if (!result && working)
    return (
      <div
        role="status"
        className="grid min-h-60 place-content-center justify-items-center gap-1.5 p-5 text-center text-muted-foreground"
      >
        <Spinner className="mb-1.5" />
        <h3 className="font-semibold text-foreground">The agent is building</h3>
        <p className="line-clamp-3 max-w-[52ch]">{working}</p>
      </div>
    );
  if (!result)
    return (
      <div className="grid min-h-60 place-content-center p-5 text-center text-muted-foreground">
        <h3 className="mb-2 font-semibold text-foreground">Your result will appear here</h3>
        <p>Answer any questions in the conversation. You approve a short plan before the build starts.</p>
      </div>
    );
  const artifacts = result.artifacts ?? [],
    selected = artifacts.find((a) => a.id === artifactId) ?? artifacts[0],
    legacy = isLegacyResult(result),
    rail = artifacts.length > 1;
  const live = result.liveUrl && !artifacts.some((a) => a.url === result.liveUrl) && webUrl(result.liveUrl);
  return (
    <>
      <header className="mb-3.5">
        {!legacy && <h2 className="mb-1 text-[16px] font-semibold">{result.title}</h2>}
        {result.summary && !legacy && <p className="mb-1 text-muted-foreground">{result.summary}</p>}
      </header>
      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-4",
          rail &&
            "grid-cols-[200px_minmax(0,1fr)] max-[700px]:grid-cols-[minmax(0,1fr)] max-[700px]:grid-rows-[auto_minmax(0,1fr)]",
        )}
      >
        {rail && (
          <nav
            role="group"
            aria-label="Outputs"
            className="flex min-h-0 flex-col gap-0.5 overflow-auto pr-1 max-[700px]:flex-row max-[700px]:overflow-x-auto max-[700px]:overflow-y-hidden max-[700px]:pb-1 max-[700px]:pr-0"
          >
            {artifacts.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={a.id === selected?.id}
                onClick={() => onSelect(a.id)}
                className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-2.5 rounded-sm p-1.5 text-left text-sm leading-[1.35] text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground max-[700px]:min-w-14 max-[700px]:grid-cols-[44px]"
              >
                {isImage(a) ? (
                  <img
                    src={storedUrl(a.url) ?? undefined}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="size-11 rounded-xs border border-border bg-card object-cover object-top"
                  />
                ) : (
                  <i className="grid size-11 place-items-center rounded-xs border border-border bg-card text-[10px] uppercase not-italic">
                    {(a.name.split(".").pop() || "file").slice(0, 4)}
                  </i>
                )}
                <span className="line-clamp-2 overflow-hidden max-[700px]:hidden">{a.name}</span>
              </button>
            ))}
          </nav>
        )}
        <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-auto">
          {selected ? (
            <ArtifactView artifact={selected} selected />
          ) : (
            <p className="text-warning">No saved file was published for this result.</p>
          )}
          {live && (
            <ArtifactView
              artifact={{ id: "live", name: "Live website", kind: "website", url: result.liveUrl }}
              selected
            />
          )}
        </div>
      </div>
    </>
  );
}
