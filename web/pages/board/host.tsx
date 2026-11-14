import type { ReactNode } from "react";
import { useShell } from "@lib/shell";

// Roots in the page's own elements: the element keeps its layout rules (the board's CSS lays it out and shows or hides it by
// <body> class); this div is where Tailwind's reset applies (`kz-ui`).
export const Part = ({ children }: { children: ReactNode }) => (
  <div className="kz-ui" style={{ display: "contents" }}>
    {children}
  </div>
);
export const Fill = ({ children }: { children: ReactNode }) => (
  <div className="kz-ui" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
    {children}
  </div>
);
// A page is drawn the first time its view opens and kept after, so a hidden page costs nothing until it is wanted.
export const Once = ({ page, children }: { page: string; children: ReactNode }) => (useShell((s) => s.seen.includes(page)) ? <>{children}</> : null);
