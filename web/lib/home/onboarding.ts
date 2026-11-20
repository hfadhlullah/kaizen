// First-run onboarding: one panel over the board with five steps (how kaizen works, default agent, how much to ask, look and
// notifications, phone), then "Add your first project". Where a user got to is kept by the board in ~/.kaizen/onboarding.json (/onboarding), so a skipped or
// half-done flow can be continued from the side menu's Setup row or the "Continue setup?" popup. Existing users, who have a
// project, never see it. This file is its rules and requests; components/home/onboarding-dialog.tsx draws it.
import { create } from "zustand";
import { onProjectAdded, openAdd } from "@lib/project";
import { ask, toast, toastNotice } from "@lib/core";
import { setSetupRow, setShell, setTheme } from "@lib/shell";

export type Cfg = {
  show: boolean;
  resume: boolean;
  step: number;
  total: number;
  default: string;
  preset: string;
  installed: string[];
  agents: { cmd: string; name: string }[];
  install: Record<string, { command?: string; docs: string }>;
  // The desktop app on a computer without bun: how to install it there (the board's system, not the viewer's).
  bun?: { command: string; version: string } | null;
};
export type Notif = "na" | "default" | "granted" | "denied";
// The tools agent.default accepts.
export const PICKABLE = ["claude", "codex", "agy", "opencode", "gemini"];
export const NAMES = ["How it works", "Default agent", "How much to ask", "Look and alerts", "Phone"];
export const COPY = [
  {
    title: "How kaizen works",
    sub: "You describe what you want. An AI agent does it in steps, and you stay in charge.",
  },
  {
    title: "Pick your default agent",
    sub: "kaizen works with every CLI agent. Choose the one you will reach for most. You can change it any time in Settings.",
  },
  {
    title: "How much should kaizen ask you?",
    sub: "This sets how many agents work and when it stops to ask. Change it any time in Settings → Runs.",
  },
  { title: "Make it yours", sub: "Pick a look, and choose whether kaizen may tell you when it needs you." },
  {
    title: "Use kaizen on your phone",
    sub: "Optional. Check runs and answer agents from your phone. You can skip this now; it is also in Settings → Phone.",
  },
];
// The steps by what they hold, so a step can move without every number changing.
export const STEP = { works: 0, agent: 1, ask: 2, look: 3, phone: 4 } as const;
// The three presets in plain words. `id` is the preset's own name, which Settings → Runs shows.
export const ASK = [
  { id: "low", name: "You approve every step", tag: "Low · cheapest", text: "One agent session does the work. You approve the plan and the result." },
  { id: "medium", name: "Balanced", tag: "Medium · recommended", text: "Separate agents plan, build and check. You approve the plan; problems the checker finds are fixed for you." },
  { id: "ultra", name: "Hands-off", tag: "Ultra · costs the most", text: "Runs start to finish without asking, fixes problems itself and saves the work in git." },
];
// The steps' order of the flow in the first card: who does each, for the picture's colours.
export const FLOW = [
  { name: "ask", you: true },
  { name: "plan", you: false },
  { name: "approve", you: true },
  { name: "build", you: false },
  { name: "review", you: false },
];
export const NOTIF_TEXT: Record<Notif, string> = {
  na: "Notifications are not available at this address. Open kaizen at localhost or over HTTPS to turn them on.",
  default: "Allow notifications so a run that needs you, or an agent that finishes, reaches you in another window.",
  granted: "Notifications are on. kaizen will tell you when a run needs you or an agent is done.",
  denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then come back.",
};
const ASKED = "kz-onb-asked";

// The agents to show: the ones found on PATH first, the rest behind "Show more".
export function agentGroups(c: Cfg) {
  const all = c.agents.filter((a) => PICKABLE.includes(a.cmd));
  return {
    detected: all.filter((a) => c.installed.includes(a.cmd)),
    rest: all.filter((a) => !c.installed.includes(a.cmd)),
    all,
  };
}
// The agent picked when the flow opens: the saved default when it is installed, else the first one found, else none. A tool
// that is not installed is never ticked for someone; they may pick it to see how to install it.
export const defaultPick = (c: Cfg) =>
  PICKABLE.includes(c.default) && c.installed.includes(c.default)
    ? c.default
    : (c.agents.find((a) => PICKABLE.includes(a.cmd) && c.installed.includes(a.cmd))?.cmd ?? "");
// The picked agent is not on PATH: how to install it (the panel under the cards), else nothing.
export const missingPick = (c: Cfg, agent: string) => {
  const sel = agentGroups(c).all.find((a) => a.cmd === agent && !c.installed.includes(a.cmd));
  return sel ? { agent: sel, how: c.install?.[sel.cmd] ?? null } : null;
};
export const notifState = (): Notif =>
  typeof Notification === "undefined" || !isSecureContext ? "na" : (Notification.permission as Notif);
export function storedTheme(): "light" | "dark" | "system" {
  try {
    const t = localStorage.getItem("kz-theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}
export const offerText = (c: Pick<Cfg, "step" | "total">) =>
  c.step >= c.total - 1
    ? "One step left: add your first project."
    : c.step > 0
      ? `You are on step ${c.step + 1} of ${c.total}. It only takes a minute.`
      : "You skipped setup. It only takes a minute.";

async function call(path: string, body?: object) {
  try {
    const r = await fetch(
      path,
      body
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : undefined,
    );
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
// preset: the card ticked ("" when the board's settings are custom, so nothing is); picked: the user chose one, so it is saved.
export type Flow = { step: number; agent: string; theme: string; more: boolean; preset: string; picked: boolean };
export const useOnboarding = create<{ cfg: Cfg | null; flow: Flow | null; offer: boolean }>()(() => ({
  cfg: null,
  flow: null,
  offer: false,
}));
const get = useOnboarding.getState,
  set = useOnboarding.setState;
// The side menu's Setup row follows what is saved.
const row = (s: number, outcome: string | null) =>
  setSetupRow({
    resume: outcome === "skipped" || (outcome === null && s > 0),
    step: s,
    total: get().cfg?.total ?? 4,
  });
const save = (patch: { step?: number; outcome?: string | null }) => {
  row(patch.step ?? get().flow?.step ?? 0, patch.outcome ?? null);
  return call("/onboarding", patch);
};
const edit = (p: Partial<Flow>) => set((s) => ({ flow: s.flow && { ...s.flow, ...p } }));
const close = () => set({ flow: null });

export function openFlow(at: number) {
  const cfg = get().cfg;
  if (get().flow || !cfg) return;
  set({
    flow: {
      step: Math.max(0, Math.min(cfg.total - 1, at)),
      agent: defaultPick(cfg),
      theme: storedTheme(),
      more: false,
      preset: ASK.some((a) => a.id === cfg.preset) ? cfg.preset : "",
      picked: false,
    },
  });
}
// The agent picked on its step is saved when the user leaves it, by Continue or by a progress bar.
const keepAgent = () => {
  const f = get().flow;
  return f && f.step === STEP.agent && f.agent ? call("/settings", { key: "agent.default", value: f.agent }) : null;
};
// The preset is saved only when the user picked a card (and a different one than the board has): nothing changes silently, and
// custom settings are never replaced by a Continue.
const keepPreset = () => {
  const { cfg, flow } = get();
  if (!cfg || !flow || flow.step !== STEP.ask || !flow.picked || flow.preset === cfg.preset) return null;
  set({ cfg: { ...cfg, preset: flow.preset } });
  return call("/settings", { key: "preset", value: flow.preset });
};
export const pickPreset = (preset: string) => edit({ preset, picked: true });
export const pickAgent = (agent: string) => edit({ agent });
export const toggleMore = () => edit({ more: !get().flow?.more });
export function pickTheme(theme: string) {
  edit({ theme });
  setTheme(theme);
}
export async function next() {
  const { cfg, flow } = get();
  if (!cfg || !flow) return;
  await Promise.all([keepAgent(), keepPreset()]);
  if (flow.step < cfg.total - 1) {
    edit({ step: flow.step + 1 });
    return void save({ step: flow.step + 1 });
  }
  // Not "done": setup ends when a project exists (the board stops offering it then), so cancelling the add dialog leaves the Setup
  // row and the Continue setup popup waiting.
  void save({ step: flow.step });
  close();
  openAdd({ start: "folder" });
}
export function back() {
  const f = get().flow;
  if (!f) return;
  edit({ step: f.step - 1 });
  void save({ step: f.step - 1 });
}
export function goto(step: number) {
  void keepAgent();
  void keepPreset();
  edit({ step });
  void save({ step });
}
export async function skip() {
  if (!(await ask({ title: "Skip onboarding?", description: "It won't take long!", confirmLabel: "Skip" }))) return;
  void save({ outcome: "skipped" });
  close();
  openAdd({ start: "folder" });
}
// The popup for someone who skipped or left it half done: once per browser session.
export function offer() {
  try {
    if (sessionStorage.getItem(ASKED)) return;
    sessionStorage.setItem(ASKED, "1");
  } catch {}
  set({ offer: true });
}
export function answerOffer(r: "go" | "later" | "never") {
  const c = get().cfg!;
  set({ offer: false });
  if (r === "go") openFlow(c.step);
  else if (r === "never") (void save({ outcome: "dismissed" }), row(0, "dismissed"));
}
// Reads the flow's state and opens what it asks for (the flow, or the offer to continue). Returns what a caller's cleanup runs: a
// late answer after that does nothing.
// Agents need bun for the `kaizen` command. Shown each time the board opens until bun is installed and the app reopened;
// Dismiss hides it until the next app version. Settings → Skills keeps the same card.
export const copyBunCommand = (command: string) =>
  void navigator.clipboard
    ?.writeText(command)
    .then(() => toast("Copied. Paste it in a terminal, then reopen the app"))
    .catch(() => toast(command));
function offerBun(b: { command: string; version: string }) {
  try {
    if (localStorage.getItem("kz-bun-later") === b.version) return;
  } catch {
    /* no storage: show */
  }
  toastNotice(
    "kz-bun",
    "Install Bun to finish setting up kaizen",
    "Your agents need it for the kaizen command. Copy the command, run it in a terminal, then reopen the app.",
    { label: "Copy command", onClick: () => copyBunCommand(b.command) },
    () => {
      try {
        localStorage.setItem("kz-bun-later", b.version);
      } catch {
        /* shown again next time */
      }
    },
  );
}

export function initOnboarding() {
  let alive = true;
  // A project was added: the board stops offering setup, so the Setup row goes now, not on the next reload.
  const off = onProjectAdded(() =>
    void call("/onboarding").then((c: Cfg | null) => c && alive && (set({ cfg: c }), setSetupRow(c))),
  );
  void (async () => {
    const cfg: Cfg | null = await call("/onboarding");
    if (!cfg || !alive) return;
    set({ cfg });
    setSetupRow(cfg);
    setShell({ openSetup: () => openFlow(cfg.step) });
    if (cfg.bun) offerBun(cfg.bun);
    const q = new URLSearchParams(location.search);
    if (q.has("setup")) {
      q.delete("setup");
      history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
      return openFlow(cfg.resume ? cfg.step : 0);
    }
    if (cfg.show) return openFlow(0);
    if (cfg.resume) offer();
  })();
  return () => (off(), void (alive = false));
}
