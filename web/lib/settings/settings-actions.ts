// Every request Settings makes, with the same routes and payloads the old page sent. A save toasts the server's words
// and reads the page again, so what shows is what the server kept.
import { ask, post, host, toast } from "@lib/core";
import { setColor, setMotion, setTheme } from "@lib/shell";
import { getSettings, loadSettings, setSettings } from "./settings-store.ts";

const reload = () => loadSettings();

// ---- the config rows (/settings)
export async function saveSetting(key: string, value: string) {
  const cfg = getSettings().data?.cfg;
  setSettings((s) => ({ local: { ...s.local, [key]: value } }));
  const j = await post("/settings", { key, value, scope: cfg?.scope });
  toast(j.ok ? "Saved" : j.error || "Could not save");
  await reload();
}
export async function resetSetting(key: string) {
  const j = await post("/settings", { key, scope: getSettings().data?.cfg?.scope, reset: true });
  toast(j.ok ? "Reset to All projects" : j.error || "Could not reset");
  await reload();
}
// The system's own folder dialog, opened by the board: a page cannot read a real path.
export async function pickFolder(key: string) {
  const j = await post("/pick-folder", {});
  if (j.path) {
    await saveSetting(key, j.path);
    host.reload();
  }
}

// ---- Agents (/agent-prefs; only the default is a config row)
export async function setDefaultAgent(cmd: string) {
  const j = await post("/settings", {
    key: "agent.default",
    value: cmd,
    scope: getSettings().data?.cfg?.scope ?? null,
  });
  toast(j.ok ? "Saved" : j.error || "Could not save");
  await reload();
}
export async function saveAgentPrefs(patch: Record<string, unknown>) {
  const j = await post("/agent-prefs", patch);
  toast(j.error ? j.error : "Saved");
  await reload();
}
// Bypass asks first; a no leaves the select where the server has it.
export async function setPermissions(value: string, agent?: string, name?: string) {
  if (value === "bypass") {
    const yes = await ask({
      title: "Turn on bypass?",
      description: agent
        ? "This agent will run commands without asking."
        : "Agents will run commands without asking, in every project.",
      confirmLabel: "Turn on bypass",
      danger: true,
    });
    if (!yes) return reload();
  }
  return saveAgentPrefs(agent ? { agent, agentPermissions: value } : { permissions: value });
}
export const toggleAgentOpen = (cmd: string) =>
  setSettings((s) => ({
    openAgents: s.openAgents.includes(cmd) ? s.openAgents.filter((c) => c !== cmd) : [...s.openAgents, cmd],
  }));

// ---- AI Accounts (/accounts)
export async function accountSend(body: Record<string, unknown>) {
  const j = await post("/accounts", body);
  toast(j.error ? j.error : "Saved");
  await reload();
}
export async function accountSignIn(id: string, tool: string) {
  // A Home terminal: it needs no project, and the Home window shows it. A project shell with no run key belongs to no
  // workspace tab, so a sign-in started there ran hidden.
  const j = await post("/shell", { home: true, agent: tool, account: id, login: true });
  if (j.error || !j.key) return toast(j.error || "Could not open a terminal. Run the line shown here");
  const opened = host.open.term({ dir: j.dir, ws: j.ws, key: j.key });
  toast(opened ? "Sign in, then close the terminal" : "Terminal started. Open it from the side menu");
}
export async function accountAdd(tool: string) {
  const j = await post("/accounts", { op: "add", tool });
  if (j.error || !j.added) return toast(j.error || "Could not add the account");
  await accountSignIn(j.added, tool);
  await reload();
}
export async function accountRemove(id: string, name: string) {
  const yes = await ask({
    title: `Remove ${name}?`,
    description: "Runs started on it won't start until you pick another.",
    confirmLabel: "Remove",
    danger: true,
  });
  if (!yes) return;
  const deleteFolder = await ask({
    title: "Also delete its folder?",
    description: "Its login and conversations are in it. Cancel keeps them.",
    confirmLabel: "Delete folder",
    danger: true,
  });
  return accountSend({ op: "remove", id, deleteFolder });
}

// Re-check and Refresh: read the page again and say so, because when nothing changed the page looks the same.
export async function recheck(id: string, done: string) {
  if (getSettings().busy === id) return;
  setSettings({ busy: id });
  await loadSettings();
  setSettings({ busy: "" });
  toast(done);
}
// ---- Skills (/skills, /rea)
const WARN: Record<string, string> = {
  "kaizen-computer":
    "They see the window text of the apps they open and can click, set values and type in them, as you. A password manager is blocked by its name only, so one inside a browser or under another name is not. Any other open app is in reach.",
  "lemo-opuscar":
    "The first time an agent uses it, it downloads the Lemo-Opuscar style library from github.com/lemomo-ai/lemo-opuscar (MIT) into ~/lemo-opuscar and installs its Node and Python packages there. It needs git, Node, Python and ffmpeg, and it runs that project's code on your computer.",
};
const WARN_TITLE: Record<string, string> = {
  "kaizen-computer": "Let agents read and operate the apps on your desktop?",
  "lemo-opuscar": "Add film styles from Lemo-Opuscar?",
};
const token = () => getSettings().data?.skills?.token ?? "";
export async function setSkill(id: string, on: boolean, offByDefault: boolean) {
  if (id === "rea") return reaSwitch(on, false);
  // An off-by-default skill gives agents a power the user never had to grant: say so, then ask.
  const warn = on && offByDefault;
  if (
    warn &&
    !(await ask({
      title: WARN_TITLE[id] ?? "Turn this skill on?",
      description: WARN[id],
      confirmLabel: "Turn on",
    }))
  )
    return;
  const j = await post("/skills", { id, on, ...(warn ? { confirm: true, token: token() } : {}) });
  toast(j.error ? j.error : "Saved. Applies to new sessions");
  await reload();
}
// A skill an agent lacks, or has as a dead or foreign link: relink it. Links just go; a real folder in the way (the server
// answers "replace required") is replaced only after asking.
export async function repairSkill(id: string) {
  // Quiet first try: post() would toast "replace required" before the question below.
  let j: Record<string, any> = await fetch("/skills", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, repair: true }),
  })
    .then((r) => r.json())
    .catch(() => ({ error: "The kaizen server is not running" }));
  if (j.error === "replace required") {
    if (
      !(await ask({
        title: "Replace your own copy?",
        description:
          "For at least one agent, a folder of the same name is in the way. It is deleted and kaizen's skill is linked in its place. Go ahead?",
        confirmLabel: "Replace",
        danger: true,
      }))
    )
      return reload();
    j = await post("/skills", { id, repair: true, replace: true, token: j.token ?? "" });
    if (!j.error) toast("Repaired. Applies to new sessions");
  } else toast(j.error ? j.error : "Repaired. Applies to new sessions");
  await reload();
}
// The desktop app's one-time setup: kaizen copied to ~/kaizen and linked into every agent (POST /skills {setup}).
let settingUp = false;
export async function setupAgents() {
  if (settingUp) return;
  settingUp = true;
  toast("Setting up kaizen for your agents…");
  try {
    const j = await post("/skills", { setup: true });
    if (!j.error) toast(j.note ? `Set up. ${j.note}` : "Set up. Your agents have kaizen's skills, subagents and commands");
  } finally {
    settingUp = false;
  }
  await reload();
}
// ---- The skill store: skills.sh and Anthropic's official plugin marketplace, through /skills/search, /skills/inspect,
// the install routes (which take only the inspect's one-time token) and the remove routes.
export type StoreHit = {
  source: string;
  name: string;
  installs: number;
  audit: { gen: string; socket: string; snyk: string; socketScore?: number };
  clean: boolean;
  installed: boolean;
};
export type PluginHit = { name: string; description: string; author: string; category: string; homepage: string; installed: boolean };
export async function searchSkills(q: string, source: "skills" | "plugins" = "skills"): Promise<{ hits: any[]; error?: string }> {
  try {
    const r = await fetch("/skills/search?q=" + encodeURIComponent(q) + (source === "plugins" ? "&source=plugins" : ""));
    return r.ok ? await r.json() : { hits: [], error: "The search did not work" };
  } catch {
    return { hits: [], error: "kaizen is not answering" };
  }
}
const auditLine = (a: StoreHit["audit"]) =>
  `Gen Agent Trust Hub: ${a.gen}\nSocket: ${a.socket}${a.socketScore != null ? ` (score ${a.socketScore})` : ""}\nSnyk: ${a.snyk}`;
// What kaizen's own scan said, in a few lines.
const scanLines = (s: any) =>
  !s
    ? ""
    : !s.ran
      ? `Cisco skill-scanner: did not run (${s.why}).`
      : s.count === 0
        ? "Cisco skill-scanner: no findings (its rules alone catch only part of what a bad skill can do)."
        : `Cisco skill-scanner: ${s.count} finding${s.count === 1 ? "" : "s"}, worst ${s.worst.toLowerCase()}:\n` +
          s.findings
            .slice(0, 6)
            .map((f: any) => `  ${f.severity.toLowerCase()}: ${f.title}${f.file ? ` (${f.file})` : ""}`)
            .join("\n");
const list = (label: string, xs: string[]) => (xs.length ? `${label}: ${xs.join(", ")}` : "");
async function inspect(body: Record<string, unknown>, key: string) {
  setSettings({ busy: "look-" + key });
  toast("Looking at it first: downloading a copy and scanning it…");
  const j = await post("/skills/inspect", body);
  setSettings({ busy: "" });
  if (j.node) toast("Node.js is needed to install skills. Set it up from the REA row under Optional, or from nodejs.org");
  return j.token ? j : null;
}
// A skills.sh skill: kaizen looks first. Clean audits and no scan finding ask once; anything else asks again, with a
// tick box, and only then is `risky` sent.
export async function installStoreSkill(h: StoreHit): Promise<boolean> {
  const look = await inspect({ kind: "skill", source: h.source, name: h.name }, h.name);
  if (!look) return false;
  const agents = (getSettings().data?.skills?.skills?.[0]?.agents ?? []).map((a: any) => a.agent).join(", ");
  const where = `From ${h.source} on GitHub, through skills.sh. It goes in ~/.agents/skills/${h.name} and is linked to the agents found on this computer${agents ? ` (${agents})` : ""}.`;
  const facts = `${auditLine(look.audit)}\n\n${scanLines(look.scan)}`;
  const yes = look.careful
    ? await ask({
        title: "This skill needs a closer look",
        description: `${h.name} from ${h.source}\n\n${facts}\n\nA skill is instructions your agents follow, and it can include scripts they run. Read its audits at skills.sh/${h.source}/${h.name} before you install it.\n\n${where}`,
        confirmLabel: "Install anyway",
        danger: true,
        ack: "I've checked it and want to install it anyway",
      })
    : await ask({ title: `Install ${h.name}?`, description: `${where}\n\n${facts}`, confirmLabel: "Install" });
  if (!yes) return false;
  setSettings({ busy: "store-" + h.name });
  toast(`Installing ${h.name}…`);
  const j = await post("/skills/install", { source: h.source, name: h.name, token: look.token, ...(look.careful ? { risky: true } : {}) });
  setSettings({ busy: "" });
  if (j.ok) toast(`${h.name} is installed. Applies to new sessions`);
  await reload();
  return !!j.ok;
}
// A Claude Code plugin: no audit exists, and hooks and MCP servers run code, so it always asks twice and lists what it
// brings.
export async function installStorePlugin(p: PluginHit): Promise<boolean> {
  const look = await inspect({ kind: "plugin", name: p.name }, p.name);
  if (!look) return false;
  const b = look.brings ?? {};
  const what = b.read
    ? [
        list("Hooks (run on Claude Code events, in every session)", b.hooks),
        list("MCP servers (programs Claude Code starts)", b.mcp),
        list("Commands", b.commands),
        list("Agents", b.agents),
        list("Skills", b.skills),
      ]
        .filter(Boolean)
        .join("\n") || "Nothing kaizen could list (no hooks, MCP servers, commands, agents or skills found)."
    : "kaizen could not read what it brings, so it may run hooks or MCP servers.";
  const yes = await ask({
    title: `Install the ${p.name} plugin?`,
    description: `By ${p.author || "an unnamed author"}${p.category ? `, ${p.category}` : ""}. From Anthropic's official marketplace; plugins have no security audit.\n\n${what}\n\n${scanLines(look.scan)}\n\nIt is installed for Claude Code only (claude plugin install ${p.name}@claude-plugins-official). Restart Claude Code to load it.`,
    confirmLabel: "Install plugin",
    danger: true,
    ack: "I've checked what it brings and want to install it",
  });
  if (!yes) return false;
  setSettings({ busy: "store-" + p.name });
  toast(`Installing ${p.name}…`);
  const j = await post("/skills/plugin-install", { name: p.name, token: look.token, risky: true });
  setSettings({ busy: "" });
  if (j.ok) toast(`${p.name} is installed. Restart Claude Code to load it`);
  await reload();
  return !!j.ok;
}
async function removeFrom(route: string, body: Record<string, string>, what: string, done: string) {
  const name = body.name!;
  if (!(await ask({ title: `Remove ${name}?`, description: what, confirmLabel: "Remove", danger: true }))) return;
  setSettings({ busy: "store-" + name });
  const j = await post(route, { ...body, token: token() });
  setSettings({ busy: "" });
  if (j.ok) toast(done);
  await reload();
}
// A skill in the agents' folders. One kaizen installed goes through skills.sh's own remove; a link is unlinked and what
// it points at stays; a folder moves to ~/.kaizen/removed-skills, so a skill nobody can install again is not lost.
export function removeMySkill(s: { id: string; origin: string; path: string }) {
  const what =
    s.origin === "store"
      ? "It is removed from every agent it was linked to. You can install it again from Find skills."
      : s.origin === "link"
        ? `Its links in your agents' skills folders are removed. What they point at stays: ${s.path}`
        : "It is removed from every agent's skills folder. Its folders move to ~/.kaizen/removed-skills, so you can put it back by hand if it is not on Find skills.";
  return removeFrom("/skills/remove", { name: s.id }, what, `${s.id} removed`);
}
// An installed Claude Code plugin, for the user, whoever installed it.
export function removePlugin(p: { plugin: string; marketplace: string; skills: unknown[] }) {
  const n = p.skills.length;
  const what = `This runs claude plugin uninstall ${p.plugin}@${p.marketplace}${n ? `, and its ${n} skill${n === 1 ? "" : "s"} go with it` : ""}. You can install it again with claude plugin install${p.marketplace === "claude-plugins-official" ? " or from Find skills" : ""}. Restart Claude Code for it to leave open sessions.`;
  return removeFrom("/skills/plugin-remove", { name: p.plugin, marketplace: p.marketplace }, what, `${p.plugin} uninstalled`);
}
// REA: the board runs REA's dry run first and shows what would change; only a yes to that exact plan is applied. Off
// runs REA's own uninstall, whoever set REA up.
export async function reaSwitch(on: boolean, update: boolean) {
  if (!on) {
    const yes = await ask({
      title: "Turn REA off?",
      description:
        "This runs REA's own uninstall: it removes REA's MCP registration and skill from every agent, also a REA you set up yourself outside kaizen. Ghidra, Java and REA's data stay.",
      confirmLabel: "Turn off",
      danger: true,
    });
    if (!yes) return;
    toast("Removing REA…");
    const j = await post("/rea", { step: "off" });
    if (!j.error)
      toast(j.hint ? `REA removed. Claude still has one: run ${j.hint}` : "REA removed. Restart your agents");
    return reload();
  }
  toast(update ? "Checking the newest REA…" : "Asking REA what it would change… (first time downloads REA)");
  const plan = await post("/rea", { step: "plan", update });
  if (plan.error) return reload();
  const files = plan.files?.length ? plan.files.map((f: string) => "  " + f).join("\n") : "  (REA did not list files)";
  const yes = await ask({
    title: `${update ? "Update" : "Set up"} REA ${plan.version} for: ${plan.clients.join(", ")}`,
    description: `REA's setup will change:\n${files}\n\nIt backs each file up first. Agents can then run REA's reverse-engineering tools on files you point them at. Go ahead?`,
    confirmLabel: update ? "Update" : "Set up",
  });
  if (!yes) return;
  toast(update ? "Updating REA…" : "Setting up REA…");
  const j = await post("/rea", { step: "apply", confirm: true, token: plan.token });
  if (!j.error) toast(`REA ${j.version} is set up. Restart your agents to load its tools`);
  return reload();
}
export async function reaNode(state: string, command: string) {
  const what = state === "missing" ? "Install" : "Update";
  const yes = await ask({
    title: `${what} Node.js?`,
    description: `REA needs it. kaizen will run:\n  ${command}\n\nThis installs Node.js for the whole computer, so other apps that use Node.js get it too. Your system may ask for permission. Go ahead?`,
    confirmLabel: what,
  });
  if (!yes) return;
  setSettings({ busy: "rea-node" });
  toast(`${what === "Install" ? "Installing" : "Updating"} Node.js… this can take a few minutes`);
  const j = await post("/rea", { step: "node", confirm: true, token: token() });
  if (!j.error) toast("Node.js is ready. Restart any agents that are open so REA's tools load");
  setSettings({ busy: "" });
  await reload();
}

// ---- Automations (/automations)
export async function automationOp(op: string, id = "") {
  const { draft, editing, data } = getSettings();
  const d = data?.automations;
  if (op === "edit") {
    const r = d.rules.find((x: any) => x.id === id);
    setSettings({
      editing: id,
      draft: {
        ...draft,
        name: r.name,
        text: r.text,
        kind: r.kind,
        cron: r.cron,
        agent: r.agent ?? "",
        precheck: r.precheck ?? "",
        precheck_timeout: String(r.precheck_timeout),
        grace_minutes: String(r.grace_minutes),
        time: "09:00",
        day: "mon",
      },
    });
    return;
  }
  if (op === "cancel") return setSettings({ editing: "" });
  if (
    op === "delete" &&
    !(await ask({
      title: "Delete this automation and its history?",
      confirmLabel: "Delete",
      danger: true,
    }))
  )
    return;
  const j = await post(
    "/automations",
    op === "save" ? { op: editing ? "update" : "create", id: editing, ...draft } : { op, id },
  );
  if (j.error) return toast(j.error);
  if (op === "save") {
    const next = { ...draft };
    for (const k of ["name", "text", "cron", "agent", "precheck"]) delete next[k];
    setSettings({ editing: "", draft: next });
    toast("Saved");
  } else if (op === "run")
    toast(j.ok ? "Started" : (j.status ?? "not started").replace(/_/g, " ") + (j.why ? ": " + j.why : ""));
  await reload();
}
export const setDraft = (k: string, v: string) => setSettings((s) => ({ draft: { ...s.draft, [k]: v } }));

// ---- Storage (/cleanup)
export async function cleanup(what: "records" | "runs") {
  const d = getSettings().data?.cleanup;
  if (!d) return;
  const where = d.project ? ` in ${d.project}` : "";
  const total = d.records.abandoned + d.records.unowned + d.records.gone;
  const yes = await ask(
    what === "records"
      ? { title: `Delete ${total} launch records${where}?`, confirmLabel: "Delete", danger: true }
      : {
          title: `Permanently delete ${d.runs} finished runs${where}?`,
          description: "Their plans, reviews and reports go, and this cannot be undone.",
          confirmLabel: "Delete",
          danger: true,
        },
  );
  if (!yes) return;
  const j = await post("/cleanup", { what });
  toast(j.error ?? `Removed ${j.removed}`);
  await reload();
}

// ---- Google and Firecrawl
export async function saveGoogleClient(id: string, secret: string) {
  const j = await post("/google", { op: "client", id, secret });
  toast(j.ok ? "Saved" : j.error || "Enter both the client id and the secret");
  setSettings((s) => ({ typed: { ...s.typed, "gg-id": "", "gg-secret": "" } }));
  await reload();
}
export async function googleConnect(connected: boolean) {
  if (connected) {
    await post("/google", { op: "disconnect" });
    return reload();
  }
  const w = window.open("", "_blank");
  const j = await post("/google", { op: "connect" });
  if (j.ok && w) w.location = j.url;
  else {
    w?.close();
    toast(j.error || "Could not start Google sign-in");
  }
}
export async function saveResearchKey(key: string) {
  if (!key.trim()) return toast("Paste your Firecrawl API key first");
  const j = await post("/research-key", { op: "save", key: key.trim() });
  if (j.set) toast("Saved. kaizen search now uses Firecrawl");
  setSettings((s) => ({ typed: { ...s.typed, "fc-key": "" } }));
  await reload();
}
export async function testResearchKey() {
  setSettings({ busy: "fc-test" });
  const j = await post("/research-key", { op: "test" });
  setSettings({ busy: "" });
  if (j.tested) toast("Firecrawl answered. The key works");
  else if (j.error) toast(j.error);
}
export async function removeResearchKey() {
  const yes = await ask({
    title: "Remove the saved Firecrawl key?",
    description: "Agents fall back to their own web tools.",
    confirmLabel: "Remove",
    danger: true,
  });
  if (!yes) return;
  await post("/research-key", { op: "remove" });
  await reload();
}

// ---- this browser's own choices: nothing to read back, so the control answers at once
const keep = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};
export function setBrowserPref(kind: "theme" | "color" | "motion", v: string) {
  setSettings((s) => ({ prefs: { ...s.prefs, [kind]: v } }));
  ({ theme: setTheme, color: setColor, motion: setMotion })[kind](v);
}
export function setFont(n: number) {
  host.font.set(n);
  setSettings((s) => ({ prefs: { ...s.prefs, font: n } }));
}
export function setNotify(on: boolean) {
  keep("kz-notify", on ? "on" : "off");
  if (on) host.notify();
  setSettings((s) => ({ prefs: { ...s.prefs, notify: on } }));
  // The browser's answer to the question changes the help line.
  setTimeout(() => void loadSettings(), 300);
}
export function setHaptic(on: boolean) {
  keep("kz-haptic", on ? "on" : "off");
  setSettings((s) => ({ prefs: { ...s.prefs, haptic: on } }));
}
export function setSound(v: string) {
  keep("kz-sound", v);
  host.notices.play(v);
  setSettings((s) => ({ prefs: { ...s.prefs, sound: v } }));
}

// ---- the page itself
// The page goes in the address, without a history step per page: Back to app leaves in one.
export function pickPage(id: string) {
  setSettings({ page: id });
  history.replaceState(null, "", "?view=settings" + (id ? "&page=" + id : ""));
}
export function pickScope(scope: string) {
  if (scope === getSettings().scope) return;
  setSettings({ scope });
  void loadSettings();
}
