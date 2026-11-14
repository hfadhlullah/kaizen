// The two sheets the phone's Home opens: which agent of a workspace to open, and where to start a new one. board/phone.ts
// knows the runs and the requests; it hands over what each row shows and what it does, and components/phone/phone-sheets.tsx draws them.
import { create } from "zustand";

export type PickSheet = {
  kind: "pick";
  title: string;
  rows: { agent: string; name: string; dot: string; word: string; open: () => void }[];
  onNew: () => void;
};
export type NewSheet = {
  kind: "new";
  spots: { name: string }[]; // the workspaces; Home (no project) is always the first choice
  on: number; // the one chosen at first: an index into spots, or -1 for Home
  kinds: { agent: string; name: string }[]; // an agent, or the shell (agent "")
  yolo: boolean; // bypass permissions starts on
  start: (spot: number, kind: number, yolo: boolean) => void; // spot -1 is Home
};
export const useSheet = create<{ sheet: PickSheet | NewSheet | null }>()(() => ({ sheet: null }));
export const openSheet = (sheet: PickSheet | NewSheet) => useSheet.setState({ sheet });
export const closeSheet = () => useSheet.setState({ sheet: null });
// The sprite (components/shell/sprite.tsx: i-claude, i-gemini, i-codex; a test holds the two lists together) has a mark for the
// agents kaizen knows; any other gets the generic one.
export const AGENT_MARKS = ["claude", "gemini", "codex"];
export const agentMark = (agent: string) => (AGENT_MARKS.includes(agent.toLowerCase()) ? agent.toLowerCase() : "ai");
