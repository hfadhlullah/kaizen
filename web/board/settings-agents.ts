import { AGENT_FAVICONS } from "./agent-favicons.ts";
import { post } from "./api.ts";
import { $, html, ico } from "./dom.ts";
import { toast } from "./toast.ts";

// Settings → Agents, above the page's ordinary rows: the default, permissions and one row
// per agent. These saves are per user (/agent-prefs); only the default is scoped.
type Row = { cmd: string; name: string; installed: boolean; bypass: boolean; enabled: boolean; permissions: string; command: string; args: string; env: string[]; preview: string };
type View = { permissions: string; envWorks: boolean; agents: Row[] };

// Open rows survive the redraw each save does.
const open = new Set<string>();
const MODES = [["own", "Each agent's own settings"], ["bypass", "Bypass every permission prompt"]];

const bar = (id: string, vals: [string, string][], on: string, off = false) =>
  html`<span class="bar" id="${id}" role="group">${vals.map(([v, l]) => html`<button type="button" data-v="${v}" class="${v === on ? "on" : ""}" aria-pressed="${String(v === on)}"${off ? " disabled" : ""}>${l}</button>`)}</span>`;

function agentRow(a: Row, view: View, def: string) {
  const id = "ag-" + a.cmd;
  const allMode = MODES.find(([v]) => v === view.permissions)![1];
  return html`<div class="ag${a.installed ? "" : " gone"}" data-q="${[a.name, a.cmd, "agent installed command arguments environment permissions"].join(" ").toLowerCase()}">
    <div class="ag-h">
      <img class="ag-i" src="${AGENT_FAVICONS[a.cmd] ?? ""}" alt="" width="28" height="28">
      <span class="ag-n"><b>${a.name}</b><code>${a.command || a.cmd}</code></span>
      ${a.installed ? "" : html`<span class="hint">Not installed</span>`}
      ${bar(id + "-on", [["true", "Enabled"], ["false", "Disabled"]], String(a.enabled))}
      <button type="button" class="btn" id="${id}-def" aria-pressed="${String(def === a.cmd)}"${!a.enabled || !a.installed ? " disabled" : ""}>${def === a.cmd ? "✓ Default" : "Default"}</button>
      <button type="button" class="ib ag-more" id="${id}-more" aria-expanded="${String(open.has(a.cmd))}" aria-controls="${id}-b" aria-label="Details for ${a.name}">${ico("chev")}</button>
    </div>
    <div class="ag-b" id="${id}-b"${open.has(a.cmd) ? "" : " hidden"}>
      <label id="${id}-pl">Permissions</label>
      ${a.bypass ? html`<select class="sel" id="${id}-perm" aria-labelledby="${id}-pl">${[["all", `Same as all agents · ${allMode}`], ["own", `Use ${a.name}'s own settings`], ["bypass", "Bypass every permission prompt"]].map(([v, l]) => html`<option value="${v}"${v === a.permissions ? " selected" : ""}>${l}</option>`)}</select>` : html`<p class="hint">${a.name} has no bypass mode, so it uses its own settings.</p>`}
      <label for="${id}-cmd">Command</label>
      <input class="sel" id="${id}-cmd" value="${a.command}" placeholder="${a.cmd}" spellcheck="false" autocomplete="off">
      <label for="${id}-args">Arguments</label>
      <input class="sel" id="${id}-args" value="${a.args}" placeholder="No default arguments" spellcheck="false" autocomplete="off">
      <label>Environment</label>
      ${a.env.map((k) => html`<div class="ag-env"><code>${k}=•••</code><button type="button" class="btn" data-rm="${k}" data-agent="${a.cmd}">Remove</button></div>`)}
      <div class="ag-add"><input class="sel" id="${id}-ek" placeholder="NAME" aria-label="Variable name" spellcheck="false" autocomplete="off"><input class="sel" id="${id}-ev" type="password" placeholder="value" aria-label="Variable value" autocomplete="new-password"><button type="button" class="btn" id="${id}-ea">Add</button></div>
      <p class="hint">Don't store secrets here: values are saved as plain text in ~/.kaizen/agents.json and are visible in the process list while the agent runs.${view.envWorks ? "" : " Not applied on Windows yet."}</p>
      <label>Launch line</label>
      <pre>${a.preview}</pre>
    </div>
  </div>`;
}

export function agentRows(view: View, def: string, scopeName: string) {
  const usable = view.agents.filter((a) => a.enabled && a.installed);
  const seen = view.agents.filter((a) => a.installed).length;
  return html`<h3 class="sg">Default agent</h3><div class="sgrp"><div class="srow" data-q="default agent auto tool launches ${usable.map((a) => a.name).join(" ").toLowerCase()}"><label id="ag-def-l">Default for new agents${scopeName ? ` in ${scopeName}` : ""}</label>
    <div class="achips" role="group" aria-labelledby="ag-def-l">${[{ cmd: "auto", name: "Auto" }, ...usable].map((a) => html`<button type="button" data-def="${a.cmd}" class="${a.cmd === def ? "on" : ""}" aria-pressed="${String(a.cmd === def)}">${AGENT_FAVICONS[a.cmd] ? html`<img src="${AGENT_FAVICONS[a.cmd]}" alt="" width="16" height="16">` : ""}${a.name}${a.cmd === def ? " ✓" : ""}</button>`)}</div></div></div>
  <h3 class="sg">Permissions</h3><div class="sgrp"><div class="srow" data-q="permissions bypass yolo all agents without asking"><label for="ag-perm">All agents</label>
    <select class="sel" id="ag-perm">${MODES.map(([v, l]) => html`<option value="${v}"${v === view.permissions ? " selected" : ""}>${l}</option>`)}</select>
    <p class="hint">What every agent may do without asking, for all your projects. You can set one agent differently below. Cards show when a run uses bypass.</p></div></div>
  <h3 class="sg">Installed · ${seen} detected <button type="button" id="ag-refresh">Refresh</button></h3><div class="sgrp">${view.agents.map((a) => agentRow(a, view, def))}</div>`;
}

export function wireAgents(redraw: () => Promise<unknown>, scope: string | null) {
  const root = $("pbody");
  const save = async (patch: object) => {
    const j = await post("/agent-prefs", patch);
    toast(j.error ? j.error : "Saved");
    await redraw();
  };
  const setDefault = async (cmd: string) => {
    const j = await post("/settings", { key: "agent.default", value: cmd, scope });
    toast(j.ok ? "Saved" : j.error || "Could not save");
    await redraw();
  };
  root.querySelectorAll<HTMLElement>("[data-def]").forEach((b) => (b.onclick = () => setDefault(b.dataset.def!)));
  $("ag-refresh").onclick = () => redraw();
  $("ag-perm").onchange = (e) => {
    const v = e.target.value;
    if (v === "bypass" && !confirm("Agents will run commands without asking, in every project. Turn on bypass?")) return redraw();
    save({ permissions: v });
  };
  root.querySelectorAll<HTMLElement>("[data-rm]").forEach((b) => (b.onclick = () => save({ agent: b.dataset.agent, envRemove: b.dataset.rm })));
  root.querySelectorAll<HTMLElement>(".ag-more").forEach((b) => (b.onclick = () => {
    const cmd = b.id.slice(3, -5), body = $(`ag-${cmd}-b`);
    body.hidden = !body.hidden;
    b.setAttribute("aria-expanded", String(!body.hidden));
    body.hidden ? open.delete(cmd) : open.add(cmd);
  }));
  root.querySelectorAll<HTMLElement>(".ag-h [id$='-on'] [data-v]").forEach((b) => (b.onclick = () => {
    const cmd = b.parentElement!.id.slice(3, -3);
    save({ agent: cmd, enabled: b.dataset.v === "true" });
  }));
  root.querySelectorAll<HTMLElement>("[id$='-def'].btn").forEach((b) => (b.onclick = () => setDefault(b.id.slice(3, -4))));
  root.querySelectorAll<HTMLInputElement>("input[id$='-cmd']").forEach((i) => (i.onchange = () => save({ agent: i.id.slice(3, -4), command: i.value })));
  root.querySelectorAll<HTMLInputElement>("input[id$='-args']").forEach((i) => (i.onchange = () => save({ agent: i.id.slice(3, -5), args: i.value })));
  root.querySelectorAll<HTMLSelectElement>("select[id$='-perm']").forEach((s) => {
    if (s.id === "ag-perm") return;
    s.onchange = () => {
      if (s.value === "bypass" && !confirm("This agent will run commands without asking. Turn on bypass?")) return redraw();
      save({ agent: s.id.slice(3, -5), agentPermissions: s.value });
    };
  });
  root.querySelectorAll<HTMLElement>("[id$='-ea']").forEach((b) => (b.onclick = () => {
    const cmd = b.id.slice(3, -3), k = $(`ag-${cmd}-ek`) as HTMLInputElement, v = $(`ag-${cmd}-ev`) as HTMLInputElement;
    if (k.value.trim()) save({ agent: cmd, envName: k.value.trim(), envValue: v.value });
  }));
}
