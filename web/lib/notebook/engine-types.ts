// What the editor engine asks of the page, and the shapes it is handed. The engine never reaches for the page's state:
// every read goes through these functions, so one editor can be made per note and thrown away with it.
import type { WidgetHost } from "./engine-widgets.ts";

export type Board = {
  runs: {
    id: string;
    short: string;
    title: string;
    status: string;
    findings: { n: number; text: string; done: boolean }[];
    backlog: { n: number; status: string; text: string }[];
  }[];
  ideas: { text: string; status: string }[];
};
export type EditorHost = WidgetHost & {
  names(): string[]; // every note's name, for links and completion
  board(): Board; // what [[run:...]] and [[idea:...]] can name, from /links
  dir(): string; // the state dir whose notes are shown
  edited(): void; // the person typed (never a load)
  save(): void; // Mod-s
  openNote(name: string): void;
  openOrCreate(name: string): void;
  search(query: string): void; // a #tag in the text was clicked
};
export const emptyBoard = (): Board => ({ runs: [], ideas: [] });
