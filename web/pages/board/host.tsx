import type { ReactNode } from "react";
import { useRoute } from "@lib/router";

// Roots in the page's own elements: the element keeps its layout rules (the board's CSS lays it out and shows or hides it by
// <body> class set from the route); this div is where Tailwind's reset applies (`kz-ui`).
// `off`: kept mounted but not shown (a terminal of a card that is not on show).
export const Part = ({ children, off }: { children: ReactNode; off?: boolean }) => (
  <div className="kz-ui" style={{ display: off ? "none" : "contents" }}>
    {children}
  </div>
);
export const Fill = ({ children }: { children: ReactNode }) => (
  <div className="kz-ui" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
    {children}
  </div>
);
// A page is drawn the first time its view opens and kept after, so a hidden page costs nothing until it is wanted.
export const Once = ({ page, children }: { page: string; children: ReactNode }) =>
  useRoute((r) => r.seen.includes(page)) ? <>{children}</> : null;
