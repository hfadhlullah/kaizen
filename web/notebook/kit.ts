// What the Notebook page lends the code the board and Video bundles share (workspace.ts, search.ts): its kit stores,
// registered as `window.kzKit` before anything asks (kit-loader.ts), which hands over what only the page knows through
// `setHost`. The popups themselves are drawn by the page (pages/notebook/App.tsx). notebook.ts calls `registerKit()` once at
// start, except in ?embed=1, where there is no side menu to search from or list projects in.
import { ask, setHost, toast } from "@lib/core";
import { openAdd, openWsMenu } from "@lib/project";
import { setRailData, touchRail } from "@lib/rail";
import { useSearch } from "@lib/search";

const kit = { useSearch, openAdd, openWsMenu, ask, toast, setHost, rail: { set: setRailData, touch: touchRail } };
export type Kit = typeof kit;

export const registerKit = () => void (window.kzKit ??= kit);
