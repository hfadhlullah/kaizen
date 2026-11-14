import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// The one way a component joins classes: later ones win a conflict (cn("p-2", "p-4") is p-4).
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

// Every popover, menu, select, picker, dialog and tooltip renders into this one container (board.html,
// class kz-ui), so the reset and the theme reach it and it sits above the board's own layers. The Notebook page's
// container is #kz-kit (notebook/kit.ts, mounted by the Notebook page); only the board has #kz-portal, which pages test to know they are the board.
export const portalRoot = () =>
  typeof document === "undefined"
    ? undefined
    : (document.getElementById("kz-portal") ?? document.getElementById("kz-kit") ?? undefined);

// Phone width: under it the board shows Home and Runs pages, and the Home window opens full screen.
export const isPhone = () => matchMedia("(max-width:640px)").matches;
