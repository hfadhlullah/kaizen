import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// The one way a component joins classes: later ones win a conflict (cn("p-2", "p-4") is p-4).
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

// Every popover, menu, select, picker, dialog and tooltip renders into this one container (board.html,
// class kz-ui), so the reset and the theme reach it and it sits above the board's own layers.
export const portalRoot = () =>
  typeof document === "undefined" ? undefined : (document.getElementById("kz-portal") ?? undefined);
