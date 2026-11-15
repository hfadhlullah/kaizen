import { Toaster as Sonner } from "sonner";

// The one toaster, mounted once by each app (the board's portal, the Notebook's App). It looks like a Popover: the card
// colour, the soft border and the text colour of the page, in the app's own light or dark (`theme`, from the shell store),
// bottom left.
export const Toaster = ({ theme = "system" }: { theme?: "light" | "dark" | "system" }) => (
  <Sonner
    theme={theme}
    position="bottom-left"
    offset={{ left: 28, bottom: 56 }}
    mobileOffset={{ left: 16, bottom: 68 }}
    style={
      {
        "--normal-bg": "var(--bg-2)",
        "--normal-text": "var(--ink)",
        "--normal-border": "var(--line)",
        fontFamily: "var(--font)",
      } as React.CSSProperties
    }
    toastOptions={{
      className: "toast",
      style: { fontSize: "var(--fs)", borderRadius: "var(--r)", boxShadow: "var(--shadow-2)" },
    }}
  />
);
