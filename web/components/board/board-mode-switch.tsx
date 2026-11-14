import { setMode, useBoard } from "@lib/board";
import { useRoute } from "@lib/router";
import { Segmented } from "@components/shared";

// The Board header's Workspaces | Runs switch: which of the two views of the same work the Board shows.
export function BoardModeSwitch() {
  const mode = useBoard((b) => b.mode),
    board = useRoute((r) => r.view === "board");
  if (!board) return null;
  return (
    <Segmented
      label="Board mode"
      value={mode}
      onChange={setMode}
      options={[
        { id: "ws", label: "Workspaces" },
        { id: "runs", label: "Runs" },
      ]}
    />
  );
}
