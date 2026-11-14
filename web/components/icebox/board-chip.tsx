import type { Board } from "@lib/icebox";
import { Chip, ClientMark } from "@components/shared";

// A collection in the bar: its name and what waits on it; a client's collection carries a person mark.
export function BoardChip({
  board,
  count,
  pressed,
  onPress,
}: {
  board: Board;
  count: number;
  pressed: boolean;
  onPress: () => void;
}) {
  return (
    <Chip
      count={count}
      pressed={pressed}
      onPressedChange={onPress}
      title={board.client ? "A client's collection: its items are Client" : undefined}
    >
      {board.client && <ClientMark />}
      <span>{board.name}</span>
    </Chip>
  );
}
