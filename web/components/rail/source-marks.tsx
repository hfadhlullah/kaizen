import { useMemo, useState } from "react";
import { marksOf, type SourceMark } from "@lib/rail";
import { useServer } from "@lib/server";

// A favicon that does not load leaves no broken image behind.
const Mark = ({ m }: { m: SourceMark }) => {
  const [broken, setBroken] = useState(false);
  if (m.kind !== "icon")
    return (
      <svg aria-hidden="true">
        <use href={m.id} />
      </svg>
    );
  return broken ? null : (
    <img src={m.id} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  );
};
export function SourceMarks() {
  const sources = useServer((s) => s.sources?.sources);
  return useMemo(() => marksOf(sources), [sources]).map((m) => <Mark key={m.id} m={m} />);
}
