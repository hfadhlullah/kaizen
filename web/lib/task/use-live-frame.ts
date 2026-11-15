import { useEffect, useState } from "react";
import { expose, frameable } from "@lib/core";
import { webUrl } from "./task-results.ts";

// A live preview's life: ask whether the site allows a frame, and for an address on this computer shown on
// another device ask the server to expose it. The workspace already checks frame headers and exposes local
// development ports; task previews use the same services, with an opaque sandbox.
type Live = { src: string; hidden: boolean; note: string; link: string; linkLabel?: string };
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/;
export function useLiveFrame(href: string) {
  const [s, set] = useState<Live>({
    src: "",
    hidden: true,
    note: "Checking preview availability… You can also use Open link.",
    link: href,
  });
  useEffect(() => {
    let live = true;
    const to = (p: Partial<Live>) => live && set((v) => ({ ...v, ...p }));
    (async () => {
      const original = webUrl(href);
      if (!original) return to({ hidden: true, note: "The preview address is unavailable." });
      let url = original,
        note = "Checking preview availability… You can also use Open link.";
      try {
        const check = await frameable(original);
        if (!live) return;
        if (check.frameable === false)
          return to({
            hidden: true,
            note: "This site refuses to appear inside kaizen. Use Open link to view it in another tab.",
          });
      } catch {
        note = "Preview availability could not be checked. Use Open link if it does not appear.";
      }
      let link = href;
      if (local.test(new URL(original).hostname) && !local.test(location.hostname)) {
        to({ hidden: true, note: "Opening this computer’s preview for this device…" });
        try {
          const exposed = await expose(original);
          if (!live) return;
          const ok = exposed.ok && webUrl(exposed.url);
          if (!ok)
            return to({
              hidden: true,
              linkLabel: "Open on computer",
              note: "This preview is on the computer running kaizen and could not be opened for this device. Open the task on that computer.",
            });
          url = ok;
          link = ok;
          note = exposed.hint || "Live preview. This address can change during later work.";
        } catch {
          return to({
            hidden: true,
            linkLabel: "Open on computer",
            note: "The preview could not be opened for this device. Open the task on the computer running kaizen.",
          });
        }
      }
      to({ src: url, hidden: false, note, link });
    })();
    return () => {
      live = false;
    };
  }, [href]);
  return {
    ...s,
    // Once the frame has loaded, a still-pending note says what to do if it looks empty.
    loaded: () =>
      set((v) =>
        v.note.startsWith("Checking")
          ? {
              ...v,
              note: "Live preview. If it does not appear, use Open link. Some apps require their own browser tab.",
            }
          : v,
      ),
    failed: () =>
      set((v) => ({
        ...v,
        hidden: true,
        note: "The live preview could not be opened. Use Open link or ask for a saved screenshot.",
      })),
  };
}
