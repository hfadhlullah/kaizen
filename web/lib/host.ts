// What the new React pages need from the old board code, handed over once by web/board/react-mount.ts.
// Keeping it here means lib/, components/ and pages/ never import web/board (no cycles, and a test can
// stand in a fake host). The old modules shrink each phase; this type is what is left of them.
export type RunPick = { kind: string; agent?: string; account?: string; yolo: boolean; explore?: boolean };
export type Host = {
  // Show another board view (no reload); push adds a history entry.
  go(view: string, push?: boolean): void;
  // The board's New task dialog (the header button's own action).
  newTask(): void;
  // The run picker dialog for a card, then the choice.
  runPopup(card: { _k: string; kind: string; state: string; text: string }, onStart: (pick: RunPick) => void): void;
  // The task list feeds the sidebar badge and the board's other pages.
  setTaskAttention(tasks: unknown[]): void;
  attentionTasks(): unknown[] | null;
  // The board's project filter: the dir the Tasks list is scoped to ("" for all projects).
  scopeDir(): string;
};
const none = (): never => {
  throw new Error("The board has not mounted this page yet");
};
export const host: Host = {
  go: none,
  newTask: none,
  runPopup: none,
  setTaskAttention: () => {},
  attentionTasks: () => null,
  scopeDir: () => "",
};
export const setHost = (h: Partial<Host>) => Object.assign(host, h);
