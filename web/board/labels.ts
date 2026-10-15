export const m = 60e3,
  h = 3600e3,
  d = 86400e3;
export const age = (t, now) => {
  const x = now - t;
  return x < h ? Math.round(x / m) + "m" : x < d ? Math.round(x / h) + "h" : Math.round(x / d) + "d";
};
export const NAMES = {
  claude: "Claude Code",
  codex: "Codex",
  agy: "Antigravity",
  opencode: "OpenCode",
  gemini: "Gemini",
  cursor: "Cursor",
  yolo: "yolo",
  unrechecked: "fix not rechecked",
};
export const MARKS = { claude: 1, codex: 1, agy: 1, opencode: 1, gemini: 1, cursor: 1, full: 1, lite: 1 };
export const COLS = ["Ideas", "Planning", "Building", "Review", "Done"];
// state.ts statuses onto the icon set in the <defs> above.
export const ICON = {
  idea: "idea",
  starting: "start",
  running: "run",
  stalled: "stall",
  waiting: "wait",
  done: "done",
  abandoned: "aband",
};
export const NEED = { "approvals.plan": "plan needs your approval", "approvals.review": "review needs your approval" },
  need = (a) => NEED[a] || a;
export const WORD = {
  idea: "idea",
  starting: "starting",
  running: "running",
  stalled: "stalled",
  waiting: "waiting on you",
  done: "done",
  abandoned: "abandoned",
};
