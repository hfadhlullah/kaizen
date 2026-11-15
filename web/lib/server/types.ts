// The shapes the server's reads carry and the side menu lists (the cards' own shape stays loose, as /state sends it).
// /state `agents`: one entry per open agent terminal.
export type Agent = {
  key: string;
  dir: string;
  ws?: string;
  agent?: string;
  name: string;
  run?: string;
  asking: boolean;
  busy: boolean;
  last?: string;
  at?: number;
  born?: number;
  land?: string;
};

export type RailTask = {
  id: string;
  dir: string;
  title: string;
  status?: string;
  created?: number;
  activeRun?: string | null;
  runs?: (string | { id: string })[];
  runIds?: string[];
  legacy?: { kind: string; id?: string; index?: number };
  attention: { category: string; reason: string; action: string };
};
// What the side menu and the phone's pages draw (/state?all=1 and /tasks?all=1).
export type RailData = { cards: any[]; projects: any[]; agents: Agent[]; tasks: RailTask[] | null };
