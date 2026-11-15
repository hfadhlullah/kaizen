// "+3 -1": lines added and removed, nothing when both are 0.
export function GitCounts({ add, del }: { add: number; del: number }) {
  if (!add && !del) return null;
  return (
    <span className="inline-flex gap-1.5 font-mono text-xs">
      <i className="not-italic text-success">+{add}</i>
      <i className="not-italic text-danger">-{del}</i>
    </span>
  );
}
