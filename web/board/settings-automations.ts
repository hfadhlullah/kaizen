import { post } from "./api.ts";
import { $, html, raw } from "./dom.ts";
import { toast } from "./toast.ts";

// Settings → Workflows → Automations: schedules that start a run in this project. /automations
// answers for the page's project; the server makes every decision, this only draws and posts.
type Hist = { fire: string; at: number; kind: string; status: string; reason?: string; run?: string };
type Rule = { id: string; name: string; text: string; cron: string; kind: string; enabled: boolean; agent?: string; precheck?: string; precheck_timeout: number; grace_minutes: number; next: number | null; history: Hist[] };
export type Auto = { zone: string; cap: number; project: string; agents: { cmd: string; name: string }[]; rules: Rule[] };

// The form survives the redraw every change event causes.
const draft: Record<string, string> = { kind: "daily", time: "09:00", day: "mon", grace_minutes: "720", precheck_timeout: "60" };
let editing = "";
const when = (t: number) => new Date(t).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
const SCHEDULE: Record<string, string> = { hourly: "Every hour", daily: "Every day", weekdays: "Weekdays", weekly: "Every week", cron: "Cron" };
const f = (k: string) => draft[k] ?? "";

const hist = (h: Hist) => html`<li><time>${when(h.at)}</time> · ${h.kind} · <b>${h.status.replace(/_/g, " ")}</b>${h.reason ? html` · ${h.reason}` : ""}${h.run ? html` · <code>${h.run}</code>` : ""}</li>`;

const row = (r: Rule) => html`<div class="sk" data-q="${["automation", r.name, r.text, r.cron].join(" ").toLowerCase()}">
  <div class="sk-h"><span class="sk-n"><b>${r.name}</b><span>${SCHEDULE[r.kind]} · <code>${r.cron}</code> · ${r.enabled ? (r.next ? "next " + when(r.next) : "never") : "paused"}</span></span>
    <button type="button" class="btn" data-auto="run" data-id="${r.id}">Run now</button>
    <button type="button" class="btn" data-auto="edit" data-id="${r.id}">Edit</button>
    <button type="button" class="btn" data-auto="delete" data-id="${r.id}">Delete</button>
    <button type="button" class="chk sm${r.enabled ? " on" : ""}" data-auto="${r.enabled ? "pause" : "resume"}" data-id="${r.id}" role="switch" aria-checked="${String(r.enabled)}" aria-label="${r.name}" title="${r.enabled ? "On" : "Paused"}"></button></div>
  <div class="sk-a"><span>${r.text.length > 140 ? r.text.slice(0, 140) + "…" : r.text}</span></div>
  ${r.history.length ? html`<details class="sk-a"><summary>History (${r.history.length})</summary><ul>${r.history.map(hist)}</ul></details>` : ""}
</div>`;

const field = (label: string, id: string, ctl: unknown) => html`<label class="sk-n" style="display:block;margin-top:8px"><span style="display:block">${label}</span>${ctl}</label>`;
const input = (k: string, attrs = "") => html`<input class="sel" data-f="${k}" value="${f(k)}" ${raw(attrs)} spellcheck="false" autocomplete="off" style="width:100%">`;

const form = (d: Auto) => html`<div class="sk" data-q="automation new create add schedule">
  <div class="sk-n"><b>${editing ? "Edit automation" : "New automation"}</b><span>Project: ${d.project}. Times are ${d.zone}, this computer's. One board per project: runs start only while a board is open.</span></div>
  <p class="hint" role="alert" style="color:var(--warn)">Warning: an automation runs unattended in auto mode. It plans, builds and reviews with nobody watching, so it changes code in this project and spends tokens. It stops at the final approval only if your approval settings say so. At most ${d.cap} runs a day, and one open run at a time.</p>
  ${field("Name", "name", input("name", 'maxlength="60"'))}
  ${field("Request (what each run should do)", "text", html`<textarea class="sel" data-f="text" rows="3" style="width:100%">${f("text")}</textarea>`)}
  ${field("Schedule", "kind", html`<select class="sel" data-f="kind" style="width:100%">${Object.entries(SCHEDULE).map(([k, v]) => html`<option value="${k}"${f("kind") === k ? " selected" : ""}>${v}</option>`)}</select>`)}
  ${f("kind") === "cron" ? field("Cron (minute hour day month weekday)", "cron", input("cron", 'placeholder="0 9 * * 1-5"')) : html`${field(f("kind") === "hourly" ? "At minute (uses the minutes of HH:MM)" : "Time (HH:MM)", "time", input("time", 'placeholder="09:00"'))}${f("kind") === "weekly" ? field("Day", "day", html`<select class="sel" data-f="day" style="width:100%">${["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((x) => html`<option${f("day") === x ? " selected" : ""}>${x}</option>`)}</select>`) : ""}`}
  ${field("Agent", "agent", html`<select class="sel" data-f="agent" style="width:100%"><option value="">Project default</option>${d.agents.map((a) => html`<option value="${a.cmd}"${f("agent") === a.cmd ? " selected" : ""}>${a.name}</option>`)}</select>`)}
  ${field("Check before each scheduled run (optional shell command; exit 0 continues)", "precheck", input("precheck", 'placeholder="git fetch -q && test -n &quot;$(git log --since=7.days -1)&quot;"'))}
  <p class="hint">Runs on this computer, in the project folder, every time this fires. Not run by Run now.</p>
  ${field("Check time limit (seconds)", "precheck_timeout", input("precheck_timeout", 'inputmode="numeric"'))}
  ${field("Late start allowed (minutes after the due time)", "grace_minutes", input("grace_minutes", 'inputmode="numeric"'))}
  <div class="sk-a"><button type="button" class="btn pri" data-auto="save">${editing ? "Save" : "Create"}</button>${editing ? html`<button type="button" class="btn" data-auto="cancel">Cancel</button>` : ""}</div>
</div>`;

export const automationRows = (d: Auto) => html`<h3 class="sg">Automations</h3><div class="sgrp">${d.rules.map(row)}${form(d)}</div>`;

export function wireAutomations(d: Auto, redraw: () => Promise<unknown>) {
  $("pbody").querySelectorAll<HTMLInputElement>("[data-f]").forEach((el) => {
    el.oninput = () => { draft[el.dataset.f!] = el.value; };
    el.onchange = () => { draft[el.dataset.f!] = el.value; if (el.dataset.f === "kind") redraw(); };
  });
  $("pbody").querySelectorAll<HTMLElement>("[data-auto]").forEach((b) => (b.onclick = async () => {
    const op = b.dataset.auto!, id = b.dataset.id ?? "";
    if (op === "edit") {
      const r = d.rules.find((x) => x.id === id)!;
      editing = id;
      Object.assign(draft, { name: r.name, text: r.text, kind: r.kind, cron: r.cron, agent: r.agent ?? "", precheck: r.precheck ?? "", precheck_timeout: String(r.precheck_timeout), grace_minutes: String(r.grace_minutes), time: "09:00", day: "mon" });
      return void redraw();
    }
    if (op === "cancel") { editing = ""; return void redraw(); }
    if (op === "delete" && !confirm("Delete this automation and its history?")) return;
    const j = await post("/automations", op === "save" ? { op: editing ? "update" : "create", id: editing, ...draft } : { op, id });
    if (j.error) return toast(j.error);
    if (op === "save") { editing = ""; for (const k of ["name", "text", "cron", "agent", "precheck"]) delete draft[k]; toast("Saved"); }
    else if (op === "run") toast(j.ok ? "Started" : (j.status ?? "not started").replace(/_/g, " ") + (j.why ? ": " + j.why : ""));
    await redraw();
  }));
}
