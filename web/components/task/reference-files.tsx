import type { TaskView } from "@lib/task";

// The files the person attached to the task, as links the board can serve.
export function ReferenceFiles({ files }: { files?: TaskView["files"] }) {
  if (!files?.length) return null;
  return (
    <details className="mb-3">
      <summary className="cursor-pointer">Reference files · {files.length}</summary>
      <ul className="list-disc pl-5">
        {files.map((f, i) => (
          <li key={i} className="my-1">
            {f.url && /^\/file\?/.test(f.url) ? (
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="underline">
                {f.name}
              </a>
            ) : (
              f.name
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
