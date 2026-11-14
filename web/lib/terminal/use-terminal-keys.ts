import { useEffect } from "react";
import { terminalLayout, useTerminals } from "./terminal-store.ts";
import { pickTerminal } from "./terminal-store.ts";

// Ctrl+Shift+M maximises or restores the tile being typed in. Alt+1…9 goes to the Nth tile; where one tile shows
// (maximised, or a phone's tabs) it switches which. Escape belongs to the agent, so the keys are read in capture, before
// xterm sends them on. Read by code, so the layout and Alt's own characters do not matter; Alt+arrows stay the shell's
// word jump. `focus` gives the typed-in terminal its cursor back after a header button took it.
export function useTerminalKeys(keys: string[], phone: boolean, focus: (key: string) => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const { lay } = useTerminals.getState();
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === "KeyM" && !phone) {
        const k = (e.target as HTMLElement).closest?.<HTMLElement>("[data-tile]")?.dataset.tile || lay.max;
        if (!k) return;
        e.preventDefault();
        e.stopPropagation();
        terminalLayout.toggleMax(k);
        focus(k);
        return;
      }
      const n = /^Digit([1-9])$/.exec(e.code)?.[1];
      if (!n || !e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;
      const k = keys[+n - 1];
      if (!k) return;
      e.preventDefault();
      e.stopPropagation();
      if (phone) pickTerminal(k);
      else terminalLayout.maxOn(k);
      focus(k);
    };
    addEventListener("keydown", on, true);
    return () => removeEventListener("keydown", on, true);
  }, [keys, phone, focus]);
}
