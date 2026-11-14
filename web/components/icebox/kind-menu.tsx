import type { ReactElement } from "react";
import { KIND, type IceItem, setOne } from "@lib/icebox";
import { ChoiceMenu } from "./choice-menu.tsx";

// A request's Kind menu: Client, Finding or People say; the one set by hand is marked (not one a rule set).
export function KindMenu({ item, children }: { item: IceItem; children: ReactElement }) {
  return (
    <ChoiceMenu
      label="Kind"
      choices={Object.entries(KIND).map(([value, label]) => ({
        value,
        label,
        on: item.kind === value && item.sorted !== "rules",
      }))}
      onPick={(v) => void setOne(item, { op: "kind", kind: v }, `Kind: ${KIND[v]}`)}
    >
      {children}
    </ChoiceMenu>
  );
}
