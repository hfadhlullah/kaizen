import { createPortal } from "react-dom";
import { usePanel } from "../lib/run/index.ts";
import { FixForm } from "./fix-form.tsx";

// The Fix findings form stands in the review tab, in an element the panel's body keeps replacing; this follows it.
export function FixHost() {
  const slot = usePanel((s) => s.fix?.slot);
  return slot ? createPortal(<FixForm />, slot) : null;
}
