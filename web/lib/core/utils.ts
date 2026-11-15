import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// The one way a component joins classes: later ones win a conflict (cn("p-2", "p-4") is p-4).
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

// Every popover, menu, select, picker, dialog and tooltip renders into one container: the board's `#kz-portal` (pages/board/portal.tsx)
// or the Notebook's `#kz-kit` (pages/notebook/App.tsx), both class kz-ui, so the reset and the theme reach it and it sits above
// the page's own layers. The page's component hands its element over (`setPortalRoot` as the ref); nothing looks it up by id.
let portal: HTMLElement | undefined;
export const setPortalRoot = (el: HTMLElement | null) => void (portal = el ?? undefined);
export const portalRoot = () => portal;

// Phone width: under it the board shows Home and Runs pages, and the Home window opens full screen.
export const isPhone = () => matchMedia("(max-width:640px)").matches;
