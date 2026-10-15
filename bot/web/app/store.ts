// State more than one module writes: the server's info, the open agent and its thread,
// the board, the side panel and the pending attachments. Everything else lives in the
// module that owns it.
export const store = {
  info: { roles: [], user: "You" },
  current: null,
  items: [],
  board: { ok: null, projects: [] },
  panel: null,
  needsOpen: false,
  attached: [],
};
