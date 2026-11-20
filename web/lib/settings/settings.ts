// Settings' rules: which page and subsection a setting belongs on, which control draws it, what a search keeps, and
// which page shows. Pure, no DOM: the components draw what these return and the tests pin it.
export type SettingsPage = { id: string; title: string; desc: string; ico: string };
// The sidebar, grouped as macOS System Settings is: short groups of pages, each with its icon tile. Only the page
// knows this: a setting's `group` in cli/settings.ts still decides its scope and the TUI's headings.
export const SETTINGS_NAV: [string, SettingsPage[]][] = [
  [
    "App",
    [
      { id: "general", title: "General", desc: "About kaizen, storage, folders and how the app opens.", ico: "gear" },
      { id: "appearance", title: "Appearance", desc: "Theme, color and motion in this browser.", ico: "sun" },
      { id: "notifications", title: "Notifications", desc: "Notices and sounds in this browser.", ico: "inbox" },
      {
        id: "keyboard",
        title: "Keyboard & Dictation",
        desc: "Shortcuts, and speech-to-text dictation run in the browser.",
        ico: "kbd",
      },
      { id: "terminal", title: "Terminal", desc: "Board terminals and the terminal dashboard.", ico: "term" },
    ],
  ],
  [
    "Agents",
    [
      {
        id: "agents",
        title: "Agents",
        desc: "Manage AI agents, set a default, and customize commands.",
        ico: "ai",
      },
      {
        id: "models",
        title: "Models",
        desc: "The model each agent runs its stages and handoff sessions on.",
        ico: "mem",
      },
      {
        id: "accounts",
        title: "AI Accounts",
        desc: "Who is signed in to each AI tool kaizen runs. Add accounts only to switch between more than one.",
        ico: "link",
      },
      { id: "skills", title: "Skills", desc: "What your agents can do. Changes apply to new sessions.", ico: "note" },
    ],
  ],
  [
    "Workflow",
    [
      {
        id: "runs",
        title: "Runs",
        desc: "How a run is carried out: who builds, who reviews, and what it remembers.",
        ico: "play",
      },
      { id: "approvals", title: "Approvals", desc: "Where a run stops and waits for you.", ico: "check" },
      { id: "autofix", title: "Auto-fix", desc: "What happens to review findings.", ico: "bug" },
      {
        id: "orchestration",
        title: "Orchestration",
        desc: "Split a run into workers, each in its own terminal. Off by default.",
        ico: "lgrid",
      },
      { id: "automations", title: "Automations", desc: "Schedules that start a run in this project.", ico: "clock" },
      { id: "git", title: "Git", desc: "Branches and commits for each run.", ico: "pen" },
    ],
  ],
  [
    "Connections",
    [
      {
        id: "integrations",
        title: "Integrations",
        desc: "Icebox sources and ChatGPT, your Google account, and web research.",
        ico: "ext",
      },
      { id: "mobile", title: "Phone", desc: "Open kaizen from your phone, and send files to WhatsApp.", ico: "phone" },
    ],
  ],
];
export const PAGES = SETTINGS_NAV.flatMap(([, ps]) => ps);
// Pages that were merged into another: an old `?page=` address still opens the right one.
const PAGE_ALIAS: Record<string, string> = { voice: "keyboard", shortcuts: "keyboard" };
export const pageId = (id: string) => PAGE_ALIAS[id] ?? id;
// Subsections that should come first on their page, whatever order their rows arrive in.
export const SUB_ORDER: Record<string, string[]> = {
  general: ["Updates", "Storage", "Folders", "App"],
  keyboard: ["Shortcuts", "Dictation"],
};
// First match wins: [key pattern, page, subsection].
const PLACES: [RegExp, string, string][] = [
  [/^(preset|runner|explore\.|build\.|review\.executor)/, "runs", "Workflow"],
  [/^review\.(write_memory|memory_max_lines)$/, "runs", "Memory"],
  [/^(subagents\.|agent\.model\.claude$)/, "models", "Claude Code"],
  [/^agent\.model\./, "models", "Models"],
  [/^agent\.handoff_model\./, "models", "Handoff session"],
  [/^agent\.default$/, "agents", "Default agent"],
  [/^agent\./, "agents", "Running agents"],
  [/^orchestration\./, "orchestration", "Workers"],
  [/^dictation\./, "keyboard", "Dictation"],
  [/^sources\./, "integrations", "Icebox"],
  [/^(mode|approvals\.|auto_accept)/, "approvals", "Approvals"],
  [/^auto_fix\./, "autofix", "Auto-fix"],
  [/^auto_guard\./, "autofix", "Auto mode guard"],
  [/^git\./, "git", "Git"],
  [/^ui\./, "terminal", "Terminal"],
  [/^board\.chat_hotkey$/, "keyboard", "Shortcuts"],
  [/^board\.auto_update$/, "general", "Updates"],
  [/^board\.(projects_dir|video_dir)$/, "general", "Folders"],
  [/^board\./, "general", "App"],
  [/^state\./, "general", "Storage"],
];
// A setting nobody has placed yet still shows, on General.
export const placeOf = (key: string): [string, string] => {
  const p = PLACES.find(([re]) => re.test(key));
  return p ? [p[1], p[2]] : ["general", "Other"];
};

// ---- what the server sends (GET /settings and its neighbours), as far as the page reads it
export type Row = {
  key: string;
  label: string;
  help?: string;
  group?: string;
  values: string[];
  // What an option is called on screen, by its stored value (cli/settings.ts); a value with no entry shows as it is.
  labels?: Record<string, string>;
  value: string;
  own?: boolean;
  idle?: string;
  text?: boolean;
  folder?: boolean;
};
export type Cfg = { scope: string; projects: { dir: string; label: string }[]; windows?: boolean; rows: Row[] };
export type Agent = {
  cmd: string;
  name: string;
  installed: boolean;
  bypass: boolean;
  enabled: boolean;
  permissions: string;
  command: string;
  args: string;
  env: string[];
  preview: string;
};
export type AgentPrefs = { permissions: string; envWorks: boolean; agents: Agent[] };
export type Google = { hasClient?: boolean; connected?: boolean };
export type ResearchKey = { set: boolean; source?: string; hint?: string };
export type Data = {
  cfg: Cfg | null;
  google: Google;
  research: ResearchKey | null;
  agents: AgentPrefs | null;
  accounts: any | null;
  skills: any | null;
  automations: any | null;
  cleanup: any | null;
};

// ---- the control a setting is drawn with
export type Control = "preset" | "switch" | "segments" | "stepper" | "model" | "folder" | "text";
export const isModelRow = (key: string) =>
  /^(orchestration\.worker_model|agent\.model|agent\.handoff_model)\./.test(key);
export function controlOf(r: Pick<Row, "key" | "values" | "text" | "folder">): Control {
  if (r.text) return isModelRow(r.key) ? "model" : r.folder ? "folder" : "text";
  const v = r.values;
  if (r.key === "preset") return "preset";
  if (v.length === 2 && v.includes("true") && v.includes("false")) return "switch";
  // Short choices sit side by side, joined; a long list keeps the stepper.
  if (v.every((x) => /^\d+$/.test(x)) || (v.length <= 5 && v.every((x) => x) && v.join("").length <= 32))
    return "segments";
  return "stepper";
}
// An option as the page shows it.
export const optionText = (r: Pick<Row, "labels">, v: string) => r.labels?.[v] ?? v;
export const settingId = (key: string) => "s-" + key.replace(/\./g, "-");
export const modelTool = (key: string) => key.split(".").pop()!;
export const modelName = (label: string) => label.replace(/^(Worker|Handoff) model: /, "");
// A row's help line: its own help, then why it is idle.
export const rowHint = (r: Pick<Row, "help" | "idle">) => [r.help, r.idle].filter(Boolean).join(" · ");
// "Notification" help for this browser.
export function notifyHelp(permission: string | null, on: boolean) {
  if (!on) return "Off in this browser";
  if (permission === "granted") return "";
  if (permission === "denied") return "Pop-ups blocked by this browser; the sound still plays";
  return permission
    ? "Pop-ups wait for the browser to ask; the sound still plays"
    : "Pop-ups not supported here; the sound still plays";
}
// A terminal font size typed in the box: whole, and inside the bounds; nothing typed keeps the old one.
export const clampFont = (typed: string, now: number, lo: number, hi: number) =>
  Math.round(Math.min(hi, Math.max(lo, +typed || now)));

// ---- the page's rows
// Each row of a page is an Item; the component draws it from the store by `kind` and `ref`. `q` is the lowercase text a
// search matches. A section with no title is never filtered and does not count as a match (Orchestration's picture).
export type Item = { id: string; kind: string; q: string; ref?: string; off?: boolean };
export type Section = { title: string; extra?: "refresh" | "recheck"; items: Item[] };
export type Env = {
  notifyHelp: string;
  notifyOn: boolean;
  scoped: boolean;
  agentCount: number;
  skillTab?: "kaizen" | "mine" | "store";
  skillQ?: string; // what the My Skills search box holds, once typing pauses
  searching?: boolean; // the Settings search has words: Kaizen and My Skills both show, so a match is never hidden
  skillAll?: boolean; // every outside skill, not the first few (also while searching, so a match is never hidden)
};
// How many rows My Skills shows before Show all.
export const MINE_SHOWN = 5;

const lower = (s: string) => s.toLowerCase();
const item = (id: string, kind: string, q: string, ref?: string, off?: boolean): Item => ({
  id,
  kind,
  q: lower(q),
  ref,
  off,
});

// The config rows to show: the default agent is drawn as chips and a model row only for a tool on this machine.
export function visibleRows(cfg: Cfg | null, ap: AgentPrefs | null): Row[] {
  if (!cfg) return [];
  return cfg.rows
    .filter((r) => !(r.key === "agent.default" && ap))
    .filter(
      (r) =>
        !ap ||
        !/^agent\.(model|handoff_model)\./.test(r.key) ||
        ap.agents.some((a) => a.installed && r.key.endsWith("." + a.cmd)),
    );
}
// The subsections of every page, in the order they first appear, with the rows put in them.
export function genericSections(d: Data, env: Env): Map<string, Map<string, Item[]>> {
  const pages = new Map<string, Map<string, Item[]>>(
    PAGES.map((p) => [p.id, new Map((SUB_ORDER[p.id] ?? []).map((sub) => [sub, [] as Item[]]))]),
  );
  const put = (page: string, sub: string, it: Item) => {
    const m = pages.get(page)!;
    if (!m.has(sub)) m.set(sub, []);
    m.get(sub)!.push(it);
  };
  for (const r of visibleRows(d.cfg, d.agents)) {
    const [page, sub] = placeOf(r.key);
    put(
      page,
      sub + (env.scoped && r.group === "Board" ? " · all projects" : ""),
      item(settingId(r.key), "row", [r.label, r.help, r.key, r.group, ...r.values].join(" "), r.key, !!r.idle),
    );
  }
  // Under Runs to keep, which they act on.
  if (d.cleanup) {
    put(
      "general",
      "Storage",
      item("s-clean-records", "cleanup", "cleanup clean launch records sessions prune", "records"),
    );
    put("general", "Storage", item("s-clean-runs", "cleanup", "cleanup delete old runs prune history", "runs"));
  }
  put("keyboard", "Dictation", item("v-mic", "mic", "microphone input device mic dictation shortcut"));
  put("mobile", "Phone", item("phset", "phone", "phone mobile tailscale qr connect address setup"));
  put("mobile", "Phone", item("waset", "whatsapp", "whatsapp phone mobile qr message send"));
  put("integrations", "Google", item("gg-id", "google-id", "google oauth client id sheets write back"));
  put("integrations", "Google", item("gg-secret", "google-secret", "google oauth client secret"));
  if (d.research) {
    put(
      "integrations",
      "Research",
      item("fc-key", "fc-key", "firecrawl api key research web search scrape explore internet"),
    );
    put("integrations", "Research", item("fc-test", "fc-test", "firecrawl status test remove research web search"));
  }
  put("integrations", "Google", item("gg-conn", "google-conn", "google account connect sheets write back"));
  put("appearance", "Browser", item("th", "theme", "theme light dark system browser"));
  put("appearance", "Browser", item("co", "color", "color colour palette monochrome blue theme browser"));
  put("appearance", "Browser", item("mo", "motion", "motion animation reduce reduced browser"));
  put("terminal", "Browser", item("tf", "font", "terminal font size text zoom browser"));
  put("notifications", "Browser", item("nt", "notify", "notifications " + env.notifyHelp + " browser"));
  put("notifications", "Browser", item("hp", "haptic", "haptic feedback vibrate vibration touch tap phone browser"));
  put("notifications", "Browser", item("ns", "sound", "notification sound audio browser", undefined, !env.notifyOn));
  return pages;
}

const TOOLS = ["claude", "codex", "gemini", "agy"];
export const TOOL_NAME: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini CLI",
  agy: "Antigravity",
};
export const SKILL_GROUPS: [string, string][] = [
  ["core", "Core"],
  ["media", "Media"],
  ["optional", "Optional"],
];
export const accountTools = (ac: { accounts: any[]; normal?: any[] }) =>
  TOOLS.filter((t) => ac.accounts.some((a) => a.tool === t) || (ac.normal ?? []).some((n) => n.tool === t));
// Tools offered under "Add an account": not Antigravity, Gemini only when it is already in use.
export const addableTools = (ac: { accounts: any[]; normal?: any[] }) =>
  TOOLS.filter((t) => t !== "agy").filter(
    (t) => t !== "gemini" || (ac.normal ?? []).some((n) => n.tool === t) || ac.accounts.some((a) => a.tool === t),
  );

// One page's sections: the page's own rows first (agents, accounts, skills, automations), then the ordinary ones.
export function pageSections(page: string, d: Data, env: Env, generic = genericSections(d, env)): Section[] {
  const out: Section[] = [];
  if (page === "agents" && d.agents) {
    const ap = d.agents;
    const usable = ap.agents.filter((a) => a.enabled && a.installed);
    out.push({
      title: "Default agent",
      items: [
        item("ag-def", "agent-default", "default agent auto tool launches " + usable.map((a) => a.name).join(" ")),
      ],
    });
    out.push({
      title: "Permissions",
      items: [item("ag-perm", "agent-perm", "permissions bypass yolo all agents without asking")],
    });
    out.push({
      title: `Installed · ${env.agentCount} detected`,
      extra: "refresh",
      items: ap.agents.map((a) =>
        item(
          "ag-" + a.cmd,
          "agent",
          [a.name, a.cmd, "agent installed command arguments environment permissions"].join(" "),
          a.cmd,
        ),
      ),
    });
  }
  if (page === "accounts" && d.accounts) {
    const ac = d.accounts;
    for (const t of accountTools(ac))
      out.push({
        title: TOOL_NAME[t]!,
        items: [
          ...(ac.normal ?? [])
            .filter((n: any) => n.tool === t)
            .map((n: any) =>
              item("ac-normal-" + t, "account-normal", `account login normal default ${t} ${n.who ?? ""}`, t),
            ),
          ...ac.accounts
            .filter((a: any) => a.tool === t)
            .map((a: any) => item("ac-" + a.id, "account", `account ${a.name} ${a.tool}`, a.id)),
        ],
      });
    out.push({
      title: "Add an account",
      items: [item("ac-add", "account-add", "add account sign in claude codex gemini provider")],
    });
  }
  if (page === "orchestration" && d.cfg)
    out.push({ title: "", items: [item("orch", "orchestration", "orchestration workers flow plan merge review")] });
  if (page === "skills" && d.skills) {
    // Three tabs: kaizen's own skills, the user's skills from elsewhere (searchable), and the skill store.
    const tab = env.skillTab ?? "kaizen";
    const top: Section = { title: "", items: [item("sk-tabs", "skill-tabs", "")] };
    // The desktop app before its one-time setup: offered above everything else on the page.
    if (d.skills.bun && !env.searching)
      out.push({ title: "", items: [item("sk-bun", "skill-bun", "install bun kaizen command")] });
    if (d.skills.setup && !env.searching)
      out.push({ title: "", items: [item("sk-setup", "skill-setup", "set up kaizen agents skills install")] });
    out.push(top);
    if (tab === "store" && !env.searching)
      // Titled, so the page counts as a match and stays shown (an untitled section never does).
      out.push({ title: "Find skills", items: [item("sk-store", "skill-store", "find skills store search install skills.sh")] });
    if (tab === "kaizen" || env.searching)
      SKILL_GROUPS.filter(([g]) => d.skills.skills.some((s: any) => s.group === g)).forEach(([g, label], i) =>
        out.push({
          title: label,
          extra: i ? undefined : "recheck",
          items: d.skills.skills
            .filter((s: any) => s.group === g)
            .map((s: any) =>
              item("sk-" + s.id, "skill", [s.title, s.id, s.description, s.group, "skill"].join(" "), s.id),
            ),
        }),
      );
    if (tab === "mine" || env.searching) {
      // One list, by name: skills in the agents' folders and the installed Claude Code plugins.
      const sq = env.searching ? "" : (env.skillQ ?? "");
      if (!env.searching) top.items.push(item("sk-find", "skill-mine-search", ""));
      const rows = [
        ...(d.skills.outside ?? []).map((s: any) =>
          item("so-" + s.id, "skill-outside", [s.id, s.description, s.source ?? "", "skill"].join(" "), s.id),
        ),
        ...(d.skills.plugins ?? []).map((p: any) =>
          item(
            "sp-" + p.plugin,
            "skill-plugin",
            [p.plugin, "plugin claude", ...p.skills.map((s: any) => s.id + " " + s.description)].join(" "),
            p.plugin,
          ),
        ),
      ].sort((x, y) => x.ref!.localeCompare(y.ref!));
      // Re-check scans the agents' folders again (it also happens each time the page loads and after any install or remove).
      const [mine] = filterSections([{ title: "On this computer", extra: env.searching ? undefined : "recheck", items: rows }], sq).filter((x) => x.items.length);
      if (mine && !env.skillAll && !sq && mine.items.length > MINE_SHOWN)
        mine.items = [...mine.items.slice(0, MINE_SHOWN), item("so-more", "skill-more", "show all skills")];
      if (mine) out.push(mine);
      else if (!env.searching) top.items.push(item("sk-none", "skill-none", ""));
    }
  }
  if (page === "automations") {
    const au = d.automations;
    out.push({
      title: "Automations",
      items: au
        ? [
            ...au.rules.map((r: any) =>
              item("au-" + r.id, "automation", ["automation", r.name, r.text, r.cron].join(" "), r.id),
            ),
            item("au-form", "automation-form", "automation new create add schedule"),
          ]
        : [item("au-none", "automation-none", "automation")],
    });
  }
  for (const [sub, items] of generic.get(page) ?? []) if (items.length) out.push({ title: sub, items });
  return out;
}
// The sections a search leaves: an item stays when its words hold the query.
export function filterSections(sections: Section[], query: string): Section[] {
  const q = query.trim().toLowerCase();
  if (!q) return sections;
  return sections
    .map((s) => (s.title ? { ...s, items: s.items.filter((i) => i.q.includes(q)) } : s))
    .filter((s) => !s.title || s.items.length);
}
// Does a page have a titled section left after the search?
export const pageHasMatch = (sections: Section[]) => sections.some((s) => s.title && s.items.length);
// Which page shows: the one picked, if it has a match; while searching the first page that still has one; on a
// phone with no search nothing (the list of pages). A phone shows a page or the list, and the search box lives in the
// list, so while it is being typed in the list stays (narrowed to the matching pages).
export function shownPage(o: {
  picked: string | null;
  hits: string[];
  query: string;
  narrow: boolean;
  typing: boolean;
}) {
  const q = !!o.query.trim();
  if (o.narrow && q && o.typing) return null;
  if (o.picked && o.hits.includes(o.picked)) return o.picked;
  return q || !o.narrow ? (o.hits[0] ?? null) : null;
}

// ---- AI Accounts: what a login's row says
// Who the tool says is signed in: an email (Claude), else how (Codex: "ChatGPT"), and the plan.
export const whoText = (a: { signedIn: boolean; who?: string; plan?: string; via?: string }) =>
  a.signedIn && (a.who || a.via || a.plan)
    ? [a.who ?? (a.via ? `via ${a.via}` : ""), a.plan].filter(Boolean).join(" · ")
    : "";
// `known`: the tool keeps plan usage kaizen can read (Gemini CLI does not).
export function usageText(u: any, signed: boolean, known = true): { text: string; bad: boolean } {
  if (!u) return { text: signed ? (known ? "Signed in · no usage yet" : "Signed in") : "Not signed in", bad: !signed };
  if (u.expired) return { text: "Sign-in expired. Sign in again", bad: true };
  if (u.error) return { text: `Usage unavailable (${u.error})`, bad: true };
  return {
    text: `${u.five ? `${u.five.pct}% of 5 hours` : ""}${u.five && u.week ? " · " : ""}${u.week ? `${u.week.pct}% of the week` : ""}`,
    bad: false,
  };
}
