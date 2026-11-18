import type { RunDoc } from "@lib/task";

// The files the task's run changed, with how much each changed. Read-only: committing and pushing live in the run workspace.
export function ChangesView({ run, workspace }: { run: RunDoc | null; workspace?: string }) {
  if (!run?.files.length) return <p className="p-2 text-muted-foreground">No changed files yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Changed files" className="overflow-hidden rounded-lg border border-border bg-card">
        {run.files.map((f) => (
          <li key={f.path} className="flex items-baseline gap-3 border-b border-border px-3 py-2 last:border-b-0">
            <code className="min-w-0 flex-1 truncate font-mono text-sm" title={f.path}>
              {f.path}
            </code>
            {f.add > 0 && <span className="text-sm text-success">+{f.add}</span>}
            {f.del > 0 && <span className="text-sm text-danger">−{f.del}</span>}
          </li>
        ))}
      </ul>
      {workspace && (
        <a href={workspace} className="text-sm text-muted-foreground underline">
          Open in the run workspace
        </a>
      )}
    </div>
  );
}
