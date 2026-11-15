import type { ReactElement } from "react";
import { sameName, type Board, type IceItem, setBoard } from "@lib/icebox";
import { ChoiceMenu } from "./choice-menu.tsx";
import { ClientMark } from "@components/shared";
import { Icon } from "@web/ui";

// A request's Collection menu: the Inbox, its project's collections, and a new one.
export function BoardMenu({ item, boards, children }: { item: IceItem; boards: Board[]; children: ReactElement }) {
  return (
    <ChoiceMenu
      label="Collection"
      choices={[
        { value: "", label: "Inbox", on: !item.board },
        ...boards
          .filter((b) => b.dir === item.dir)
          .map((b) => ({
            value: b.name,
            on: sameName(item.board, b.name),
            label: (
              <>
                {b.client && <ClientMark />}
                {b.name}
              </>
            ),
          })),
        {
          value: "\n",
          label: (
            <>
              <Icon name="plus" className="size-3.5" />
              New collection…
            </>
          ),
        },
      ]}
      onPick={(v) => void setBoard(item, v)}
    >
      {children}
    </ChoiceMenu>
  );
}
