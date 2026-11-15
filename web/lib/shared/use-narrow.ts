import { useSyncExternalStore } from "react";

// True under 640 px, where the Icebox has no cards, no sources button and phone-sized rows; follows a window
// crossing the line.
const q = typeof matchMedia === "function" ? matchMedia("(max-width:640px)") : null;
export const useNarrow = () =>
  useSyncExternalStore(
    (cb) => (q?.addEventListener("change", cb), () => q?.removeEventListener("change", cb)),
    () => !!q?.matches,
    () => false,
  );
