// The Terminal page as state (Zustand): the sessions the board knows (pushed by board/terms.ts on every change), the saved
// layout (kz-terms, persisted on each change) and the page's own picks. The rules are in layout.ts.
import { create } from "zustand";
import { LAY_KEY, readLay, swapOrder, trimLay, type Lay, type Mode, type Session, type Sizes } from "./layout.ts";

export type TerminalState = {
  showing: boolean; // the Terminal page is the view
  seen: boolean; // it has been opened: its tiles are mounted from then on and only hidden (by CSS) on other pages
  all: Map<string, Session>;
  lay: Lay;
  pick: string | null; // a phone shows one terminal at a time, picked from tabs; per visit
};
const read = () => {
  try {
    return readLay(localStorage.getItem(LAY_KEY));
  } catch {
    return readLay(null);
  }
};
export const useTerminals = create<TerminalState>()(() => ({
  showing: false,
  seen: false,
  all: new Map(),
  lay: typeof localStorage === "undefined" ? readLay(null) : read(),
  pick: null,
}));
export const setTerminals = useTerminals.setState;

// What the page asks of the old code: read the board again (a session ended), and Resume (the board opens the card on its
// new session; the new tile shows it).
export const terminalActions: { reload: () => void; resume: (c: Session) => Promise<boolean> } = {
  reload: () => {},
  resume: async () => false,
};
export const setTerminalActions = (a: typeof terminalActions) => Object.assign(terminalActions, a);

// Every layout change is saved at once.
function lay(f: (l: Lay) => Lay) {
  const next = trimLay(f(useTerminals.getState().lay));
  try {
    localStorage.setItem(LAY_KEY, JSON.stringify(next));
  } catch {}
  useTerminals.setState({ lay: next });
}
export const terminalLayout = {
  mode: (mode: Mode) => lay((l) => ({ ...l, mode, max: null })),
  // The tile asked for is maximised, or restored when it already is.
  toggleMax: (key: string) => lay((l) => ({ ...l, max: l.max === key ? null : key })),
  // Only a tile that is not maximised or one already is a no-op (Alt+N on a maximised page switches which).
  maxOn: (key: string) => lay((l) => (l.max && l.max !== key ? { ...l, max: key } : l)),
  hide: (key: string) => lay((l) => ({ ...l, hidden: [...l.hidden, key], max: l.max === key ? null : l.max })),
  show: (key: string) => lay((l) => ({ ...l, hidden: l.hidden.filter((k) => k !== key) })),
  // `order` is the arranged order, so a tile never seen before can be swapped too.
  swap: (order: string[], from: string, to: string) => {
    const next = swapOrder(order, from, to);
    if (next) lay((l) => ({ ...l, order: next }));
  },
  // A tile seen for the first time takes its place at the end and keeps it: a run that sorts earlier later does not move the rest.
  see: (order: string[]) => {
    const seen = useTerminals.getState().lay.order;
    if (order.slice(-100).some((k) => !seen.includes(k))) lay((l) => ({ ...l, order }));
  },
  sizes: (shape: string, s: Sizes) => lay((l) => ({ ...l, sizes: { ...l.sizes, [shape]: s } })),
};
export const pickTerminal = (pick: string | null) => useTerminals.setState({ pick });
