// Half-typed text outlives a redraw and a page reload, per tab (sessionStorage, the old board's "kz-d:" keys, form
// drafts under "f:"). A closed form leaves no draft behind.
import { useState } from "react";

const DK = "kz-d:";
export function useDraft(k: string, init = ""): [string, (v: string) => void] {
  const [v] = useState(() => {
    try {
      return sessionStorage.getItem(DK + k) ?? init;
    } catch {
      return init;
    }
  });
  return [
    v,
    (x) => {
      try {
        sessionStorage.setItem(DK + k, x);
      } catch {}
    },
  ];
}
export function clearDrafts(prefix: string) {
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith(DK + prefix)) sessionStorage.removeItem(k);
  } catch {}
}
// Files pasted into a field (a picture is a file; pasted text stays text), named as the old forms named them.
export function pastedFiles(e: { clipboardData: DataTransfer; preventDefault(): void }): File[] {
  const out: File[] = [];
  for (const it of e.clipboardData.items)
    if (it.kind === "file") {
      const f = it.getAsFile()!;
      out.push(new File([f], f.name === "image.png" ? `paste-${Date.now()}.png` : f.name, { type: f.type }));
      e.preventDefault();
    }
  return out;
}
