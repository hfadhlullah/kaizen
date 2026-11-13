// Settings' sidebar, grouped as macOS System Settings is: short groups of pages, each with
// its icon tile. Only the page knows this: a setting's `group` in cli/settings.ts still
// decides its scope and the TUI's headings.
export type SettingsPage = { id: string; title: string; desc: string; ico: string };
export const SETTINGS_NAV: [string, SettingsPage[]][] = [
  ["App", [
    { id: "general", title: "General", desc: "About kaizen, storage, folders and how the app opens.", ico: "gear" },
    { id: "appearance", title: "Appearance", desc: "Theme, color and motion in this browser.", ico: "sun" },
    { id: "notifications", title: "Notifications", desc: "Notices and sounds in this browser.", ico: "inbox" },
    { id: "keyboard", title: "Keyboard & Dictation", desc: "Shortcuts, and speech-to-text dictation run in the browser.", ico: "kbd" },
    { id: "terminal", title: "Terminal", desc: "Board terminals and the terminal dashboard.", ico: "term" },
  ]],
  ["Agents", [
    { id: "agents", title: "Agents", desc: "Manage AI agents, set a default, and customize commands.", ico: "ai" },
    { id: "models", title: "Models", desc: "The model each agent runs its stages and handoff sessions on.", ico: "mem" },
    { id: "accounts", title: "AI Accounts", desc: "Who is signed in to each AI tool kaizen runs. Add accounts only to switch between more than one.", ico: "link" },
    { id: "skills", title: "Skills", desc: "What your agents can do. Changes apply to new sessions.", ico: "note" },
  ]],
  ["Workflow", [
    { id: "runs", title: "Runs", desc: "How a run is carried out: who builds, who reviews, and what it remembers.", ico: "play" },
    { id: "approvals", title: "Approvals", desc: "Where a run stops and waits for you.", ico: "check" },
    { id: "autofix", title: "Auto-fix", desc: "What happens to review findings.", ico: "bug" },
    { id: "orchestration", title: "Orchestration", desc: "Split a run into workers, each in its own terminal. Off by default.", ico: "lgrid" },
    { id: "automations", title: "Automations", desc: "Schedules that start a run in this project.", ico: "clock" },
    { id: "git", title: "Git", desc: "Branches and commits for each run.", ico: "pen" },
  ]],
  ["Connections", [
    { id: "integrations", title: "Integrations", desc: "Request sources, your Google account, and web research.", ico: "ext" },
    { id: "mobile", title: "Phone", desc: "Open kaizen from your phone, and send files to WhatsApp.", ico: "phone" },
  ]],
];
// Pages that were merged into another: an old `?page=` address still opens the right one.
const PAGE_ALIAS: Record<string, string> = { voice: "keyboard", shortcuts: "keyboard" };
export const pageId = (id: string) => PAGE_ALIAS[id] ?? id;
// Subsections that should come first on their page, whatever order their rows arrive in.
export const SUB_ORDER: Record<string, string[]> = { general: ["Storage", "Folders", "App"], keyboard: ["Shortcuts", "Dictation"] };
// First match wins: [key pattern, page, subsection].
const PLACES: [RegExp, string, string][] = [
  [/^(preset|runner|explore\.|build\.|review\.executor)/, "runs", "Workflow"],
  [/^review\.(write_memory|memory_max_lines)$/, "runs", "Memory"],
  [/^(subagents\.|agent\.model\.)/, "models", "Models"],
  [/^agent\.handoff_model\./, "models", "Handoff session"],
  [/^agent\.default$/, "agents", "Default agent"],
  [/^agent\./, "agents", "Running agents"],
  [/^orchestration\./, "orchestration", "Workers"],
  [/^dictation\./, "keyboard", "Dictation"],
  [/^sources\./, "integrations", "Request sources"],
  [/^(mode|approvals\.|auto_accept)/, "approvals", "Approvals"],
  [/^auto_fix\./, "autofix", "Auto-fix"],
  [/^auto_guard\./, "autofix", "Auto mode guard"],
  [/^git\./, "git", "Git"],
  [/^ui\./, "terminal", "Terminal"],
  [/^board\.chat_hotkey$/, "keyboard", "Shortcuts"],
  [/^board\.(projects_dir|video_dir)$/, "general", "Folders"],
  [/^board\./, "general", "App"],
  [/^state\./, "general", "Storage"],
];
// A setting nobody has placed yet still shows, on General.
export const placeOf = (key: string): [string, string] => {
  const p = PLACES.find(([re]) => re.test(key));
  return p ? [p[1], p[2]] : ["general", "Other"];
};
