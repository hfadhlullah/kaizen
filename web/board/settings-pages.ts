// Settings' sidebar, grouped as Orca's is. Only the page knows this: a setting's `group`
// in cli/settings.ts still decides its scope and the TUI's headings.
export type SettingsPage = { id: string; title: string; desc: string; ico: string };
export const SETTINGS_NAV: [string, SettingsPage[]][] = [
  ["AI Capabilities", [
    { id: "agents", title: "Agents", desc: "Manage AI agents, set a default, and customize commands.", ico: "ai" },
    { id: "accounts", title: "AI Provider Accounts", desc: "Optional. Your normal logins keep working; add accounts only to switch between them.", ico: "link" },
    { id: "orchestration", title: "Orchestration", desc: "Split a run into workers, each in its own terminal. Off by default.", ico: "ai" },
    { id: "skills", title: "Skills", desc: "What your agents can do. Changes apply to new sessions.", ico: "note" },
    { id: "voice", title: "Voice", desc: "Speech-to-text dictation, run in the browser.", ico: "mic" },
  ]],
  ["Set Up", [
    { id: "general", title: "General", desc: "Which settings you are editing, folders, and maintenance.", ico: "gear" },
    { id: "integrations", title: "Integrations", desc: "Request sources and your Google account.", ico: "link" },
    { id: "mobile", title: "Mobile", desc: "Open kaizen from your phone.", ico: "send" },
  ]],
  ["Workflows", [
    { id: "approvals", title: "Approvals", desc: "Where a run stops and waits for you.", ico: "check" },
    { id: "autofix", title: "Auto-fix", desc: "What happens to review findings.", ico: "bug" },
    { id: "git", title: "Git & Source Control", desc: "Branches and commits for each run.", ico: "pen" },
    { id: "terminal", title: "Terminal", desc: "The terminal dashboard.", ico: "term" },
  ]],
  ["Interface", [
    { id: "appearance", title: "Appearance", desc: "Theme, color and motion in this browser.", ico: "note" },
    { id: "notifications", title: "Notifications", desc: "Notices and sounds in this browser.", ico: "clock" },
    { id: "shortcuts", title: "Shortcuts", desc: "Keyboard shortcuts for common actions.", ico: "kbd" },
  ]],
];
// First match wins: [key pattern, page, subsection].
const PLACES: [RegExp, string, string][] = [
  [/^(preset|runner|build\.|review\.executor)/, "agents", "Workflow"],
  [/^(subagents\.|agent\.model\.)/, "agents", "Models"],
  [/^agent\.default$/, "agents", "Default agent"],
  [/^agent\./, "agents", "Running agents"],
  [/^orchestration\./, "orchestration", "Workers"],
  [/^dictation\./, "voice", "Dictation"],
  [/^sources\./, "integrations", "Request sources"],
  [/^(mode|approvals\.|auto_accept)/, "approvals", "Approvals"],
  [/^auto_fix\./, "autofix", "Auto-fix"],
  [/^git\./, "git", "Git"],
  [/^ui\./, "terminal", "Terminal"],
  [/^board\.chat_hotkey$/, "shortcuts", "Shortcuts"],
  [/^board\./, "general", "Board"],
  [/^(review\.|state\.)/, "general", "Project"],
];
// A setting nobody has placed yet still shows, on General.
export const placeOf = (key: string): [string, string] => {
  const p = PLACES.find(([re]) => re.test(key));
  return p ? [p[1], p[2]] : ["general", "Other"];
};
