import { useBoard } from "@lib/board";
import { Segmented } from "@components/shared";

// The Board header's Workspaces | Runs switch: which of the two views of the same work the Board shows.
export function BoardModeSwitch() {
  const s = useBoard((b) => b.modeSwitch);
  if (!s) return null;
  return (
    <Segmented
      label="Board mode"
      value={s.mode}
      onChange={s.set}
      options={[
        { id: "ws", label: "Workspaces" },
        { id: "runs", label: "Runs" },
      ]}
    />
  );
}
