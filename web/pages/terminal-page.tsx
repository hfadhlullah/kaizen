import { TerminalBar, TerminalGrid } from "@components/terminal";
import { useTerminals } from "@lib/terminal";

// The Terminal page: every in-card agent session the board knows, Tasks to Done, tiled. Nothing is drawn (and no terminal
// is connected) while another view shows. Sessions and layout are in lib/terminal; board/terms.ts feeds the sessions.
export function TerminalPage() {
  const showing = useTerminals((s) => s.showing);
  return showing ? (
    <>
      <TerminalBar />
      <TerminalGrid />
    </>
  ) : null;
}
