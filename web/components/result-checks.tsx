import { checkLine, type TaskResult } from "../lib/task/index.ts";

// "Checks and limits": what was checked and what was not, and that accepting is not publishing.
export function ResultChecks({ result }: { result?: TaskResult }) {
  if (!result) return null;
  return (
    <details className="mb-2.5">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Checks and limits
      </summary>
      {!!result.checks?.length && (
        <ul className="mt-1.5 list-disc pl-5">
          {result.checks.map((c, i) => (
            <li key={i} className="my-[3px] text-sm text-muted-foreground">
              {checkLine(c)}
            </li>
          ))}
        </ul>
      )}
      {!!result.limitations?.length && (
        <ul className="mt-1.5 list-disc pl-5">
          {result.limitations.map((l, i) => (
            <li key={i} className="my-[3px] text-sm text-muted-foreground">
              {l}
            </li>
          ))}
        </ul>
      )}
      <p className="my-[3px] text-sm text-muted-foreground">
        Accepting a result does not publish it. A preview alone does not prove that a backend works.
      </p>
    </details>
  );
}
