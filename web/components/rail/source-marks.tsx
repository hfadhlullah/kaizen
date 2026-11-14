import { useState } from "react";
import { useSourceMarks, type SourceMark } from "@lib/rail";

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
export const SourceMarks = () => useSourceMarks((s) => s.marks).map((m) => <Mark key={m.id} m={m} />);
