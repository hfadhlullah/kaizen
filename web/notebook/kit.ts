// Entry of web/dist/notebook-kit.js: the kit components the Notebook page opens in place, mounted once in a root of
// their own, and the side menu's Projects list and filter. Loaded by kit-loader.ts (when the page starts); the page hands over what only it knows (the Projects list, where a
// new workspace opens) through `setHost` and calls the stores below, which live in this bundle.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Toaster, TooltipProvider } from "@web/ui";
import { SearchPalette } from "@components/search";
import { AddProjectDialog, WsMenu } from "@components/project";
import { AskHost } from "@components/shared";
import { RailFilter, RailList } from "@components/rail";
import { ask, setHost, toast } from "@lib/core";
import { openAdd, openWsMenu } from "@lib/project";
import { setRailData, touchRail } from "@lib/rail";
import { useSearch } from "@lib/search";

const kit = { useSearch, openAdd, openWsMenu, ask, toast, setHost, rail: { set: setRailData, touch: touchRail } };
export type Kit = typeof kit;

// Like the board's #kz-portal: a kz-ui container the popups render into, with the React root in a div of its own.
const portal = document.createElement("div");
portal.id = "kz-kit";
portal.className = "kz-ui";
const el = document.createElement("div");
portal.append(el);
document.body.append(portal);
createRoot(el).render(
  createElement(
    TooltipProvider,
    null,
    createElement(Toaster),
    createElement(AskHost),
    createElement(SearchPalette),
    createElement(WsMenu),
    createElement(AddProjectDialog),
  ),
);
// The side menu's Projects list and filter fill the page's own elements (#plist, #pfilter-host), outside the kz-ui portal.
for (const [id, part] of [
  ["plist", RailList],
  ["pfilter-host", RailFilter],
] as const) {
  const host = document.getElementById(id);
  if (host) createRoot(host).render(createElement(TooltipProvider, null, createElement(part)));
}
window.kzKit = kit;
