import { TerminalBar, TerminalGrid } from "@components/terminal";
import { useTerminals } from "@lib/terminal";

// The Terminal page: every in-card agent session the board knows, Tasks to Done, tiled. Nothing is drawn until the page is
// first opened; after that the terminals stay mounted and connected, and CSS hides them on other pages, so a page switch
// keeps each one's screen, scrollback and focus. Sessions and layout are in lib/terminal; board/terms.ts feeds the sessions.
export function TerminalPage() {
  const seen = useTerminals((s) => s.seen);
  return seen ? (
    <>
      <TerminalBar />
      <TerminalGrid />
    </>
  ) : null;
}
