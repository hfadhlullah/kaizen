import { post } from "./api.ts";
import { $, html } from "./dom.ts";
import { toast } from "./toast.ts";

// Settings → Skills: one row per bundled skill, grouped. /skills scans the folders, so
// a new skill shows here with no change to this file.
type Row = { id: string; title: string; description: string; group: string; off: boolean; agents: { agent: string; state: string }[]; needs: { name: string; found: boolean }[] };
const GROUPS: [string, string][] = [["core", "Core"], ["media", "Media"], ["optional", "Optional"]];
const WORD: Record<string, string> = { installed: "installed", missing: "missing", other: "your own copy" };

const row = (s: Row) =>
  html`<div class="sk" data-q="${[s.title, s.id, s.description, s.group, "skill"].join(" ").toLowerCase()}">
    <div class="sk-h"><span class="sk-n"><b>${s.title}</b><span>${s.description}</span></span>
      ${s.group === "core" ? html`<span class="hint">Always on</span>` : html`${!s.off && s.agents.some((a) => a.state === "missing") ? html`<button type="button" class="btn" data-skill="${s.id}" data-on="true">Install</button>` : ""}<button type="button" class="chk sm${s.off ? "" : " on"}" data-skill="${s.id}" data-on="${String(s.off)}" role="switch" aria-checked="${String(!s.off)}" aria-label="${s.title}" title="${s.off ? "Off" : "On"}"></button>`}</div>
    <div class="sk-a">${s.agents.map((a) => html`<span class="${a.state === "missing" && !s.off ? "miss" : ""}">${a.agent}: ${WORD[a.state] ?? a.state}</span>`)}${s.needs.map((n) => html`<span class="${n.found ? "" : "miss"}">Needs ${n.name}${n.found ? "" : " (not found)"}</span>`)}</div>
  </div>`;

export const skillRows = (skills: Row[]) =>
  html`${GROUPS.filter(([g]) => skills.some((s) => s.group === g)).map(([g, label], i) => html`<h3 class="sg">${label}${i ? "" : html` <button type="button" id="sk-recheck">Re-check</button>`}</h3><div class="sgrp">${skills.filter((s) => s.group === g).map(row)}</div>`)}`;

export function wireSkills(redraw: () => Promise<unknown>) {
  const again = $("sk-recheck");
  if (again) again.onclick = () => redraw();
  $("pbody").querySelectorAll<HTMLElement>("[data-skill]").forEach((b) => (b.onclick = async () => {
    const j = await post("/skills", { id: b.dataset.skill, on: b.dataset.on === "true" });
    toast(j.error ? j.error : "Saved. Applies to new sessions");
    await redraw();
  }));
}
