// Which layers sit over the page. A key handler asks before it acts on a page that a dialog or an open menu covers.
import { portalRoot } from "./utils.ts";

// The browser's own dialog element. The kit draws none (its dialogs are Radix divs in the portal), so this is false today; the
// shortcuts that ask keep the check they always had (R73: look at `layerOpen` for the kit's).
export const dialogOpen = () => !!document.querySelector("dialog[open]");
// A kit popup, menu or dialog is open (they draw in the page's portal container).
export const layerOpen = () => !!portalRoot()?.querySelector("[data-state=open]");
// The node is inside a dialog or the portal container: that layer handles its own keys.
export const inLayer = (el: Element) => !!el.closest("dialog") || !!portalRoot()?.contains(el);
