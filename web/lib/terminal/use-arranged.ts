import { useMemo } from "react";
import { useNarrow } from "@lib/shared";
import { arrange } from "./layout.ts";
import { useTerminals } from "./terminal-store.ts";

// The tiles as the page shows them now: the sessions, the saved layout and a phone's pick, arranged.
export function useArranged() {
  const all = useTerminals((s) => s.all),
    lay = useTerminals((s) => s.lay),
    pick = useTerminals((s) => s.pick),
    phone = useNarrow();
  return { all, lay, phone, a: useMemo(() => arrange(all, lay, phone, pick), [all, lay, phone, pick]) };
}
