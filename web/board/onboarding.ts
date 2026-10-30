// First-run onboarding: one panel over the board with three steps (default agent, look,
// notifications), then "Add your first project". Where a user got to is kept by the board in
// ~/.kaizen/onboarding.json (/onboarding), so a skipped or half-done flow can be continued from the
// side menu's Setup row or the "Continue setup?" popup. Existing users, who have a project, never see it.
import { html, raw } from "./dom.ts";
import { openAdd } from "./add-project.ts";

type Cfg = { show: boolean; resume: boolean; step: number; total: number; default: string; installed: string[]; agents: { cmd: string; name: string }[]; install: Record<string, { command?: string; docs: string }> };
// The tools agent.default accepts.
const PICKABLE = ["claude", "codex", "agy", "opencode", "gemini"];
const MOD = /Mac|iP(hone|ad)/.test(navigator.platform) ? "⌘" : "Ctrl";
const NAMES = ["Default agent", "Appearance", "Notifications"];
const ASKED = "kz-onb-asked";

async function call(path: string, body?: object) {
  try {
    const r = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

let cfg: Cfg | null = null;
let dlg: HTMLDialogElement | null = null;
let step = 0;
let agent = "";
let theme = "system";
let more = false;

// The side menu's Setup row follows what is saved.
const row = (s: number, outcome: string | null) =>
  (window as any).kzSetupRow?.({ resume: outcome === "skipped" || (outcome === null && s > 0), step: s, total: cfg?.total ?? 3 });

const save = (patch: { step?: number; outcome?: string | null }) => {
  row(patch.step ?? step, patch.outcome ?? null);
  return call("/onboarding", patch);
};

function storedTheme() {
  try {
    const t = localStorage.getItem("kz-theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}
const notif = () => (!("Notification" in window) || !window.isSecureContext ? "na" : Notification.permission);

const preview = (k: string) => html`<span class="pv ${k}"><i class="sb"></i><i class="ln"></i><i class="ln s"></i></span>`;

function agents() {
  const c = cfg!;
  const all = c.agents.filter((a) => PICKABLE.includes(a.cmd));
  const det = all.filter((a) => c.installed.includes(a.cmd)),
    rest = all.filter((a) => !c.installed.includes(a.cmd));
  const card = (a: { cmd: string; name: string }, off: boolean) =>
    html`<button type="button" class="onb-card" role="radio" aria-checked="${String(agent === a.cmd)}" data-agent="${a.cmd}"><svg><use href="#c-${a.cmd}"/></svg><span>${a.name}${off ? html`<small>Not found</small>` : ""}</span><i class="ck"></i></button>`;
  // The picked agent is not on PATH: how to install it, and that carrying on is fine.
  const sel = all.find((a) => a.cmd === agent && !c.installed.includes(a.cmd));
  const how = sel ? c.install?.[sel.cmd] : null;
  const help = sel
    ? html`<div class="onb-panel"><p><b>${sel.name}</b> is not installed yet.${how?.command ? " Run this in a terminal, then open kaizen again." : ""} You can carry on now: kaizen uses it as soon as it is on your PATH.</p>${how?.command ? html`<div class="onb-cmd"><code>${how.command}</code><button type="button" class="btn" data-a="copy" data-cmd="${how.command}">Copy</button></div>` : ""}${how ? html`<a class="onb-lnk" href="${how.docs}" target="_blank" rel="noopener">Install instructions</a>` : ""}</div>`
    : "";
  if (!det.length)
    return html`<p class="onb-note">No agents found on your PATH. Pick the one you will use to see how to install it, or carry on.</p><div class="onb-grid" role="radiogroup" aria-label="Default agent">${all.map((a) => card(a, true))}</div>${help}`;
  return html`<div class="onb-lbl">Detected on your system <span>${det.length}</span></div><div class="onb-grid" role="radiogroup" aria-label="Default agent">${det.map((a) => card(a, false))}${more ? rest.map((a) => card(a, true)) : ""}</div>${rest.length ? html`<button type="button" class="onb-lnk" data-a="more">${more ? "Hide agents" : `Show ${rest.length} more ${rest.length === 1 ? "agent" : "agents"} →`}</button>` : ""}${help}`;
}

function looks() {
  const t = (k: string, name: string, hint: string, ic: string) =>
    html`<button type="button" class="onb-card th" role="radio" aria-checked="${String(theme === k)}" data-theme="${k}">${preview(k)}<span class="cap"><b>${raw(ic)}${name}</b><small>${hint}</small></span><i class="ck"></i></button>`;
  const I = (d: string) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;
  return html`<div class="onb-themes" role="radiogroup" aria-label="Theme">${t("system", "System", "Match OS", I("M3 5h18v11H3zM8 20h8M12 16v4"))}${t("dark", "Dark", "Easy on the eyes", I("M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"))}${t("light", "Light", "Bright & crisp", I("M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"))}</div><p class="onb-note"><svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M8 15v4"/></svg><span>Motion, density and more live in <b>Settings</b>.</span></p>`;
}

function alerts() {
  const s = notif();
  const msg = {
    na: "Notifications are not available at this address. Open the board at localhost or over HTTPS to turn them on.",
    default: "Allow notifications so a run that needs you, or an agent that finishes, reaches you in another window.",
    granted: "Notifications are on. kaizen will tell you when a run needs you or an agent is done.",
    denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then come back.",
  }[s];
  return html`<div class="onb-panel"><p>${msg}</p><div class="onb-row">${s === "default" ? html`<button type="button" class="btn pri" data-a="allow">Allow notifications</button>` : ""}${s === "granted" ? html`<button type="button" class="btn" data-a="test">Send test notification</button>` : ""}</div></div>`;
}

const COPY = [
  { title: "Pick your default agent", sub: "kaizen works with every CLI agent. Choose the one you will reach for most. You can change it any time in Settings.", body: agents },
  { title: "Choose your look", sub: "Follow your system, or pick light or dark. You can change it any time.", body: looks },
  { title: "Set up notifications", sub: "kaizen can tell you when a run needs you or an agent is done.", body: alerts },
];

function draw() {
  const c = cfg!,
    last = step === c.total - 1,
    s = COPY[step];
  dlg!.innerHTML = String(html`
    <div class="onb-hd"><pre class="mark"><span>█ █  ▄▀█  █  ▀▀█  █▀▀  █▄ █</span>
<span>█▀▄  █▀█  █   ▄▀  ██▄  █ ▀█</span>
<span>█ █  █ █  █  █▄▄  █▄▄  █  █</span></pre></div>
    <div class="onb-prog">${COPY.map((_, i) => html`<button type="button" class="${i === step ? "on" : i < step ? "was" : ""}" data-s="${i}" aria-label="Go to step ${i + 1}: ${NAMES[i]}" title="${NAMES[i]}"></button>`)}<span>${step + 1} of ${c.total}</span></div>
    <div class="onb-main">${step === 0 ? html`<small class="onb-eb">Welcome to kaizen</small>` : ""}<h2>${s.title}</h2><p class="onb-sub">${s.sub}</p>${s.body()}</div>
    <div class="onb-ft"><button type="button" class="onb-lnk" data-a="skip">Skip to project setup</button><span></span>${step > 0 ? html`<button type="button" class="btn" data-a="back">‹ Back</button>` : ""}<button type="button" class="btn pri" data-a="next">${last ? "Add your first project" : "Continue"}<kbd>${MOD} ↵</kbd></button></div>`);
  dlg!.querySelector<HTMLElement>(step === 0 ? ".onb-card[aria-checked=true]" : "[data-a=next]")?.focus();
}

function close() {
  dlg?.close();
  dlg?.remove();
  dlg = null;
}

// The agent picked on the first step is saved when the user leaves it, by Continue or by a progress bar.
const keepAgent = () => (step === 0 && agent ? call("/settings", { key: "agent.default", value: agent }) : null);

async function next() {
  const c = cfg!;
  await keepAgent();
  if (step < c.total - 1) {
    step++;
    void save({ step });
    return draw();
  }
  void save({ outcome: "done" });
  close();
  openAdd({ start: "folder" });
}

function ask(title: string, text: string, btns: [string, string, boolean?][]) {
  return new Promise<string>((res) => {
    const d = document.createElement("dialog");
    d.className = "onb-ask";
    d.innerHTML = String(html`<h3>${title}</h3><p>${text}</p><div class="onb-row">${btns.map(([k, l, pri]) => html`<button type="button" class="btn${pri ? " pri" : ""}" data-k="${k}">${l}</button>`)}</div>`);
    d.oncancel = (e) => (e.preventDefault(), d.close(), d.remove(), res(btns[btns.length - 1][0]));
    d.onclick = (e) => {
      const k = (e.target as HTMLElement).closest<HTMLElement>("[data-k]")?.dataset.k;
      if (k) (d.close(), d.remove(), res(k));
    };
    document.body.appendChild(d);
    d.showModal();
    d.querySelector<HTMLElement>(".pri")?.focus();
  });
}

async function skip() {
  if ((await ask("Skip onboarding?", "It won't take long!", [["skip", "Skip"], ["keep", "No, keep going", true]])) !== "skip") return;
  void save({ outcome: "skipped" });
  close();
  openAdd({ start: "folder" });
}

function open(at: number) {
  if (dlg || !cfg) return;
  step = Math.max(0, Math.min(cfg.total - 1, at));
  agent = PICKABLE.includes(cfg.default) ? cfg.default : (cfg.agents.find((a) => PICKABLE.includes(a.cmd) && cfg!.installed.includes(a.cmd))?.cmd ?? "");
  theme = storedTheme();
  more = false;
  dlg = document.createElement("dialog");
  dlg.className = "onb";
  dlg.setAttribute("aria-label", "Welcome to kaizen");
  dlg.oncancel = (e) => (e.preventDefault(), void skip());
  dlg.onclick = (e) => {
    const t = e.target as HTMLElement;
    const b = t.closest<HTMLElement>("button");
    if (!b) return;
    const d = b.dataset;
    if (d.agent) ((agent = d.agent), draw());
    else if (d.theme) {
      theme = d.theme;
      (window as any).setTheme?.(theme);
      draw();
    } else if (d.s) (void keepAgent(), (step = +d.s), void save({ step }), draw());
    else if (d.a === "more") ((more = !more), draw());
    else if (d.a === "back") (step--, void save({ step }), draw());
    else if (d.a === "next") void next();
    else if (d.a === "skip") void skip();
    else if (d.a === "allow") void Notification.requestPermission().then(draw, draw);
    else if (d.a === "copy") {
      void navigator.clipboard?.writeText(d.cmd ?? "").then(() => (b.textContent = "Copied"), () => (b.textContent = "Select and copy"));
    } else if (d.a === "test") new Notification("kaizen", { body: "This is how kaizen will tell you something needs you.", icon: "/logo.png" });
  };
  // Ctrl/Cmd+Enter always continues; a bare Enter does unless a button (other than a choice card) or field holds focus.
  dlg.onkeydown = (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    const on = (e.target as HTMLElement).closest("button:not(.onb-card),input,select,textarea");
    if (e.ctrlKey || e.metaKey || !on) (e.preventDefault(), void next());
  };
  document.body.appendChild(dlg);
  dlg.showModal();
  draw();
}

// The popup for someone who skipped or left it half done: once per browser session.
async function offer() {
  try {
    if (sessionStorage.getItem(ASKED)) return;
    sessionStorage.setItem(ASKED, "1");
  } catch {}
  const c = cfg!;
  const r = await ask("Continue setup?", c.step > 0 ? `You are on step ${c.step + 1} of ${c.total}. It only takes a minute.` : "You skipped setup. It only takes a minute.", [
    ["go", "Continue", true],
    ["later", "Not now"],
    ["never", "Don't ask again"],
  ]);
  if (r === "go") open(c.step);
  else if (r === "never") (void save({ outcome: "dismissed" }), row(0, "dismissed"));
}

export async function initOnboarding() {
  cfg = await call("/onboarding");
  if (!cfg) return;
  (window as any).kzSetupRow?.(cfg);
  document.getElementById("rsetup")?.addEventListener("click", (e) => (e.preventDefault(), open(cfg!.step)));
  const q = new URLSearchParams(location.search);
  if (q.has("setup")) {
    q.delete("setup");
    history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
    return open(cfg.resume ? cfg.step : 0);
  }
  if (cfg.show) return open(0);
  if (cfg.resume) void offer();
}
