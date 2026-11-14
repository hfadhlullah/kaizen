// Settings' state (Zustand): what the eight routes answered, the scope, the page and the search, the browser's own
// choices, and the small things a redraw must not lose (open agent rows, the automation form, a value on its way to
// the server). The board's old code only opens the page (web/board/settings.ts); everything else is here.
import { create } from "zustand";
import { host } from "@lib/core";
import type { Data } from "./settings.ts";

export type Prefs = {
  theme: string;
  color: string;
  motion: string;
  font: number;
  notify: boolean;
  haptic: boolean;
  sound: string;
};
export type SettingsState = {
  data: Data | null; // null: loading, so the page draws its skeleton
  scope: string; // "all" or a project's state dir; opening always starts on All projects
  page: string | null; // the page picked; null is the list on a phone, the first page on a desktop
  q: string; // the search box, which survives a save
  back: boolean; // opened from another page: Back to app goes back, not Home
  prefs: Prefs;
  local: Record<string, string>; // a setting's value the moment it is picked, until the server's answer is read
  openAgents: string[]; // agent rows left open
  draft: Record<string, string>; // the new-automation form
  editing: string; // the automation being edited
  busy: string; // the id of a button whose request is on its way
  typed: Record<string, string>; // what is typed in a key or secret box and not sent yet, by field id
};
const AUTO_DRAFT = { kind: "daily", time: "09:00", day: "mon", grace_minutes: "720", precheck_timeout: "60" };
export const readPrefs = (): Prefs => {
  const r = document.documentElement.dataset;
  let haptic = true;
  try {
    haptic = localStorage.getItem("kz-haptic") !== "off";
  } catch {}
  return {
    theme: r.theme || "system",
    color: r.color || "monochrome",
    motion: r.motion || "system",
    font: host.font.read(),
    notify: host.notices.on(),
    haptic,
    sound: host.notices.sound(),
  };
};
export const useSettings = create<SettingsState>()(() => ({
  data: null,
  scope: "all",
  page: null,
  q: "",
  back: false,
  prefs: readPrefs(),
  local: {},
  openAgents: [],
  draft: { ...AUTO_DRAFT },
  editing: "",
  busy: "",
  typed: {},
}));
export const setTyped = (k: string, v: string) => setSettings((s) => ({ typed: { ...s.typed, [k]: v } }));
export const getSettings = useSettings.getState;
export const setSettings = useSettings.setState;
export const resetAutoDraft = () => setSettings({ draft: { ...AUTO_DRAFT }, editing: "" });

// A slow answer must not paint over a newer one, or one page under another's title.
let gen = 0;
export const settingsGen = () => gen;
export const bumpSettingsGen = () => ++gen;
const get = (url: string, init?: RequestInit) =>
  fetch(url, init)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
// Everything the page shows, asked for at once. With `skeleton`, the body goes now, not when the fetch answers.
export async function loadSettings(skeleton = false, stale?: () => boolean): Promise<void> {
  const mine = ++gen;
  if (skeleton) setSettings({ data: null });
  const { scope } = getSettings();
  const h = { headers: host.dirHeader() };
  const [cfg, google, research, agents, accounts, skills, automations, cleanup] = await Promise.all([
    get("/settings?scope=" + encodeURIComponent(scope)),
    get("/google"),
    get("/research-key"),
    get("/agent-prefs"),
    get("/accounts"),
    get("/skills"),
    get("/automations", h),
    get("/cleanup", h),
  ]);
  // A project the board no longer knows: fall back to All projects.
  if (!cfg && scope !== "all") {
    if (mine !== gen || stale?.()) return;
    setSettings({ scope: "all" });
    return loadSettings(false, stale);
  }
  if (mine !== gen || stale?.()) return;
  setSettings({
    data: { cfg, google: google ?? {}, research, agents, accounts, skills, automations, cleanup },
    prefs: readPrefs(),
    local: {},
  });
}
