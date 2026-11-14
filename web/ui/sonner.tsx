import { Toaster as Sonner } from "sonner";

// The one toaster, mounted once by the board's App (web/pages/board/portal.tsx). Looks like the board's old toast: the
// ink colour with the page colour as text, bottom left.
export const Toaster = () => (
  <Sonner
    position="bottom-left"
    offset={{ left: 28, bottom: 56 }}
    mobileOffset={{ left: 16, bottom: 68 }}
    style={
      {
        "--normal-bg": "var(--ink)",
        "--normal-text": "var(--bg)",
        "--normal-border": "transparent",
        fontFamily: "var(--font)",
      } as React.CSSProperties
    }
    toastOptions={{
      className: "toast",
      style: { fontSize: "var(--fs)", borderRadius: "var(--r)", boxShadow: "var(--shadow-2)" },
    }}
  />
);
