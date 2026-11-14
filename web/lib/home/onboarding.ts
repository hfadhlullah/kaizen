// First-run onboarding: one panel over the board with four steps (default agent, look, notifications, phone), then "Add
// your first project". Where a user got to is kept by the board in ~/.kaizen/onboarding.json (/onboarding), so a skipped or
// half-done flow can be continued from the side menu's Setup row or the "Continue setup?" popup. Existing users, who have a
// project, never see it. This file is its rules and requests; components/home/onboarding-dialog.tsx draws it.
import { create } from "zustand";
import { openAdd } from "@lib/project";
import { ask } from "@lib/core";
import { setSetupRow, setShell, setTheme } from "@lib/shell";

export type Cfg = {
  show: boolean;
  resume: boolean;
  step: number;
  total: number;
  default: string;
  installed: string[];
  agents: { cmd: string; name: string }[];
  install: Record<string, { command?: string; docs: string }>;
};
export type Notif = "na" | "default" | "granted" | "denied";
// The tools agent.default accepts.
export const PICKABLE = ["claude", "codex", "agy", "opencode", "gemini"];
export const NAMES = ["Default agent", "Appearance", "Notifications", "Phone"];
export const COPY = [
  {
    title: "Pick your default agent",
    sub: "kaizen works with every CLI agent. Choose the one you will reach for most. You can change it any time in Settings.",
  },
  { title: "Choose your look", sub: "Follow your system, or pick light or dark. You can change it any time." },
  { title: "Set up notifications", sub: "kaizen can tell you when a run needs you or an agent is done." },
  {
    title: "Use kaizen on your phone",
    sub: "Optional. Check runs and answer agents from your phone. Continue to skip; it is also in Settings → Phone.",
  },
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
// The agent picked when the flow opens: the saved default, else the first one found.
export const defaultPick = (c: Cfg) =>
  PICKABLE.includes(c.default)
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
  c.step > 0
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
type Flow = { step: number; agent: string; theme: string; more: boolean };
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
    },
  });
}
// The agent picked on the first step is saved when the user leaves it, by Continue or by a progress bar.
const keepAgent = () => {
  const f = get().flow;
  return f && f.step === 0 && f.agent ? call("/settings", { key: "agent.default", value: f.agent }) : null;
};
export const pickAgent = (agent: string) => edit({ agent });
export const toggleMore = () => edit({ more: !get().flow?.more });
export function pickTheme(theme: string) {
  edit({ theme });
  setTheme(theme);
}
export async function next() {
  const { cfg, flow } = get();
  if (!cfg || !flow) return;
  await keepAgent();
  if (flow.step < cfg.total - 1) {
    edit({ step: flow.step + 1 });
    return void save({ step: flow.step + 1 });
  }
  void save({ outcome: "done" });
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
export async function initOnboarding() {
  const cfg: Cfg | null = await call("/onboarding");
  if (!cfg) return;
  set({ cfg });
  setSetupRow(cfg);
  setShell({ openSetup: () => openFlow(cfg.step) });
  const q = new URLSearchParams(location.search);
  if (q.has("setup")) {
    q.delete("setup");
    history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
    return openFlow(cfg.resume ? cfg.step : 0);
  }
  if (cfg.show) return openFlow(0);
  if (cfg.resume) offer();
}
