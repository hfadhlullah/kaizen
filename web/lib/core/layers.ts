// Which layers sit over the page. A key handler asks before it acts on a page that a dialog or an open menu covers.
import { portalRoot } from "./utils.ts";

// A kit popup, menu or dialog is open (they draw in the page's portal container).
export const layerOpen = () => !!portalRoot()?.querySelector("[data-state=open]");
// The node is inside a dialog or the portal container: that layer handles its own keys.
export const inLayer = (el: Element) => !!el.closest("dialog") || !!portalRoot()?.contains(el);
