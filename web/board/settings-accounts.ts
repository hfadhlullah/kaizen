import { AGENT_FAVICONS } from "./agent-favicons.ts";
import { post } from "./api.ts";
import { $, html } from "./dom.ts";
import { store } from "./store.ts";
import { toast } from "./toast.ts";

// Settings → AI Provider Accounts. /accounts never carries a token.
type Row = { id: string; tool: string; name: string; isDefault: boolean; signedIn: boolean; signIn: string; usage: any };
const TOOL: Record<string, string> = { claude: "Claude", codex: "Codex" };

function usageLine(u: any, signed: boolean) {
  if (!u) return html`<span class="ac-u${signed ? "" : " bad"}">${signed ? "Signed in · no usage yet" : "Not signed in"}</span>`;
  if (u.expired) return html`<span class="ac-u bad">Sign-in expired. Sign in again</span>`;
  if (u.error) return html`<span class="ac-u bad">Usage unavailable</span>`;
  return html`<span class="ac-u">${u.five ? `${u.five.pct}% of 5 hours` : ""}${u.five && u.week ? " · " : ""}${u.week ? `${u.week.pct}% of the week` : ""}</span>`;
}

const row = (a: Row) =>
  html`<div class="sk" data-q="account ${a.name.toLowerCase()} ${a.tool}">
    <div class="sk-h"><img class="ag-i" src="${AGENT_FAVICONS[a.tool] ?? ""}" alt="" width="28" height="28"><span class="sk-n"><input class="sel ac-name" data-ac-name="${a.id}" value="${a.name}" aria-label="Account name, click to rename" title="Click to rename" maxlength="60" autocomplete="off" spellcheck="false">${usageLine(a.usage, a.signedIn)}</span>
      ${a.signedIn && !a.usage?.expired ? "" : html`<button type="button" class="btn" data-ac-sign="${a.id}" data-tool="${a.tool}">Sign in</button>`}
      <button type="button" class="btn" data-ac-def="${a.isDefault ? "" : a.id}" data-tool="${a.tool}" aria-pressed="${String(a.isDefault)}">${a.isDefault ? "✓ Default" : "Default"}</button>
      <button type="button" class="btn" data-ac-rm="${a.id}" data-name="${a.name}">Remove</button></div>
    ${a.signedIn && !a.usage?.expired ? "" : html`<div class="sk-a"><code>${a.signIn}</code></div>`}
  </div>`;

export const accountRows = (d: { accounts: Row[]; windows: boolean }) =>
  html`${["claude", "codex"].filter((t) => d.accounts.some((a) => a.tool === t)).map((t) => html`<h3 class="sg">${TOOL[t]} accounts</h3><div class="sgrp">${d.accounts.filter((a) => a.tool === t).map(row)}</div>`)}
  <h3 class="sg">Add an account</h3><div class="sgrp"><div class="ac-add" data-q="add account sign in claude codex provider">
    <div class="achips">${["claude", "codex"].map((t) => html`<button type="button" data-ac-new="${t}"${d.windows ? " disabled" : ""}><img src="${AGENT_FAVICONS[t]}" alt="" width="16" height="16">Add ${TOOL[t]} account</button>`)}</div></div></div>`;

export function wireAccounts(redraw: () => Promise<unknown>) {
  const send = async (body: object) => {
    const j = await post("/accounts", body);
    toast(j.error ? j.error : "Saved");
    await redraw();
  };
  const root = $("pbody");
  root.querySelectorAll<HTMLInputElement>("[data-ac-name]").forEach((i) => (i.onchange = () => send({ op: "rename", id: i.dataset.acName, name: i.value })));
  root.querySelectorAll<HTMLElement>("[data-ac-new]").forEach((b) => (b.onclick = async () => {
    const j = await post("/accounts", { op: "add", tool: b.dataset.acNew });
    if (j.error || !j.added) return toast(j.error || "Could not add the account");
    await signIn(j.added, b.dataset.acNew!);
    redraw();
  }));
  root.querySelectorAll<HTMLElement>("[data-ac-def]").forEach((b) => (b.onclick = () => send({ op: "default", tool: b.dataset.tool, id: b.dataset.acDef })));
  root.querySelectorAll<HTMLElement>("[data-ac-rm]").forEach((b) => (b.onclick = () => {
    if (!confirm(`Remove ${b.dataset.name}? Runs started on it won't start until you pick another.`)) return;
    send({ op: "remove", id: b.dataset.acRm, deleteFolder: confirm("Also delete its folder, with its login and conversations? Cancel keeps them.") });
  }));
  const signIn = async (id: string, tool: string) => {
    const dir = store.dir || store.S?.dir;
    if (!dir) return toast("Open a project first, or run the line shown here in a terminal");
    const j = await post("/shell", { dir, agent: tool, account: id });
    if (j.error || !j.key) return toast(j.error || "Could not open a terminal. Run the line shown here");
    const opened = !dispatchEvent(new CustomEvent("kz-open-term", { cancelable: true, detail: { dir, ws: j.ws, key: j.key } }));
    toast(opened ? "Sign in, then close the terminal" : "Terminal started. Open it from the side menu");
  };
  root.querySelectorAll<HTMLElement>("[data-ac-sign]").forEach((b) => (b.onclick = () => signIn(b.dataset.acSign!, b.dataset.tool!)));
}
