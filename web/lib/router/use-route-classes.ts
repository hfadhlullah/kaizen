import { useLayoutEffect } from "react";
import { isPhone } from "@lib/core";
import { bodyClasses } from "./route-rules.ts";
import { useRoute } from "./route-store.ts";

// The page the router names is the one the stylesheet shows: the <body> classes follow the route (and the phone menu).
export function useRouteClasses() {
  const view = useRoute((r) => r.view),
    menu = useRoute((r) => r.menu);
  useLayoutEffect(() => {
    const on = bodyClasses(view, isPhone());
    for (const [k, v] of Object.entries(on)) document.body.classList.toggle(k, v);
    document.body.classList.toggle("phone-menu-open", menu);
  }, [view, menu]);
}
