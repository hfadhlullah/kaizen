// The Browser tab's annotator, board side: the toolbar, the notes list, the settings and the
// conversation with the page. The page is served by the board's proxy on another origin
// (cli/annotate-proxy.ts) and runs web/annotate.js; the two talk only by postMessage, and this
// side accepts a message only from the frame window, from the proxy's origin, with the token the
// proxy handed out when it was opened. Notes live here (and in localStorage, without crops).
import { html, raw } from "./dom.ts";
import { post } from "./api.ts";
import { toast } from "./toast.ts";
import { ico } from "./dom.ts";
import { accept, acceptHost, mapUrl, safeCrop, MAX_BOARD_NOTES } from "./annotate-lib.ts";

type Note = Record<string, any> & { id: string; n: number };
type Settings = { mode: string; level: string; components: boolean; color: string; clear: boolean; block: boolean };
const DEFAULTS: Settings = { mode: "element", level: "standard", components: true, color: "#3c82f7", clear: false, block: true };
const MODES: [string, string, string][] = [["element", "Element", "Click an element"], ["text", "Text", "Select text on the page"], ["multi", "Multi", "Shift not needed: click several, then Enter"], ["area", "Area", "Drag a rectangle"]];

const read = <T>(k: string, d: T): T => { try { return { ...d, ...JSON.parse(localStorage.getItem(k) || "{}") }; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };

export type Annotator = {
  proxied(): boolean;
  active(): boolean;
  // Open this address through the proxy; returns the address for the frame, or null to load it directly.
  open(u: string): Promise<string | null>;
  closeProxy(): void;
  toggle(): void;
};

export function annotator(o: {
  host: HTMLElement; frame: HTMLIFrameElement | HTMLElement; wsKey: string; run: () => { dir: string; id: string } | null; onLocation: (u: string) => void; reload: () => void; button: HTMLElement;
}): Annotator {
  const sk = "kz-annotate", nk = "kz-ann:" + o.wsKey;
  const S: Settings = read(sk, DEFAULTS);
  let on = false, hide = false, pause = false, want = false, listOpen = false;
  let px: { origin: string; token: string; target: string } | null = null;
  let notes: Note[] = [];
  try { notes = JSON.parse(localStorage.getItem(nk) || "[]"); } catch { /* none */ }
  let counter = notes.reduce((m, n) => Math.max(m, n.n), 0);

  const bar = document.createElement("div");
  bar.className = "annbar";
  bar.hidden = true;
  const side = document.createElement("div");
  side.className = "annlist";
  side.hidden = true;
  // Both float over the page (board.html .annrow): a dark pill bottom-right, a notes panel on the right.
  const rowEl = o.frame.parentElement!;
  rowEl.append(side, bar);

  // The Browser tab is an iframe, or in the desktop app a <webview> (talks over IPC, not postMessage).
  const web = o.frame.tagName === "WEBVIEW" ? (o.frame as any) : null;
  const frameWin = () => (o.frame as HTMLIFrameElement).contentWindow;
  const say = (m: Record<string, unknown>) => {
    if (!px) return;
    const msg = { kz: 1, t: px.token, ...m };
    if (web) { try { web.send("kz-ann", msg); } catch { /* not loaded yet: the page says ready when it is */ } } else frameWin()?.postMessage(msg, px.origin);
  };
  const cfg = () => ({ on, mode: S.mode, hide, block: S.block, color: S.color, components: S.components });
  const markers = () => notes.map((n) => ({ n: n.n, kind: n.kind, selector: n.selector, items: n.items, pb: n.pb, page: n.page, comment: n.comment, intent: n.intent, severity: n.severity }));
  const push = () => { say({ type: "config", cfg: { ...cfg(), pause } }); say({ type: "markers", list: markers() }); };
  const save = () => write(nk, notes.map(({ crop, ...n }) => n));
  const forServer = () => notes.map((n) => ({ ...n }));

  function draw() {
    const show = !!px;
    bar.hidden = !show;
    side.hidden = !show || !listOpen;
    rowEl.classList.toggle("lst", show && listOpen);
    o.button.classList.toggle("on", want);
    if (!px) return;
    // Icon buttons in one dark pill, as in Agentation: modes, then pause, markers, copy, send, clear, notes, settings, close.
    const b = (id: string, icon: string, title: string, active = false, disabled = false, badge = 0) =>
      html`<button type="button" data-a="${id}" title="${title}" aria-label="${title}" class="${active ? "on" : ""}"${raw(disabled ? " disabled" : "")}>${ico(icon)}${badge ? html`<i class="cnt">${badge}</i>` : ""}</button>`;
    const mode = (id: string, icon: string, t: string) => b("mode:" + id, icon, t, on && S.mode === id);
    bar.textContent = "";
    bar.insertAdjacentHTML("beforeend", String(html`${mode("element", "a-pick", "Pick an element")}${mode("text", "a-text", "Select text")}${mode("multi", "a-multi", "Pick several elements")}${mode("area", "a-area", "Drag an area")}<span class="sep"></span>${b("pause", "a-pause", "Freeze animations (P)", pause)}${b("hide", "eye", "Show or hide markers (H)", !hide)}${b("copy", "a-copy", "Copy notes as markdown (C)", false, !notes.length)}${b("send", "send", "Type the notes into this run's agent (S)", false, !notes.length)}${b("clear", "trash", "Remove all notes (X)", false, !notes.length)}<span class="sep"></span>${b("list", "note", "Notes list", listOpen, false, notes.length)}${b("set", "gear", "Output detail, colour, behaviour", !!settings)}${b("off", "x", "Close the annotator (the Annotate button brings it back)")}`));
    side.textContent = "";
    if (!notes.length) side.insertAdjacentHTML("beforeend", String(html`<p class="annempty">No notes yet. Pick something on the page and write what should change.</p>`));
    for (const n of notes) {
      side.insertAdjacentHTML("beforeend", String(html`<div class="ann" data-n="${n.n}"><b class="annn${n.kind === "multi" || n.kind === "area" ? " g" : ""}">${n.n}</b><div class="annb"><div class="annc" contenteditable="plaintext-only" spellcheck="false" data-a="edit">${n.comment}</div><code>${n.selector}</code><small>${n.intent} · ${n.severity}${n.crop ? "" : " · no crop"}</small>${raw(n.crop ? `<img alt="crop" src="${n.crop}">` : "")}</div><button type="button" data-a="del" title="Delete" aria-label="Delete">×</button></div>`));
    }
    if (settings) side.prepend(settings);
  }

  let settings: HTMLElement | null = null;
  function drawSettings() {
    if (!settings) return;
    settings.textContent = "";
    settings.insertAdjacentHTML("beforeend", String(html`<label>Output detail <select data-s="level">${raw(["compact", "standard", "detailed", "forensic"].map((l) => `<option${l === S.level ? " selected" : ""}>${l}</option>`).join(""))}</select></label><label><input type="checkbox" data-s="components"${raw(S.components ? " checked" : "")}> Component names</label><label>Marker colour <input type="color" data-s="color" value="${S.color}"></label><label><input type="checkbox" data-s="clear"${raw(S.clear ? " checked" : "")}> Clear after copy or send</label><label><input type="checkbox" data-s="block"${raw(S.block ? " checked" : "")}> Block page clicks while picking</label>`));
  }

  async function copy() {
    if (!notes.length) return;
    const r = await post("/annotate/format", { notes: notes.map(({ crop, ...n }) => n), level: S.level, components: S.components });
    if (!r?.ok) return;
    try { await navigator.clipboard.writeText(r.text); } catch { say({ type: "copy", text: r.text }); }
    toast(`Copied ${notes.length} note${notes.length === 1 ? "" : "s"}`);
    if (S.clear) clear();
  }
  async function sendNotes() {
    const run = o.run();
    if (!run) return void toast("Open this run's agent first: there is nothing to send to.");
    if (!notes.length) return;
    const r = await post("/annotate/send", { dir: run.dir, id: run.id, notes: forServer(), level: S.level, components: S.components });
    if (!r?.ok) return;
    toast(`Sent ${r.sent} note${r.sent === 1 ? "" : "s"} to the agent${r.crops ? `, ${r.crops} crop${r.crops === 1 ? "" : "s"} saved` : ""}`);
    if (S.clear) clear();
  }
  function clear() { notes = []; save(); say({ type: "markers", list: [] }); draw(); }
  function setMode(m: string) { S.mode = m; on = true; write(sk, S); push(); draw(); }

  const act = (a: string) => {
    if (a.startsWith("mode:")) return on && S.mode === a.slice(5) ? (on = false, push(), draw()) : setMode(a.slice(5));
    if (a === "pick") { on = !on; push(); draw(); }
    else if (a === "pause") { pause = !pause; push(); draw(); }
    else if (a === "hide") { hide = !hide; push(); draw(); }
    else if (a === "copy") void copy();
    else if (a === "send") void sendNotes();
    else if (a === "clear") clear();
    else if (a === "list") { listOpen = !listOpen; draw(); }
    else if (a === "set") { settings = settings ? null : document.createElement("div"); if (settings) { settings.className = "annset"; listOpen = true; } drawSettings(); draw(); }
    else if (a === "off") { want = false; on = false; pause = false; listOpen = false; px = null; draw(); o.reload(); }
  };
  bar.onclick = (e) => { const a = (e.target as Element).closest<HTMLElement>("[data-a]")?.dataset.a; if (a) act(a); };
  side.onclick = (e) => {
    const t = e.target as Element;
    const row = t.closest<HTMLElement>(".ann");
    if (t.closest("[data-a=del]") && row) { notes = notes.filter((n) => String(n.n) !== row.dataset.n); save(); say({ type: "markers", list: markers() }); draw(); }
  };
  side.addEventListener("focusout", (e) => {
    const c = (e.target as HTMLElement).closest?.<HTMLElement>("[data-a=edit]");
    const row = c?.closest<HTMLElement>(".ann");
    const n = row && notes.find((x) => String(x.n) === row.dataset.n);
    if (c && n && c.textContent!.trim() && c.textContent!.trim() !== n.comment) { n.comment = c.textContent!.trim(); save(); }
  });
  side.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement, k = el.dataset.s as keyof Settings | undefined;
    if (!k) return;
    (S as any)[k] = el.type === "checkbox" ? el.checked : el.value;
    write(sk, S);
    if (k === "color") push();
  });

  // Keys on the board's own side (the page forwards the same ones from inside the frame).
  const keyAct = (k: string) => {
    if (k === "toggle") return act("pick");
    if (!on) return;
    if (k === "p") act("pause"); else if (k === "h") act("hide"); else if (k === "c") act("copy"); else if (k === "s") act("send"); else if (k === "x") act("clear");
    else if (k === "esc") act("pick");
  };
  const onKey = (e: KeyboardEvent) => {
    if (!px || !o.host.isConnected) return;
    const t = e.target as HTMLElement;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") { e.preventDefault(); return keyAct("toggle"); }
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "escape") keyAct("esc"); else if ("phcsx".includes(k) && k.length === 1) keyAct(k);
  };
  addEventListener("keydown", onKey);

  const onMsg = (e: MessageEvent) => {
    if (!px || !o.host.isConnected) return;
    if (!accept(e, frameWin(), px.origin, px.token)) return;
    handle(e.data);
  };
  const handle = (d: any) => {
    if (!px) return;
    if (d.type === "ready") { on = true; push(); draw(); }
    else if (d.type === "loc") { const u = mapUrl(String(d.href), px.origin, px.target); if (u) o.onLocation(u); }
    else if (d.type === "key") keyAct(String(d.key));
    else if (d.type === "marker") { side.querySelector(`[data-n="${d.n}"]`)?.scrollIntoView({ block: "nearest" }); side.querySelector(`[data-n="${d.n}"]`)?.classList.add("flash"); setTimeout(() => side.querySelector(`[data-n="${d.n}"]`)?.classList.remove("flash"), 900); }
    else if (d.type === "note" && d.note) {
      const n = d.note;
      if (notes.length >= MAX_BOARD_NOTES) return;
      const note: Note = { ...n, id: Math.random().toString(36).slice(2), n: ++counter, crop: safeCrop(n.crop), url: mapUrl(String(n.url || ""), px.origin, px.target) ?? "", page: String(n.page || "") };
      notes.push(note);
      save();
      say({ type: "markers", list: markers() });
      draw();
    }
  };
  addEventListener("message", onMsg);
  web?.addEventListener("ipc-message", (e: any) => { if (px && o.host.isConnected && e.channel === "kz-ann" && acceptHost(e.args?.[0], px.token)) handle(e.args[0]); });

  return {
    proxied: () => !!px,
    active: () => on,
    async open(u) {
      if (!want || !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(u)) { px = null; on = false; pause = false; draw(); return null; }
      const r = await post("/annotate/open", { url: u });
      if (!r?.ok) { want = false; px = null; draw(); return null; }
      px = { origin: r.origin, token: r.token, target: new URL(u).origin };
      draw();
      return r.url;
    },
    closeProxy() { px = null; on = false; pause = false; draw(); },
    toggle() { want = !want; o.reload(); },
  };
}
