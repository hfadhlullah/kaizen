// What the components need from the board's engines, handed over once by pages/board/host-bridge.ts.
// Keeping it here means lib/ and components/ never import pages/ (no cycles, and a test can stand in a fake host).
export type RunPick = { kind: string; agent?: string; account?: string; yolo: boolean; explore?: boolean };
// What a page opens in place. Each answers true when it did; the Notebook page and Video set none, so the caller changes the
// address instead. (These were `kz-open-*` events on window; the board's answers are pages/board/host-bridge.ts.)
export type Open = {
  card(a: { dir: string; id?: string; text?: string }): boolean; // a run or task card, in its workspace or panel
  ws(a: { dir: string; ws: string }): boolean;
  term(a: { dir?: string; ws?: string; key: string }): boolean; // an agent's terminal tab; a Home one opens in the Home window
  tab(a: { dir: string; ws: string; id: string }): boolean; // a workspace's tab, on the screen that holds it
  task(a: { id: string; dir: string }): boolean;
  homeStart(a: { agent?: string; yolo?: boolean; prompt?: string }): boolean; // a new agent or shell in the Home window
};
export type Host = {
  open: Open;
  // Show another board view (no reload); push adds a history entry.
  go(view: string, push?: boolean): void;
  // The board's New task dialog (the header button's own action).
  newTask(): void;
  // The run picker dialog for a card, then the choice.
  runPopup(card: { _k: string; kind: string; state: string; text: string }, onStart?: (pick: RunPick) => void): void;
  // The board's project filter: the dir the Tasks list is scoped to ("" for all projects).
  scopeDir(): string;
  // The Icebox: the board's project header for a request, its project list and "Showing" picker (a project
  // with a logo is drawn with it), a reload of the board's own data after a change, and what the Icebox reuses
  // from the old code: the file shrinker, the click sound and the Settings jump.
  dirHeader(): Record<string, string>;
  projects(): { dir: string; label: string; logo?: boolean }[];
  reload(): void;
  dataUrls(files: File[]): Promise<{ name: string; data: string }[]>;
  // The note editor (board/rich.ts): a contenteditable over a textarea that keeps the value; returns the editor.
  rich(ta: HTMLTextAreaElement): HTMLElement;
  pop(): void;
  motion(): boolean;
  agentLine(agent: { name: string; note?: string }): string;
  openSettings(query: string): void;
  // The Board (phase 3): the old code that still owns the panel, the run workspace and the card list. `openCard`
  // opens a card's run workspace or task panel (`tab` and `item` ask for a tab and a marked finding or backlog item),
  // `loadBoard` re-reads /state, `launched` records the terminal a launch opened so the workspace selects it,
  // `closePanel` / `reopenPanel` shut or redraw the panel of the card that is open, `notify` asks for notification
  // permission, and `openWorkspace` is the card's run view.
  openCard(card: any, tab?: string, item?: number): void;
  openWorkspace(card: any): void;
  loadBoard(): Promise<void>;
  launched(card: any, pty: string | undefined): void;
  closePanel(): void;
  reopenPanel(card: any): void;
  panelOpenFor(card: any): boolean;
  notify(): void;
  // The run panel's Source control tab (the footer points at it when git work is left).
  gitTab(card: any): void;
  // Draw the open run again from the server (after a commit, a stage, a merge).
  refetchRun(card: any): Promise<void>;
  // Settings (phase 4): the terminal font size, the notice and sound choices this browser keeps, the About bar and
  // the two phone cards that are still old code and fill an element of their own, and the project the board is on.
  font: { min: number; max: number; read(): number; set(n: number): void };
  notices: { on(): boolean; sounds: string[]; sound(): string; play(name?: string): void };
  currentDir(): string;
  // The Add a project sheet (phase 5): the projects that have a git workspace, a workspace's address, and switching the
  // board to a project that was just added.
  gitProjects(): { dir: string; name: string }[];
  wsHref(dir: string, ws: string): string;
  pickProject(stateDir: string): Promise<void>;
  // Going to another address after something was made (a new workspace): the Notebook page writes its open note first.
  navigate(href: string): void;
  // Home (phase 5): the run ids that are cards on this board, and the project a new chat starts in ("" for all).
  runCards(): { _k: string; id: string; kind: string; state: string; text: string }[];
};
const none = (): never => {
  throw new Error("The board has not mounted this page yet");
};
const no = () => false;
export const host: Host = {
  open: { card: no, ws: no, term: no, tab: no, task: no, homeStart: no },
  go: none,
  newTask: none,
  runPopup: none,
  scopeDir: () => "",
  dirHeader: () => ({}),
  projects: () => [],
  reload: () => {},
  dataUrls: none,
  rich: none,
  pop: () => {},
  motion: () => true,
  agentLine: (a) => a.name,
  openSettings: none,
  openCard: none,
  openWorkspace: none,
  loadBoard: async () => {},
  launched: () => {},
  closePanel: () => {},
  reopenPanel: () => {},
  panelOpenFor: () => false,
  notify: () => {},
  gitTab: () => {},
  refetchRun: async () => {},
  font: { min: 8, max: 24, read: () => 12, set: () => {} },
  notices: { on: () => true, sounds: [], sound: () => "", play: () => {} },
  currentDir: () => "",
  gitProjects: () => [],
  wsHref: () => "",
  pickProject: async () => {},
  navigate: (href) => void (location.href = href),
  runCards: () => [],
};
export const setHost = (h: Partial<Host>) => Object.assign(host, h);
