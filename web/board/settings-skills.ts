import { AGENT_FAVICONS } from "./agent-favicons.ts";
import { post } from "./api.ts";
import { $, html, raw } from "./dom.ts";
import { toast } from "./toast.ts";

// Settings → Skills: one row per bundled skill, grouped. /skills scans the folders, so
// a new skill shows here with no change to this file.
type Row = { id: string; title: string; description: string; group: string; off: boolean; agents: { agent: string; state: string }[]; needs: { name: string; found: boolean }[]; offByDefault?: boolean; note?: string };
const GROUPS: [string, string][] = [["core", "Core"], ["media", "Media"], ["optional", "Optional"]];
const WORD: Record<string, string> = { installed: "installed", missing: "missing", other: "your own copy" };

const AGENT_CMD: Record<string, string> = { "Claude Code": "claude", Codex: "codex", Antigravity: "agy", OpenCode: "opencode", Cursor: "cursor", "Gemini CLI": "gemini" };
// One drawn mark per skill, by id; a skill without one gets the puzzle piece.
const SKILL_ICONS: Record<string, string> = {
  kaizen: '<path d="M4 7h11M4 12h7M4 17h11"/><path d="m16 11 2 2 3-4"/>',
  "kaizen-help": '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.8 2.1c-.9.6-1.3 1.1-1.3 2.1"/><path d="M12 17h.01"/>',
  "kaizen-book": '<path d="M12 6c-2-1.5-5-2-8-2v15c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2Z"/><path d="M12 6v15"/>',
  "kaizen-deck": '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M12 16v4M8 20h8M8 12l3-3 2 2 3-3"/>',
  "kaizen-computer": '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20h8M12 16v4M9 8l5 3-2 .8-.8 2Z"/>',
  "kaizen-video": '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
};
const PUZZLE = '<path d="M10 4a2 2 0 1 1 4 0v2h5v5h-2a2 2 0 1 0 0 4h2v5H5v-5h2a2 2 0 1 0 0-4H5V6h5Z"/>';
const skillIcon = (id: string) => raw(`<svg class="sk-i" viewBox="0 0 24 24" aria-hidden="true">${SKILL_ICONS[id] ?? PUZZLE}</svg>`);

const row = (s: Row) =>
  html`<div class="sk" data-q="${[s.title, s.id, s.description, s.group, "skill"].join(" ").toLowerCase()}">
    <div class="sk-h">${skillIcon(s.id)}<span class="sk-n"><b>${s.title}</b><span>${s.description}</span></span>
      ${s.group === "core" ? html`<span class="hint">Always on</span>` : html`${!s.off && s.agents.some((a) => a.state === "missing") ? html`<button type="button" class="btn" data-skill="${s.id}" data-on="true">Install</button>` : ""}<button type="button" class="chk sm${s.off ? "" : " on"}" data-skill="${s.id}" data-on="${String(s.off)}" data-warn="${String(!!s.offByDefault)}" role="switch" aria-checked="${String(!s.off)}" aria-label="${s.title}" title="${s.off ? "Off" : "On"}"></button>`}</div>
    <div class="sk-a">${s.agents.map((a) => html`<img class="sk-ag${a.state === "installed" ? "" : " off"}" src="${AGENT_FAVICONS[AGENT_CMD[a.agent] ?? ""] ?? ""}" width="18" height="18" alt="${a.agent}: ${WORD[a.state] ?? a.state}" title="${a.agent}: ${WORD[a.state] ?? a.state}">`)}${s.needs.map((n) => html`<span class="${n.found ? "" : "miss"}">Needs ${n.name}${n.found ? "" : " (not found)"}</span>`)}${s.note ? html`<span>${s.note}</span>` : ""}</div>
  </div>`;

export const skillRows = (skills: Row[]) =>
  html`${GROUPS.filter(([g]) => skills.some((s) => s.group === g)).map(([g, label], i) => html`<h3 class="sg">${label}${i ? "" : html` <button type="button" id="sk-recheck">Re-check</button>`}</h3><div class="sgrp">${skills.filter((s) => s.group === g).map(row)}</div>`)}`;

export function wireSkills(redraw: () => Promise<unknown>, token = "") {
  const again = $("sk-recheck");
  if (again) again.onclick = () => redraw();
  $("pbody").querySelectorAll<HTMLElement>("[data-skill]").forEach((b) => (b.onclick = async () => {
    const on = b.dataset.on === "true";
    // An off-by-default skill gives agents a power the user never had to grant: say so, then ask.
    const warn = on && b.dataset.warn === "true";
    if (warn && !confirm("Let agents read and operate the apps on your desktop?\n\nThey see the window text of the apps they open and can click, set values and type in them, as you. A password manager is blocked by its name only, so one inside a browser or under another name is not. Any other open app is in reach. Turn on?")) return;
    const j = await post("/skills", { id: b.dataset.skill, on, ...(warn ? { confirm: true, token } : {}) });
    toast(j.error ? j.error : "Saved. Applies to new sessions");
    await redraw();
  }));
}
