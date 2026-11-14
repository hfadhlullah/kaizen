import { answer, useAsk } from "../lib/core/index.ts";
import { ConfirmDialog } from "./confirm-dialog.tsx";

// Draws the question lib/core/ask.ts has open, if any. One per page that asks.
export function AskHost() {
  const open = useAsk((s) => s.open);
  return (
    <ConfirmDialog
      open={!!open}
      title={open?.title ?? ""}
      description={open?.description}
      confirmLabel={open?.confirmLabel ?? "OK"}
      danger={open?.danger}
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    />
  );
}
