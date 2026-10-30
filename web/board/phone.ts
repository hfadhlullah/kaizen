// ---- Phones: their own Home (devices, recent runs, usage) and the Runs page (this
// machine's runs grouped waiting / active / done). The board, Ideas and Icebox are set up
// on a computer; a phone has Home, Chat, Runs and Settings.
import { runPopup } from "./cards.ts";
import { $, html, raw } from "./dom.ts";
import { cardHref, logo, railData, stateOf, subline, titleOf, usageChips } from "./workspace.ts";

export const isPhone = () => matchMedia("(max-width:640px)").matches;

type Computer = { name: string; dns: string; os: string; online: boolean };
let net: { self: Computer | null; computers: Computer[]; tailscale: boolean } = { self: null, computers: [], tailscale: false };
let usage: any[] = [];
let mode: "home" | "device" | null = null;

const chev = raw(`<svg class="pchev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`);
const runs = () => railData().cards.filter((c) => c.kind === "run" && !c.archived);
// Ideas not started yet: a phone has no Ideas page, so the Runs page lists them.
const ideas = () => railData().cards.filter((c) => c.kind === "idea" && !c.archived);
const rowKey = (c) => (c.kind === "run" ? c.id : c.text);
const projName = (dir: string) => {
  const l = railData().projects?.find((p) => p.dir === dir)?.label || dir.replace(/[\\/]\.kaizen$/, "");
  return l.split(/[\\/]/).pop() || l;
};

function row(c, now: number) {
  const name = projName(c.state);
  return html`<a class="prow" href="${cardHref(c)}" data-dir="${c.state}" data-id="${rowKey(c)}"><span class="si ${stateOf(c)}"></span><span class="pmain"><b>${titleOf(c)}</b><small>${logo(c.state, name, railData().projects)}${name}</small><code>${subline(c, now)}</code></span></a>`;
}

function home() {
  const now = Date.now();
  const all = runs();
  const active = all.filter((c) => !["done", "abandoned"].includes(c.status));
  const waiting = all.filter((c) => stateOf(c) === "wait").length;
  const projects = new Set(all.map((c) => c.state)).size;
  const me = net.self?.name || "This computer";
  const others = net.computers.map(
    (d) =>
      html`<a class="pdev" href="${d.dns ? "https://" + d.dns + "/" : "#"}" target="_blank" rel="noopener"${raw(d.dns ? "" : ' aria-disabled="true"')}><span class="pico"><svg><use href="#r-desk"/></svg></span><span class="pmain"><b>${d.name}</b><small><i class="pdot${d.online ? " on" : ""}"></i>${d.online ? "Connected" : "Disconnected"}${d.os ? " · " + d.os : ""}</small></span>${chev}</a>`,
  );
  const recent = [...all].sort((a, b) => (b.moved ?? 0) - (a.moved ?? 0)).slice(0, 12);
  return html`<section class="psec2"><h3>Devices</h3><a class="pdev" href="/?view=device" data-dev="here"><span class="pico"><svg><use href="#r-desk"/></svg></span><span class="pmain"><b>${me}</b><small><i class="pdot on"></i>Connected · ${projects} project${projects === 1 ? "" : "s"} · ${active.length} active${waiting ? html` · <em>${waiting} waiting</em>` : ""}</small></span>${chev}</a>${others}${net.tailscale ? "" : html`<p class="pnote">Tailscale is off on this computer: other devices do not show.</p>`}</section>
<section class="psec2"><h3>Runs</h3><div class="plist2">${recent.map((c) => row(c, now))}${recent.length ? "" : html`<p class="pnote">No runs yet.</p>`}</div></section>${usage.length ? html`<section class="psec2"><h3>Usage</h3><div class="pusage">${raw(usageChips(usage))}</div></section>` : ""}`;
}

function device() {
  const now = Date.now();
  const all = [...runs()].sort((a, b) => (b.moved ?? 0) - (a.moved ?? 0));
  const wait = all.filter((c) => stateOf(c) === "wait");
  const done = all.filter((c) => ["done", "abandoned"].includes(c.status));
  const active = all.filter((c) => !wait.includes(c) && !done.includes(c));
  const group = (title: string, cs: any[], shut = false) =>
    cs.length ? html`<details class="pgrp"${raw(shut ? "" : " open")}><summary>${title}<span>${cs.length}</span></summary><div class="plist2">${cs.map((c) => row(c, now))}</div></details>` : "";
  const idle = ideas().sort((a, b) => (b.moved ?? b.added ?? 0) - (a.moved ?? a.added ?? 0));
  return html`${group("Waiting on you", wait)}${group("Active", active)}${group("Ideas", idle)}${group("Done", done, true)}${all.length || idle.length ? "" : html`<p class="pnote">No runs yet.</p>`}`;
}

function draw() {
  const el = $("phome");
  if (!el || !mode) return;
  const keep = mode === "device" ? [...el.querySelectorAll("details")].map((d) => d.open) : [];
  el.innerHTML = String(mode === "home" ? home() : device());
  el.querySelectorAll("details").forEach((d, i) => keep[i] !== undefined && (d.open = keep[i]));
}

async function fetchNet() {
  try {
    const [p, u] = await Promise.all([fetch("/phone").then((r) => r.json()), fetch("/usage").then((r) => (r.ok ? r.json() : []))]);
    net = { self: p.self ?? null, computers: p.computers ?? [], tailscale: !!p.tailscale };
    usage = u;
    draw();
  } catch {}
}

// Home (devices) or Runs (this machine); null when neither shows.
export function openPhone(m: "home" | "device" | null) {
  mode = m;
  if (!m) return;
  draw();
  if (m === "home") void fetchNet();
}

// A light tick on every tap of something pressable. Android has vibrate; iOS (18+) has none,
// but Safari ticks when a switch checkbox toggles, so a hidden one is toggled through its label.
let tick: HTMLLabelElement | null = null;
function haptic() {
  if (navigator.vibrate) return void navigator.vibrate(8);
  if (!tick) {
    tick = document.createElement("label");
    tick.hidden = true;
    tick.innerHTML = `<input type="checkbox" switch>`;
    document.body.append(tick);
  }
  tick.click();
}

export function initPhone(go: (v: string, push?: boolean) => void, openRun: (c) => void) {
  addEventListener("kz-cards", draw);
  addEventListener(
    "click",
    (e) => isPhone() && e.isTrusted && (e.target as HTMLElement).closest?.("button,a,summary,label,select,[role=button],input[type=checkbox]") && haptic(),
    true,
  );
  $("phome")?.addEventListener("click", (e) => {
    if ((e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey) return;
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a");
    if (!a) return;
    if (a.dataset.dev) return (e.preventDefault(), go("device", true));
    if (a.getAttribute("aria-disabled")) return e.preventDefault();
    if (a.classList.contains("prow")) {
      const c = [...runs(), ...ideas()].find((x) => x.state === a.dataset.dir && rowKey(x) === a.dataset.id);
      if (!c) return;
      e.preventDefault();
      // An idea not started has nothing in a workspace yet: pick its agent and mode instead.
      if (c.kind === "idea" && c.status === "idea") runPopup(c);
      else openRun(c);
    }
  });
}
