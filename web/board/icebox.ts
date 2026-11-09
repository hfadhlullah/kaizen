import { store } from "./store.ts";
import { termStop } from "./agent-term.ts";
import { load, post } from "./api.ts";
import { via } from "./cards.ts";
import { mic, stopDictation } from "./dictation.ts";
import { $, dataUrls, html, ico, motion, pageOf, pager, pagerHtml, raw, SKEL, wirePager } from "./dom.ts";
import { plogo, setShown, short, showable } from "./projects.ts";
import { playSound, soundPick, toast } from "./toast.ts";
import { go, view } from "./views.ts";

// A link from sources.json or a gathered post: the server checks it on the way in, this keeps a javascript: URL from ever being a clickable href.
const web = (u: string) => (/^https?:\/\//i.test(String(u)) ? u : "#");

// ---- the icebox: requests gathered from request sources, read like an inbox, until
// someone promotes them to tasks or dismisses them. The sources themselves sit in a
// section below, folded. Same panel as settings.
const SRC = "Icebox";
// What the page keeps across the rebuild every server change brings: the item whose
// promote form is open and the one the cursor is on (both "<dir> <id>"), the checked
// items, the source filter ("<dir> <url>"), whether the sources section is open, and
// whether a bulk action is still posting.
// The category filter, and whether the add form takes a link or a social account/tag. The
// project filter is the board's own `shown`, so the board and the icebox narrow alike.
// The reply being written to a gathered post: its item, the text, and whether it is out.
// The reply style is per project: a promo voice in one need not leak into another's drafts.
let iceReply = null;
// The task ChatGPT drafted for the open promote form: its item key, whether it is still coming,
// the title and details, or why there is none. The person's own typing always wins.
let iceTask = null;
const iceStyle = {};
const icePg = pager("icebox");
const rStyle = (dir) => {
  if (!iceStyle[dir])
    try {
      iceStyle[dir] = localStorage.getItem("kz-reply-style:" + dir);
    } catch (e) {}
  return iceStyle[dir] || "casual";
};
const STYLES = { casual: "Casual", fun: "Fun", helpful: "Helpful", promo: "Promo" };
export let iceForm = null,
  // The item whose promote form is showing: opened by its "+", never by opening the row.
  icePro = null,
  iceCur = null,
  iceSrc = "",
  iceCat = "",
  srcKind = "link",
  srcShow = null,
  srcAdd = false,
  iceBusy = false,
  iceNav = null;
const iceSel = new Set();
// The swipe view: one waiting request at a time, decided by drag, button or arrow key.
// Null when the list shows. It counts this session's decisions, keeps the last dismiss
// for Undo, and how often each request was skipped (skipped ones go to the back).
let iceSwipe = null;
// A rebuild while the card is held would drop the drag: it waits for the release.
let swHeld = false,
  swLate = false;
const PLAT = { x: "X", tiktok: "TikTok", instagram: "Instagram", threads: "Threads" };
// What an item is: a client asked for it, you found it, or people say it (the server's KINDS).
const KIND = { client: "Client", finding: "Finding", people: "People say" };
// The capture box outlives every rebuild: its field and mic are kept nodes, so the text, the caret
// and a dictation in progress survive a server change. Files and the picked board wait with it.
const cap = { ta: null, mic: null, files: [], board: "", boardDir: null, dir: null, busy: false };
// Cards or Sort, per browser; the board and kind filters; the item menu that is open ("<item key> <menu>").
let iceView = "cards";
try {
  iceView = localStorage.getItem("kz-ice-view") === "sort" ? "sort" : "cards";
} catch (e) {}
let iceBoard = "",
  iceMenu = "",
  // When the open menu was drawn: the redraw that shows it restores the scroll, and that scroll
  // event must not shut it again.
  iceMenuAt = 0,
  iceMenuFor = "";
const iceKinds = new Set();
// Wired on the first open, not at import: tests load this module with no window.
let narrowQ = null;
function wireOnce() {
  if (narrowQ) return;
  narrowQ = matchMedia("(max-width:640px)");
  // A window crossing 640 px swaps cards for the list.
  narrowQ.addEventListener("change", () => view === "sources" && srcOpen() && openSources());
  // A click anywhere but a menu or its button shuts the open item menu.
  document.addEventListener("click", (e) => {
    if (!iceMenu || (e.target as Element).closest?.(".ice-mpop,[data-m]")) return;
    iceMenu = "";
    if (view === "sources" && srcOpen()) openSources();
  });
}
// A person mark for a client's board.
const PERSON = raw(
  '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5.2" r="2.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 13.6c.7-2.5 2.6-3.8 5-3.8s4.3 1.3 5 3.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
);
const sameName = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();
// The day a snooze lands on, said as the server works it out (1d, 1w, 1m or a date).
const wakeDay = (until) => {
  const d = new Date();
  if (until === "1d") d.setDate(d.getDate() + 1);
  else if (until === "1w") d.setDate(d.getDate() + 7);
  else if (until === "1m") d.setMonth(d.getMonth() + 1);
  else return new Date(until + "T00:00:00");
  return d;
};
const ymd = (d) => d.toLocaleDateString("sv");
export const srcOpen = () => $("panel").classList.contains("open") && $("ptitle").textContent === SRC;
const ago = (at) => {
  const m = Math.round((Date.now() - Date.parse(at)) / 60000);
  return m < 1
    ? "just now"
    : m < 60
      ? m + " min ago"
      : m < 1440
        ? Math.round(m / 60) + " h ago"
        : Math.round(m / 1440) + " d ago";
};
// A searchable filter picker: the button opens it, typing narrows the rows (a group header
// stays while any of its rows does), Enter or a click picks.
function wirePick(id, set) {
  const c = $(id);
  if (!c) return;
  const btn = c.querySelector("button.sel"),
    pp = c.querySelector(".menu-pop"),
    q = pp.querySelector("input"),
    box = pp.querySelector(".pick-list");
  const show = (on) => {
    pp.hidden = !on;
    btn.setAttribute("aria-expanded", on);
    if (on) {
      q.value = "";
      narrow();
      q.focus();
    }
  };
  const narrow = () => {
    const t = q.value.trim().toLowerCase();
    let g = null,
      any = false;
    for (const el of box.children) {
      if (el.classList.contains("grp")) {
        if (g) g.hidden = !any;
        g = el;
        any = false;
      } else {
        const hit = !t || el.dataset.q.includes(t) || (g && g.dataset.g.includes(t));
        el.hidden = !hit;
        any ||= hit;
      }
    }
    if (g) g.hidden = !any;
  };
  btn.onclick = () => show(pp.hidden);
  q.oninput = narrow;
  q.onkeydown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      show(false);
      btn.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      box.querySelector("button:not([hidden])")?.click();
    }
  };
  box.onclick = (e) => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    show(false);
    set(b.dataset.v);
  };
}
export async function openSources() {
  if (swHeld) {
    swLate = true;
    return;
  }
  if (view !== "sources") return;
  wireOnce();
  const gen = ++store.pageGen;
  // A dictation into the capture box keeps going: its field is carried over, not rebuilt.
  stopDictation(!$("ice-cap"));
  // What is half typed survives a refresh from the server.
  const typed = srcOpen()
    ? [
        $("src-url")?.value || "",
        $("src-label")?.value || "",
        document.activeElement?.id,
        $("src-dir")?.value,
        $("src-cat")?.value || "",
        $("src-plat")?.value,
        $("src-q")?.value || "",
      ]
    : ["", ""];
  // So does a project picked on a row but not yet moved.
  const picked = new Map(
    srcOpen() ? [...$("pbody").querySelectorAll("[data-mv]")].map((m) => [m.dataset.k, m.value]) : [],
  );
  // And a promote form half filled, for the item it was typed on.
  // And which control of which inbox row had focus, by item key: row indices shift when a row goes.
  const fRow = srcOpen() && document.activeElement?.closest?.(".ice-row,.ice-card"),
    fPick = fRow ? [fRow.dataset.k, document.activeElement.id.replace(/-\d+$/, "")] : null;
  // And a Snooze date half picked in an open menu.
  const sdKeep = srcOpen() && $("ice-sd")?.value ? [iceMenu, $("ice-sd").value] : null;
  const iceDraft =
    srcOpen() && $("ice-title") ? [$("ice-title").dataset.k, $("ice-title").value, $("ice-details").value] : null;
  // And a category typed on a row but not yet saved.
  const cats = new Map(
    srcOpen() ? [...$("pbody").querySelectorAll("[data-ct]")].map((m) => [m.dataset.k, m.value]) : [],
  );
  if (!srcOpen()) $("pbody").innerHTML = SKEL;
  termStop();
  store.openKey = null;
  store.runDoc = null;
  $("pterm").hidden = true;
  $("panel").classList.add("open");
  $("scrim").classList.add("on");
  $("ptitle").textContent = SRC;
  $("ptabs").innerHTML = "";
  $("pfoot").innerHTML = "";
  $("psub").textContent = "";
  $("psub").title = "";
  const dir = store.all ? null : store.S.dir,
    q = dir ? "?dir=" + encodeURIComponent(dir) : "";
  const d = await fetch("/sources" + q)
    .then((r) => r.json())
    .catch(() => null);
  if (gen !== store.pageGen || !srcOpen()) return;
  const host = (u) => {
    try {
      return new URL(u).hostname;
    } catch {
      return u;
    }
  };
  // The favicon of the site a link is on, asked of that site itself (Google's own static host for
  // Sheets and Docs, whose site icon is generic): nothing but the host reaches anyone. A social
  // platform's mark is drawn here instead: Meta's favicons are same-origin only.
  const fav = (u, fb, soc) => {
    if (PLAT[soc]) return html`<span class="fav">${ico("b-" + soc)}</span>`;
    let h;
    try {
      const x = new URL(u);
      if (/^https?:$/.test(x.protocol)) h = x.origin;
    } catch {}
    const src = !h
      ? ""
      : u.includes("docs.google.com/spreadsheets")
        ? "https://ssl.gstatic.com/docs/spreadsheets/favicon3.ico"
        : u.includes("docs.google.com/document")
          ? "https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico"
          : h + "/favicon.ico";
    return html`<span class="fav">${src ? html`<img src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}${ico(fb)}</span>`;
  };
  // What a source is called when nothing names it: its platform, else its site.
  const platOf = (s) => PLAT[s?.social] || (s ? host(s.url).replace(/^www\./, "") : "") || "Other";
  const srcType = (s) => {
    if (s.social) return "social";
    const u = s.url;
    if (u.includes("docs.google.com/spreadsheets") || u.endsWith(".csv") || u.endsWith(".tsv")) return "sheet";
    if (u.includes("docs.google.com/document")) return "doc";
    return "link";
  };
  const list = (d && d.sources) || [],
    // Dismissed items ride along, shown only under their own category. A snoozed item is
    // left out of the list, the count and Swipe until its date (the server says `asleep`).
    awake = ((d && d.icebox) || []).filter((it) => !it.asleep),
    ice = [...awake, ...((d && d.dismissed) || [])],
    waiting = awake.length,
    G = (d && d.gatherer) || {},
    chatOn = G.use === "chatgpt" && G.connected;
  // A source belongs to one project, named on its row. Picking another only arms Move: a select
  // changes on every arrow key, and each change would have moved the source. The names are the picker's;
  // a row whose project the picker does not list still gets its own, selected, so Move never points elsewhere.
  const opts = (on, name) =>
    html`${on && !store.S.projects.some((p) => p.dir === on) ? html`<option value="${on}" title="${name || on}" selected>${short(name || on)}</option>` : ""}${store.S.projects.map((p) => html`<option value="${p.dir}" title="${p.label}"${p.dir === on ? " selected" : ""}>${short(p.label)}</option>`)}`;
  const cards = list
    .map((s, i) => {
      const st = srcType(s),
        title = s.label || host(s.url);
      // A social source is never read by kaizen, so its not-ok is the agent's turn, not a failure.
      const statusHtml =
        s.social && (!s.last || (!s.last.ok && /gathered by your agent/i.test(s.last.note)))
          ? html`<span class="src-badge dim">${ico("at")}${chatOn ? "Gathered with ChatGPT" : "Gathered by your agent"}</span>`
          : !s.last
            ? html`<span class="src-badge dim">Not gathered yet</span>`
            : s.last.ok
              ? html`<span class="src-badge ok"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-6" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${s.last.note}</span><span class="hint" style="margin:0">${ago(s.last.at)}</span>`
              : html`<span class="src-badge warn"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" stroke="currentColor" fill="none" stroke-width="1.8"/><path d="M8 5v3.5M8 11v.1" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/></svg>Failed: ${s.last.note}</span><span class="hint" style="margin:0">${ago(s.last.at)}</span>`;
      const kind = st === "sheet" ? "sheet" : st === "doc" ? "doc" : st === "social" ? "at" : "link",
        bare = s.url.replace(/^https?:\/\/(www\.)?/, "");
      return html`<div class="src-card" id="src-card-${i}"><div class="src-hd"><span class="src-ico" title="${st === "social" ? (PLAT[s.social] || "social") : st}">${fav(s.url, kind, s.social)}</span><div class="src-info"><span class="src-title" title="${title}">${title}</span><a class="src-url" href="${web(s.url)}" target="_blank" rel="noopener noreferrer" title="${s.url}"><span>${bare}</span>${ico("ext")}</a></div><div class="src-acts">${s.social ? html`<button class="ib sm" id="src-ag-${i}" data-ag="${i}" aria-label="Gather ${title} with your agent" title="${chatOn ? "Gather with your ChatGPT plan" : "Gather: opens your agent on /kaizen gather"}">${ico("refresh")}</button>` : html`<button class="ib sm" id="src-chk-${i}" data-chk="${i}" aria-label="Check ${title} now" title="Check now">${ico("refresh")}</button>`}<button class="ib sm danger" id="src-rm-${i}" data-rm="${i}" aria-label="Remove ${title}" title="Remove source">${ico("trash")}</button></div></div><div class="src-status">${statusHtml}</div><div class="src-fields"><label class="src-f" title="Category"><span>Category</span><input class="sel" id="src-ct-${i}" data-ct="${i}" data-k="${s.dir + " " + s.url}" value="${s.category || ""}" placeholder="${platOf(s)}" maxlength="40" aria-label="Category of ${title}"><button class="btn sm pri" id="src-cs-${i}" aria-label="Save the category of ${title}" disabled>Save</button></label><label class="src-f" title="Project"><span>Project</span>${plogo(s.dir, s.project || "")}<select class="sel" id="src-mv-${i}" data-mv="${i}" data-k="${s.dir + " " + s.url}" aria-label="Project of ${title}">${opts(s.dir, s.project)}</select><button class="btn sm pri" id="src-mb-${i}" aria-label="Move ${title} to the chosen project" disabled>Move</button></label></div><div class="src-sws">${st === "sheet" || /github\.com/.test(s.url) ? html`<label class="src-sw">Write back<button class="chk sm${s.writeback ? " on" : ""}" id="src-wb-${i}" data-wb="${i}" role="switch" aria-checked="${String(!!s.writeback)}" aria-label="Write back to ${title}"></button></label>` : ""}<label class="src-sw" title="Off: the scheduled gather skips this source; Check now still reads it">Auto gather<button class="chk sm${s.paused ? "" : " on"}" id="src-ag-on-${i}" data-ag-on="${i}" role="switch" aria-checked="${String(!s.paused)}" aria-label="Auto gather ${title}"></button></label></div></div>`;
    });
  const fails = ((d && d.failed) || []).map((f) => html`<p style="color:var(--dim)">The sources of ${f} could not be read.</p>`);
  const emptyState = html`<div class="src-empty"><div class="src-empty-ico">${ico("link")}</div><h4>No sources yet</h4></div>`;
  const social = srcKind === "social";
  const addOn = !list.length || srcAdd || [typed[0], typed[1], typed[4], typed[6]].some(Boolean);
  const addBox = html`<div class="src-add" id="src-addbox"${addOn ? "" : " hidden"}><div class="hd"><h4>Add a source</h4><div class="src-kind" role="group" aria-label="Kind of source"><button id="src-k-link" data-kind="link" aria-pressed="${String(!social)}">Link</button><button id="src-k-social" data-kind="social" aria-pressed="${String(social)}">Social</button></div></div><label for="src-url"${social ? " hidden" : ""}><span>Link</span><input class="sel" id="src-url" placeholder="Link" spellcheck="false" autocomplete="off"></label><div class="two plat"${social ? "" : " hidden"}><label for="src-plat"><span>Platform</span><select class="sel" id="src-plat">${Object.entries(
    PLAT,
  )
    .map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label><label for="src-q"><span>Follow</span><input class="sel" id="src-q" placeholder="keyword, #hashtag or @account" maxlength="100" spellcheck="false" autocomplete="off"></label></div><div class="two"><label for="src-label"><span>Label <i>optional</i></span><input class="sel" id="src-label" placeholder="${social ? "e.g. Mentions on X" : "e.g. Feedback Q4"}"></label><label for="src-cat"><span>Category <i>optional</i></span><input class="sel" id="src-cat" placeholder="${social ? "e.g. Social" : "e.g. Bugs"}" maxlength="40"></label></div><label for="src-dir"><span>Project</span><select class="sel" id="src-dir">${dir ? "" : html`<option value="">Choose project…</option>`}${opts(dir)}</select></label><div class="acts"><span class="end"></span><button class="btn pri" id="src-add">Add source</button></div></div>`;
  // The inbox: one row per request, by project when showing all, then by category,
  // narrowed to one source by its chip. Checked, open and cursor items are kept by key.
  const srcName = (it) => {
    const s = list.find((x) => x.dir === it.dir && x.url === it.source);
    return s ? s.label || host(s.url) : host(it.source);
  };
  const iceKey = (it) => it.dir + " " + it.id,
    srcKey = (it) => it.dir + " " + it.source;
  // Filters narrow in turn: project (the board's own picker, all projects only), then
  // category, then source; each chip counts what the filters before it leave.
  // An item with no category of its own takes its source's, else the source's platform or site.
  const srcOf = (it) => list.find((x) => x.dir === it.dir && x.url === it.source),
    catOf = (it) =>
      it.status === "dismissed"
        ? "Dismissed"
        : it.status === "done"
          ? "Done"
          : it.category || srcOf(it)?.category || platOf(srcOf(it) || { url: it.source }),
    count = (xs, f) => {
      const m = new Map();
      xs.forEach((it) => {
        const k = f(it);
        m.set(k, { it, n: (m.get(k)?.n || 0) + 1 });
      });
      return m;
    };
  const byProj = dir ? new Map() : count(ice, (it) => it.dir);
  if (!dir)
    for (const pd of store.shown)
      if (!byProj.has(pd)) {
        const p = showable().find((x) => x.dir === pd);
        if (p) byProj.set(pd, { it: { dir: pd, project: p.label }, n: 0 });
      }
  const inProj = (it) => dir || !store.shown.size || store.shown.has(it.dir),
    pv = ice.filter(inProj);
  const isWaiting = (it) => !["promoted", "dismissed", "done"].includes(it.status);
  // Boards, then kinds, narrow before category and source. A board is its name: two projects'
  // boards of one name are one chip in All projects.
  const boards = [...new Map(((d && d.boards) || []).filter(inProj).map((b) => [b.name.toLowerCase(), b])).values()];
  if (iceBoard && !boards.some((b) => sameName(b.name, iceBoard))) iceBoard = "";
  const onBoard = (it) => !iceBoard || sameName(it.board, iceBoard),
    ofKind = (it) => !iceKinds.size || iceKinds.has(it.kind);
  const byCat = count(pv.filter((it) => onBoard(it) && ofKind(it)), catOf);
  if (iceCat && !byCat.has(iceCat)) iceCat = "";
  const cv = pv.filter((it) => onBoard(it) && ofKind(it) && (!iceCat || catOf(it) === iceCat));
  const bySrc = count(cv, srcKey);
  if (iceSrc && !bySrc.has(iceSrc)) iceSrc = "";
  const keys = new Set(ice.map(iceKey));
  if (iceForm && !keys.has(iceForm)) iceForm = null;
  if (icePro !== iceForm) icePro = null;
  // Newest first, in the order they are drawn, which is the order j and k walk. Category is a filter.
  const filtered = ice
    .map((_, i) => i)
    .filter((i) => {
      const it = ice[i];
      return inProj(it) && onBoard(it) && ofKind(it) && (iceCat ? catOf(it) === iceCat : it.status !== "dismissed" && it.status !== "done") && (!iceSrc || srcKey(it) === iceSrc);
    })
    .sort((a, b) => (Date.parse(ice[b].at) || 0) - (Date.parse(ice[a].at) || 0));
  // Only the page: j and k, select-all and bulk actions stay on what shows.
  const order = pageOf(icePg, filtered);
  // A checked request a filter hides is unchecked: a bulk action only ever acts on what shows.
  {
    const vis = new Set(order.map((i) => iceKey(ice[i])));
    [...iceSel].forEach((k) => vis.has(k) || iceSel.delete(k));
  }
  if (!order.some((i) => iceKey(ice[i]) === iceCur)) iceCur = order.length ? iceKey(ice[order[0]]) : null;
  const nSel = order.filter((i) => iceSel.has(iceKey(ice[i]))).length;
  // Filters are plain dropdowns, each shown only when it has a choice to make. Projects are
  // narrowed by the board's own Showing picker above, not here.
  const many = byProj.size > 1;
  // Filters are searchable pickers (the header's combo): a button, then a search over the list.
  const pick = (id, label, cur, rows) =>
    html`<div class="combo ice-combo" id="${id}"><button class="sel" aria-label="${label}" aria-haspopup="listbox" aria-expanded="false">${cur}</button><div class="menu-pop" hidden><input class="sel" aria-label="Search ${label.toLowerCase()}" placeholder="Search…" spellcheck="false" autocomplete="off"><div class="pick-list" role="listbox">${rows}</div></div></div>`;
  const opt = (v, on, inner, q, cls = "") =>
    html`<button type="button" role="option" data-v="${v}" data-q="${q.toLowerCase()}" class="${on ? "on" : ""}${cls}" aria-selected="${String(on)}">${inner}</button>`;
  // Sources group by platform: two Threads searches sit under one Threads.
  const srcGroups = new Map();
  for (const [k, { it }] of bySrc) {
    const g = platOf(srcOf(it) || { url: it.source });
    srcGroups.has(g) || srcGroups.set(g, []);
    srcGroups.get(g).push([k, it]);
  }
  const srcIco = (it) => fav(it.source, "link", srcOf(it)?.social);
  const curSrc = iceSrc && [...bySrc].find(([k]) => k === iceSrc)?.[1].it;
  const chips = html`${
    // Dismissed and Done are hidden until picked, so even a lone one is a choice.
    byCat.size > 1 || byCat.has("Dismissed") || byCat.has("Done")
      ? pick(
          "ice-fc",
          "Category",
          html`<span>${iceCat || "All categories"}</span>`,
          html`${opt("", !iceCat, html`<span>All categories</span>`, "all categories")}${[...byCat].map(([k, { n }]) => opt(k, iceCat === k, html`<span>${k}</span><i>${n}</i>`, k))}`,
        )
      : ""}${
    bySrc.size > 1
      ? pick(
          "ice-fs",
          "Source",
          curSrc ? html`${srcIco(curSrc)}<span>${srcName(curSrc)}</span>` : html`<span>All sources</span>`,
          html`${opt("", !iceSrc, html`<span>All sources</span>`, "all sources")}${[...srcGroups].map(
            ([g, xs]) =>
              html`<div class="grp" data-g="${g.toLowerCase()}">${srcIco(xs[0][1])}${g}</div>${xs.map(([k, it]) => opt(k, iceSrc === k, html`${srcIco(it)}<span>${srcName(it).toLowerCase().startsWith(g.toLowerCase() + ":") ? srcName(it).slice(g.length + 1).trim() : srcName(it)}</span><i>${bySrc.get(k).n}</i>`, g + " " + srcName(it), " sub"))}`,
          )}`,
        )
      : ""}`;
  // Under 640 px there are no cards: the list shows, and the switch goes.
  const narrow = narrowQ.matches,
    cardsOn = iceView === "cards" && !narrow;
  // The boards bar: All, each board with what waits on it, + Board; the kind filters on the right.
  const nOn = (b) => pv.filter((it) => isWaiting(it) && sameName(it.board, b.name)).length;
  const boardsBar = html`<div class="ice-boards"><div class="ice-chips" role="group" aria-label="Boards"><button class="ice-chip${iceBoard ? "" : " on"}" data-bd="" aria-pressed="${String(!iceBoard)}">All</button>${boards.map((b) => html`<button class="ice-chip${sameName(iceBoard, b.name) ? " on" : ""}" data-bd="${b.name}" aria-pressed="${String(sameName(iceBoard, b.name))}"${b.client ? raw(' title="A client\'s board: its items are Client"') : ""}>${b.client ? PERSON : ""}<span>${b.name}</span><i>${nOn(b)}</i></button>`)}<button class="ice-chip add" id="ice-nb" title="Make a board for a client or a topic">${ico("plus")}Board</button></div><div class="ice-chips" role="group" aria-label="Kinds">${Object.entries(KIND).map(([k, l]) => html`<button class="ice-chip k-${k}${iceKinds.has(k) ? " on" : ""}" data-kf="${k}" aria-pressed="${String(iceKinds.has(k))}">${l}</button>`)}</div></div>`;
  const bar = html`<div class="tk-bar ice-bar">${!cardsOn && !narrow && order.length ? html`<input type="checkbox" id="ice-all" aria-label="Select every request shown"${nSel && nSel === order.length ? " checked" : ""}>` : ""}${narrow ? "" : html`<div class="ice-view" role="group" aria-label="View"><button data-view="cards" aria-pressed="${String(cardsOn)}">Cards</button><button data-view="sort" aria-pressed="${String(!cardsOn)}">Sort</button></div>`}<span class="count">${iceCat === "Dismissed" || iceCat === "Done" ? `${order.length} ${iceCat.toLowerCase()}` : `${order.length < waiting ? `${order.length} of ${waiting}` : waiting} waiting`}</span><span class="end"></span>${String(chips) ? html`<details class="ice-filt"><summary class="ib${iceCat || iceSrc ? " on" : ""}" aria-label="Filter requests" title="Filter by category or source">${ico("filter")}</summary><div class="ice-fpop">${chips}</div></details>` : ""}${order.some((i) => isWaiting(ice[i])) ? html`<button class="btn ghost sm" id="ice-sw" title="Sort one at a time: swipe right to promote, left to dismiss"><span aria-hidden="true">⇆</span> Swipe</button>` : ""}${narrow ? "" : html`<button class="btn sm" id="src-tog" aria-expanded="${String(!!srcShow)}" aria-controls="src-sec" title="Sources, and Gather all">${ico("link")} Sources · ${list.length}</button>`}</div>`;
  // The capture box: what is typed, pasted, attached or dictated lands in the icebox on the picked
  // board. In All projects it names the project, as the Add pop-up did. Field and mic are slotted in.
  const capPs = dir ? [] : showable();
  if (!dir && !capPs.some((p) => p.dir === cap.dir))
    cap.dir = (store.shown.size === 1 ? [...store.shown][0] : null) || capPs[0]?.dir || null;
  const capTo0 = dir || cap.dir;
  // A board picked for another project never goes along when the box's project changes.
  if (cap.board && cap.boardDir && cap.boardDir !== capTo0) cap.board = "";
  const capTo = capTo0,
    capP = capPs.find((p) => p.dir === cap.dir);
  const capBoards = ((d && d.boards) || []).filter((b) => b.dir === capTo);
  const capBox = html`<div class="ice-cap" id="ice-cap"><span id="ice-cap-slot"></span>${cap.files.length ? html`<div class="ice-att">${cap.files.map((f, n) => html`<span class="ice-file">${ico("clip")}<span>${f.name}</span><button type="button" class="ib sm" data-rf="${n}" aria-label="Remove ${f.name}" title="Remove">${ico("x")}</button></span>`)}</div>` : ""}<div class="ice-cap-row"><button type="button" class="ib" id="ice-pick" aria-label="Attach files" title="Attach files">${ico("clip")}</button><span id="ice-mic-slot"></span><input type="file" id="ice-file" multiple hidden>${dir ? "" : pick("ice-cp", "Project", capP ? html`${plogo(capP.dir, capP.label)}<span>${short(capP.label)}</span>` : html`<span>Choose project</span>`, html`${capPs.map((p) => opt(p.dir, p.dir === cap.dir, html`${plogo(p.dir, p.label)}<span>${p.label}</span>`, p.label))}`)}${pick("ice-cb", "Board", html`<span>Board: ${cap.board || "Inbox"}</span>`, html`${opt("", !cap.board, html`<span>Inbox</span>`, "inbox")}${capBoards.map((b) => opt(b.name, sameName(cap.board, b.name), html`${b.client ? PERSON : ""}<span>${b.name}</span>`, b.name))}${cap.board && !capBoards.some((b) => sameName(b.name, cap.board)) ? opt(cap.board, true, html`<span>${cap.board}</span><i>new</i>`, cap.board) : ""}${opt("\n", false, html`${ico("plus")}<span>New board…</span>`, "new board")}`)}<span class="end"></span><button type="button" class="btn pri sm" id="ice-save" aria-label="Save to the icebox"${cap.busy ? " disabled" : ""}>${ico("send")}<span>${cap.busy ? "Saving…" : "Save ↵"}</span></button></div></div>`;
  const bulk = iceSel.size
    ? html`<div class="ice-bulk" role="toolbar" aria-label="Selected requests"><span>${iceSel.size} selected</span><span class="end"></span><button class="btn sm" id="ice-bp" title="Promote (p)">${ico("plus")} Promote</button><button class="btn ghost sm" id="ice-bz" title="Snooze a week (h)">${ico("clock")} Snooze</button><button class="btn ghost sm" id="ice-bd" title="Dismiss (d)">${ico("x")} Dismiss</button><button class="btn ghost sm" id="ice-bc" title="Clear selection (Esc)">Clear</button></div>`
    : "";
  // The open item's form: a clean title for the task's card and the person's own details;
  // what was gathered is added to the task's notes by the server.
  const form = (it) => {
    const t = iceTask && iceTask.k === iceKey(it) ? iceTask : null,
      say = t?.wait ? "Drafting a task with ChatGPT…" : t?.kept ? "ChatGPT's draft came after you started typing, so your words stay. Redraft to use it." : t?.note ? `No draft: ${t.note}` : t?.title ? "Drafted by ChatGPT. Edit it before promoting." : "";
    return html`<div class="ice-form"><label for="ice-title" class="hint" style="margin:0">Task title</label><input class="sel" id="ice-title" data-k="${iceKey(it)}" maxlength="200" value="${t?.title || it.text}" aria-label="Task title"><label for="ice-details" class="hint" style="margin:0">Details</label><textarea class="sel" id="ice-details" rows="${t?.details ? 5 : 3}" aria-label="Details">${t?.details || ""}</textarea>${say ? html`<span class="hint ice-tdraft" id="ice-tdn" role="status" style="margin:0">${say}</span>` : ""}<div class="ice-form-acts">${G.connected ? html`<button class="btn ghost sm" id="ice-td"${t?.wait ? " disabled" : ""} title="Ask ChatGPT for another draft">${ico("ai")}${t?.title ? "Redraft" : "Draft with ChatGPT"}</button>` : ""}<span class="end"></span><button class="btn ghost sm" id="ice-cancel">Cancel</button><button class="btn pri sm" id="ice-ok">Promote</button></div></div>`;
  };
  // A gathered post can be answered: Reply drafts, the box is the approval, Send reply posts that text.
  const replyBox = (it) => {
    if (!it.post) return "";
    if (it.replied) return html`<span class="hint" style="margin:0">You replied to this post ${ago(it.replied)}.</span>`;
    const r = iceReply && iceReply.k === iceKey(it) ? iceReply : null;
    const style = (d) =>
      html`<select class="sel" id="ice-rst" aria-label="Reply style"${d ? " disabled" : ""}>${Object.entries(
        STYLES,
      )
        .map(([v, l]) => html`<option value="${v}"${v === rStyle(it.dir) ? " selected" : ""}>${l}</option>`)}</select>`;
    if (!r)
      return html`<div class="ice-form-acts"><span class="hint">You review it before it posts.</span>${G.connected ? style(false) : ""}<button class="btn sm" id="ice-rp">Reply</button></div>`;
    if (r.wait) return html`<div class="ice-form-acts"><span class="hint">Drafting…</span></div>`;
    return html`<div class="ice-form"><label for="ice-reply" class="hint" style="margin:0">Your reply${r.note ? ` · ${r.note}` : ""}</label><textarea class="sel" id="ice-reply" rows="3" maxlength="2000" aria-label="Your reply"${r.busy || r.again ? " disabled" : ""}>${r.text}</textarea><span class="hint" id="ice-rn" style="margin:0">${r.again ? "Writing another…" : `${r.text.length} chars`}</span><div class="ice-form-acts"><span class="end"></span>${G.connected ? html`${style(r.busy || r.again)}<button class="btn ghost sm" id="ice-rg"${r.busy || r.again ? " disabled" : ""}>Regenerate</button>` : ""}<button class="btn ghost sm" id="ice-rc"${r.busy ? " disabled" : ""}>Cancel</button><button class="btn pri sm" id="ice-rs"${r.busy || r.again || !r.text.trim() ? " disabled" : ""}>${r.busy ? "Sending…" : "Send reply"}</button></div></div>`;
  };
  const imgs = (it, card = false) =>
    (it.images || []).filter((u) => /^https:\/\//.test(u)).length ? html`<details class="ice-imgs"><summary${card ? raw(' title="Loads them from the source\'s site"') : ""}>${card ? `${it.images.filter((u) => /^https:\/\//.test(u)).length} pictures · show` : `Show images (${it.images.filter((u) => /^https:\/\//.test(u)).length}) — loads them from the source's site`}</summary>${it.images.filter((u) => /^https:\/\//.test(u)).map((u, n) => { const src = `/ice-image?dir=${encodeURIComponent(it.dir)}&id=${encodeURIComponent(it.id)}&i=${n}`; return html`<a href="${src}" target="_blank" rel="noopener noreferrer"><img data-src="${src}" alt="" referrerpolicy="no-referrer"></a>`; })}</details>` : "";
  // The pieces rows and cards share. Only a waiting item has menus; Snooze needs one too.
  const live = (it) => it.status === "new";
  const kindOf = (it) => html`<span class="ice-k k-${it.kind || "none"}">${KIND[it.kind] || "Unsorted"}</span>`;
  const menuBtn = (i, it, m, inner, cls, label) =>
    html`<button type="button" class="${cls}" id="ice-m${m[0]}-${i}" data-m="${m}" data-mi="${i}" aria-haspopup="menu" aria-expanded="${String(iceMenu === iceKey(it) + " " + m)}" title="${label}" aria-label="${label}: ${it.text}">${inner}</button>`;
  // The open item menu, drawn inside its row or card: Snooze, Kind or Board.
  const menu = (i, it) => {
    const k = iceKey(it),
      m = iceMenu.startsWith(k + " ") ? iceMenu.slice(k.length + 1) : "";
    if (!m) return "";
    const b = (attr, v, label, on = false) => html`<button type="button" role="menuitem" ${raw(attr)}="${v}"${on ? raw(' class="on" aria-current="true"') : ""}>${label}</button>`;
    const day = (n) => ymd(new Date(Date.now() + n * 864e5));
    const inner =
      m === "snooze"
        ? html`${b("data-sz", "1d", "Tomorrow")}${b("data-sz", "1w", "Next week")}${b("data-sz", "1m", "Next month")}<div class="ice-date"><input type="date" class="sel" id="ice-sd" min="${day(1)}" max="${day(365)}" aria-label="Snooze until"><button type="button" class="btn sm" data-sz="">Snooze</button></div>`
        : m === "kind"
          ? html`${Object.entries(KIND).map(([v, l]) => b("data-kd", v, l, it.kind === v && it.sorted !== "rules"))}`
          : html`${b("data-bo", "", "Inbox", !it.board)}${((d && d.boards) || []).filter((x) => x.dir === it.dir).map((x) => b("data-bo", x.name, html`${x.client ? PERSON : ""}${x.name}`, sameName(it.board, x.name)))}<button type="button" role="menuitem" data-bo-new="1">${ico("plus")}New board…</button>`;
    return html`<div class="menu-pop ice-mpop" role="menu" data-mi="${i}" aria-label="${m === "snooze" ? "Snooze until" : m === "kind" ? "Kind" : "Board"}">${inner}</div>`;
  };
  const badges = (it) =>
    html`${it.status === "done" && it.written ? html`<span title="Written back ${ago(it.written)}">written back</span>` : ""}${it.status === "done" && it.writeError ? html`<span title="${it.writeError}">write-back failed</span>` : ""}${it.status === "promoted" ? html`<span title="Promoted to Tasks: ${it.idea || ""}">promoted</span>` : ""}${it.replied ? html`<span title="Replied ${ago(it.replied)}">replied</span>` : ""}`;
  const proj = (it) => (many ? html`<span class="nm" title="${it.project || ""}">${plogo(it.dir, it.project || "")}${short(it.project || "")}</span>` : "");
  const row = (i) => {
    const it = ice[i],
      k = iceKey(it),
      open = iceForm === k;
    const head = html`<div class="ice-row${iceCur === k ? " cur" : ""}${iceSel.has(k) ? " sel" : ""}" data-i="${i}" data-k="${k}"><input type="checkbox" id="ice-ck-${i}" data-ck="${i}"${iceSel.has(k) ? " checked" : ""} aria-label="Select: ${it.text}">${live(it) ? menuBtn(i, it, "kind", kindOf(it), "ice-kb", "Kind") : kindOf(it)}<span class="ice-src" title="${srcName(it)}">${fav(it.source, "link", srcOf(it)?.social)}</span><button class="ice-t" id="ice-o-${i}" data-o="${i}" aria-expanded="${String(open)}" title="${it.text}">${it.text}</button><span class="ice-meta">${proj(it)}${badges(it)}${live(it) ? menuBtn(i, it, "board", it.board || "Inbox", "ice-bo" + (it.board ? "" : " none"), "Board") : it.board ? html`<span>${it.board}</span>` : ""}<span class="ice-age">${ago(it.at)}</span><span class="ice-ra">${it.status === "promoted" || it.status === "done" ? "" : html`<button class="btn ghost sm" id="ice-pr-${i}" data-pr="${i}" title="Promote to Tasks (p)" aria-label="Promote to Tasks: ${it.text}">${ico("plus")}</button>`}${live(it) ? menuBtn(i, it, "snooze", ico("clock"), "btn ghost sm", "Snooze (h: a week)") : ""}${it.status === "promoted" || it.status === "done" ? "" : it.status === "dismissed" ? html`<button class="btn ghost sm" id="ice-rs-${i}" data-rs="${i}" title="Restore to waiting" aria-label="Restore: ${it.text}">Restore</button>` : html`<button class="btn ghost sm" id="ice-ds-${i}" data-ds="${i}" title="Dismiss (d)" aria-label="Dismiss: ${it.text}">${ico("x")}</button>`}</span></span>${menu(i, it)}</div>`;
    const more = open
      ? html`<div class="ice-open">${it.notes ? html`<div class="ice-notes">${it.notes}</div>` : ""}${imgs(it)}<span class="hint" style="margin:0">From ${srcName(it)} · ${ago(it.at)}${it.post ? html` · <a href="${web(it.post)}" target="_blank" rel="noopener">open post</a>` : ""}</span>${replyBox(it)}${icePro === k ? form(it) : ""}</div>`
      : "";
    return html`${head}${more}`;
  };
  const hue = (t) => [...t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  // A phone row (under 640 px): kind, two lines, board and age, a thumbnail for a link (its
  // site's hue and letter) or pictures (an icon and the count: nothing is fetched from their
  // site), → Task. A swipe decides it: right a task, left dismissed; a long press snoozes.
  const thumb = (it) => {
    const lk = it.link && /^https?:\/\//i.test(it.link.url) ? it.link : null,
      n = (it.images || []).filter((u) => /^https:\/\//.test(u)).length;
    if (lk) {
      const site = host(lk.url).replace(/^www\./, "");
      return html`<span class="ice-th" style="--h:${hue(site)}" title="${lk.title || site}" aria-hidden="true">${(site[0] || "").toUpperCase()}</span>`;
    }
    return n ? html`<span class="ice-th pic" title="${n} pictures" aria-hidden="true">${ico("img")}<i>${n}</i></span>` : "";
  };
  const prow = (i) => {
    const it = ice[i],
      k = iceKey(it),
      open = iceForm === k,
      done = it.status === "promoted" || it.status === "done";
    const head = html`<div class="ice-row ice-prow${iceCur === k ? " cur" : ""}" data-i="${i}" data-k="${k}"${live(it) ? raw(' data-swipe="1"') : ""}><div class="ice-pbg" aria-hidden="true"><span class="pro">${ico("check")}Task</span><span class="dis">Dismiss${ico("x")}</span></div><div class="ice-pf"><div class="ice-pm"><div class="ice-ph">${live(it) ? menuBtn(i, it, "kind", kindOf(it), "ice-kb", "Kind") : kindOf(it)}${it.sorted === "rules" && live(it) ? html`<span class="ice-uns">unsorted</span>` : ""}<span class="ice-meta">${badges(it)}</span></div><button class="ice-t" id="ice-o-${i}" data-o="${i}" aria-expanded="${String(open)}">${it.text}</button><span class="ice-pmeta">${proj(it)}${it.board ? html`<span>${it.board}</span>` : ""}<span>${ago(it.at)}</span></span></div>${thumb(it)}${done ? "" : it.status === "dismissed" ? html`<button class="btn ghost sm" id="ice-rs-${i}" data-rs="${i}" aria-label="Restore: ${it.text}">Restore</button>` : html`<button class="ib ice-ptask" id="ice-pr-${i}" data-pr="${i}" aria-label="Make a task: ${it.text}" title="Make a task">${ico("arrow")}</button>`}</div>${menu(i, it)}</div>`;
    // Opened, a phone row also offers what its gestures do, for anyone who cannot swipe or hold.
    const acts = live(it)
      ? html`<div class="ice-form-acts ice-pacts">${menuBtn(i, it, "snooze", html`${ico("clock")}Snooze`, "btn ghost sm", "Snooze")}${menuBtn(i, it, "board", html`Board: ${it.board || "Inbox"}`, "btn ghost sm", "Board")}<span class="end"></span><button class="btn ghost sm" id="ice-ds-${i}" data-ds="${i}" aria-label="Dismiss: ${it.text}">${ico("x")}Dismiss</button></div>`
      : "";
    const more = open
      ? html`<div class="ice-open">${it.notes ? html`<div class="ice-notes">${it.notes}</div>` : ""}${imgs(it)}<span class="hint" style="margin:0">From ${srcName(it)} · ${ago(it.at)}${it.post ? html` · <a href="${web(it.post)}" target="_blank" rel="noopener">open post</a>` : ""}</span>${acts}${replyBox(it)}${icePro === k ? form(it) : ""}</div>`
      : "";
    return html`${head}${more}`;
  };
  // A card: what it is, the words, where it sits, how old. A link leads with its title and summary,
  // coloured from the site's name; nothing is fetched from the site to draw it.
  const cardOf = (i) => {
    const it = ice[i],
      k = iceKey(it),
      lk = it.link && /^https?:\/\//i.test(it.link.url) ? it.link : null,
      site = lk ? host(lk.url).replace(/^www\./, "") : "";
    const acts = html`${it.status === "promoted" || it.status === "done" ? "" : html`<button class="btn ghost sm" id="ice-pr-${i}" data-pr="${i}" title="Promote to Tasks (p)" aria-label="Promote to Tasks: ${it.text}">${ico("arrow")}Task</button>`}${live(it) ? html`${menuBtn(i, it, "snooze", html`${ico("clock")}Snooze`, "btn ghost sm", "Snooze")}${menuBtn(i, it, "kind", "Kind", "btn ghost sm", "Kind")}${menuBtn(i, it, "board", "Board", "btn ghost sm", "Board")}` : ""}<span class="end"></span>${it.status === "promoted" || it.status === "done" ? "" : it.status === "dismissed" ? html`<button class="btn ghost sm" id="ice-rs-${i}" data-rs="${i}" title="Restore to waiting" aria-label="Restore: ${it.text}">Restore</button>` : html`<button class="btn ghost sm" id="ice-ds-${i}" data-ds="${i}" title="Dismiss (d)" aria-label="Dismiss: ${it.text}">${ico("x")}</button>`}`;
    return html`<article class="ice-card${iceCur === k ? " cur" : ""}" data-i="${i}" data-k="${k}">${lk ? html`<a class="ice-lk" href="${web(lk.url)}" target="_blank" rel="noopener noreferrer" style="--h:${hue(site)}"><b>${lk.title || site}</b>${lk.summary ? html`<span>${lk.summary}</span>` : ""}<small>${site}</small></a>` : ""}<div class="ice-cb"><div class="ice-ch">${kindOf(it)}${it.sorted === "rules" && live(it) ? html`<span class="ice-uns" title="Kind set by a rule: pick one with Kind">unsorted</span>` : ""}<span class="ice-meta">${badges(it)}</span></div><button class="ice-ct" id="ice-o-${i}" data-o="${i}" title="Open in the Sort list">${it.text}</button>${imgs(it, true)}<div class="ice-cf">${it.board ? html`<span class="ice-cbd">${it.board}</span>` : ""}${(it.tags || []).map((t) => html`<span class="ice-tag">#${t}</span>`)}${proj(it)}<span class="end"></span><span class="ice-when">${it.source !== "manual" ? `${srcName(it)} · ` : ""}${ago(it.at)}</span></div></div><div class="ice-ca">${acts}</div>${menu(i, it)}</article>`;
  };
  const inbox =
    waiting && !order.length
      ? html`<div class="ice-zero"><h4>No matches</h4><p style="margin-top:10px"><button class="btn sm" id="ice-unf">Clear filters</button></p></div>`
      : order.length
        ? cardsOn
          ? html`<div class="ice-cards">${order.map(cardOf)}</div><div class="ice-cpg">${pagerHtml(icePg)}</div>`
          : html`<div class="tk-list ice-list${narrow ? " ice-plist" : ""}">${order.map(narrow ? prow : row)}${pagerHtml(icePg)}</div>`
        : html`<div class="ice-zero"><h4>Nothing waiting</h4><p>Drop anything above: what a client asked for, something you found, what people say.</p>${list.length ? "" : html`<p style="margin-top:10px"><button class="btn sm pri" id="ice-addsrc">${ico("plus")} Add a source</button></p>`}</div>`;
  // Swipe: the waiting requests the filters show, least skipped first; a restored one
  // comes back on top. Nothing is written by a skip.
  const deck = iceSwipe
    ? filtered.filter((i) => isWaiting(ice[i])).sort((a, b) => (iceSwipe.skip.get(iceKey(ice[a])) || 0) - (iceSwipe.skip.get(iceKey(ice[b])) || 0))
    : [];
  // The card always names its project: a swipe decides for that project's Tasks.
  const pName = (it) => it.project || store.S.projects.find((p) => p.dir === it.dir)?.label || "";
  const swCard = (i, back) => {
    const it = ice[i];
    return html`<div class="sw-card${back ? " back" : ""}"${back ? raw(' aria-hidden="true"') : raw(' id="sw-card" tabindex="-1" aria-label="Request: swipe or press → to promote, ← to dismiss"')}><div class="sw-hd">${fav(it.source, "link", srcOf(it)?.social)}<span class="sw-src" title="${srcName(it)}">${srcName(it)}</span><span class="sw-proj" title="${pName(it)}">${plogo(it.dir, pName(it))}${short(pName(it))}</span><span class="ice-age">${ago(it.at)}</span></div><p class="sw-t">${it.text}</p>${back ? "" : html`${it.notes ? html`<div class="ice-notes">${it.notes}</div>` : ""}${imgs(it)}${it.post ? html`<a class="hint" href="${web(it.post)}" target="_blank" rel="noopener">open post</a>` : ""}<span class="sw-stamp pro">Promote</span><span class="sw-stamp dis">Dismiss</span>`}</div>`;
  };
  // Icebox zero: the day's streak counts days in a row the stack was emptied, per project
  // filter, in this browser only.
  const swZero = () => {
    const S = iceSwipe;
    if (S.n && S.days === undefined) {
      const key = "kz-ice-streak:" + (dir || "all"),
        day = (t) => new Date(t).toLocaleDateString("sv"),
        today = day(Date.now());
      let st = { last: "", days: 0 };
      try {
        st = JSON.parse(localStorage.getItem(key) || "") || st;
      } catch (e) {}
      if (st.last !== today) st = { last: today, days: st.last === day(Date.now() - 864e5) ? st.days + 1 : 1 };
      try {
        localStorage.setItem(key, JSON.stringify(st));
      } catch (e) {}
      S.days = st.days;
    }
    const s = Math.round((Date.now() - S.t0) / 1000),
      took = s < 60 ? s + " s" : Math.floor(s / 60) + " min " + (s % 60) + " s";
    const bits = motion() ? html`<div class="sw-confetti" aria-hidden="true">${Array.from({ length: 14 }, (_, n) => raw(`<i style="--x:${(n * 37) % 100}%;--d:${(n % 5) * 0.08}s;--h:${(n * 53) % 360}"></i>`))}</div>` : "";
    return html`<div class="sw-zero">${S.n ? bits : ""}<h4>Icebox zero</h4><p>${S.n ? `${S.n} sorted · ${S.pro} promoted · ${S.dis} dismissed · in ${took}` : "Nothing waiting here."}</p>${S.days ? html`<p>${S.days}-day streak${S.days > 1 ? " — cleared every day" : ""}</p>` : ""}<p style="margin-top:14px"><button class="btn pri sm" id="sw-back">Back to list</button></p></div>`;
  };
  const swipe = () => {
    const S = iceSwipe,
      total = S.n + deck.length,
      pop = S.pop;
    S.pop = false;
    const top = html`<div class="sw-top"><button class="btn ghost sm" id="sw-x" title="Back to the list (Esc)">← List</button><div class="sw-prog" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${S.n}"><i style="width:${total ? Math.round((S.n / total) * 100) : 100}%"></i></div><span class="sw-of">${deck.length ? `${S.n + 1} of ${total}` : `${total} of ${total}`}</span><span class="sw-streak" title="Sorted this session">${S.n} sorted${pop ? html`<b class="sw-plus">+1</b>` : ""}</span></div>`;
    if (!deck.length) return html`<div class="sw" id="sw">${top}${swZero()}</div>`;
    const b = (id, cls, icon, label, key, off = false) =>
      html`<button class="sw-b ${cls}" id="${id}" aria-label="${label} (${key})" title="${label} (${key})"${off ? " disabled" : ""}><span>${icon}</span><small>${label}</small><kbd>${key}</kbd></button>`;
    return html`<div class="sw" id="sw">${top}<div class="sw-stack">${deck[1] !== undefined ? swCard(deck[1], true) : ""}${swCard(deck[0], false)}</div><div class="sw-acts">${b("sw-d", "dis", ico("x"), "Dismiss", "←")}${b("sw-s", "", "↓", "Skip", "↓", deck.length < 2)}${b("sw-u", "", ico("restore"), "Undo", "z", !S.last)}${b("sw-p", "pro", ico("check"), "Promote", "→")}</div></div>`;
  };
  // The sources, in the right-hand drawer: shut until asked for. Slid in only when opened;
  // a rebuild while open shows it in place.
  const drawer = !!srcShow,
    slide = drawer && !$("src-sec")?.classList.contains("open");
  const sec = html`<div class="src-scrim${drawer && !slide ? " on" : ""}" id="src-scrim"></div><aside class="src-sec${drawer && !slide ? " open" : ""}" id="src-sec" aria-label="Sources"${drawer ? "" : " inert"}><header><div class="t"><b>Sources</b><div class="src-chips"><a id="src-to-settings" class="schip" role="button" tabindex="0" title="${d && d.every && d.every !== "off" ? `Checked every ${d.every}` : "Auto-check off"}: change in Settings">${ico("clock")}${d && d.every && d.every !== "off" ? (d.every) : "Off"}</a>${G.connected ? html`<span class="schip on" title="ChatGPT${G.email ? ": " + (G.email) : ""}">${ico("ai")}ChatGPT<a id="cg-out" role="button" tabindex="0" aria-label="Disconnect ChatGPT" title="Disconnect">${ico("x")}</a></span>` : html`<a id="cg-in" class="schip" role="button" tabindex="0" title="Connect ChatGPT">${ico("ai")}ChatGPT</a>`}${(d.google || {}).connected ? html`<span class="schip on" title="Google connected">${ico("google")}Google<a id="gg-out" role="button" tabindex="0" aria-label="Disconnect Google" title="Disconnect">${ico("x")}</a></span>` : html`<a id="gg-in" class="schip" role="button" tabindex="0" title="Connect Google">${ico("google")}Google</a>`}</div></div><div class="src-hda">${list.length ? html`<button class="btn sm" id="src-go">${ico("refresh")} Gather all</button><button class="btn sm" id="src-new" aria-expanded="${String(addOn)}" aria-controls="src-addbox">${ico("plus")} Add</button>` : ""}<button class="ib" id="src-x" aria-label="Close sources" title="Close">${ico("close")}</button></div></header><div class="body">${addBox}${list.length ? html`<div class="src-list">${cards}</div>` : emptyState}</div></aside>`;
  // First visit: offer the ChatGPT plan for social sources, or keep the agent.
  const onb =
    G.use === "ask" && !G.connected
      ? html`<div class="cg-onb"><div class="acts"><b>Gather social posts with ChatGPT?</b><span class="end"></span><button class="btn ghost" id="cg-skip">Skip</button><button class="btn pri" id="cg-go">Connect</button></div></div>`
      : "";
  // A rebuild replaces the drawer: keep where it was scrolled to.
  const at = $("src-sec")?.querySelector(".body")?.scrollTop ?? 0;
  const capFocus = cap.ta && document.activeElement === cap.ta ? [cap.ta.selectionStart, cap.ta.selectionEnd] : null;
  $("pbody").innerHTML =
    d && d.error
      ? html`<p style="color:var(--dim)">${d.error}</p>`
      : !d
        ? html`<p style="color:var(--dim)">The icebox could not be read.</p>`
        : iceSwipe
          ? html`${swipe()}${sec}`
          : html`${capBox}${narrow ? "" : onb}${boardsBar}${bar}${bulk}${fails}${inbox}${sec}`;
  if (!d || d.error) return;
  const body = $("src-sec")?.querySelector(".body");
  if (body) body.scrollTop = at;
  if ($("ice-cap")) {
    if (!cap.ta) {
      const ta = document.createElement("textarea");
      ta.id = "ice-cap-t";
      ta.className = "ice-cap-t";
      ta.rows = 2;
      ta.placeholder = "Drop anything: a note, a link, a picture — or dictate";
      ta.setAttribute("aria-label", "Drop anything into the icebox");
      cap.ta = ta;
      cap.mic = mic([ta]);
    }
    // A phone has room for one short line.
    cap.ta.placeholder = narrowQ.matches ? "Drop a note, link or picture…" : "Drop anything: a note, a link, a picture — or dictate";
    $("ice-cap-slot").replaceWith(cap.ta);
    if (cap.mic) $("ice-mic-slot").replaceWith(cap.mic);
    else $("ice-mic-slot").remove();
    if (capFocus) {
      cap.ta.focus();
      cap.ta.setSelectionRange(capFocus[0], capFocus[1]);
    }
    const addFile = (f) => {
      cap.files.push(f);
      openSources().then(() => cap.ta.focus());
    };
    $("ice-pick").onclick = () => $("ice-file").click();
    $("ice-file").onchange = (e) => {
      const fs = [...e.target.files];
      e.target.value = "";
      cap.files.push(...fs);
      openSources().then(() => cap.ta.focus());
    };
    $("pbody")
      .querySelectorAll("[data-rf]")
      .forEach((b) => (b.onclick = () => {
        cap.files.splice(+b.dataset.rf, 1);
        openSources().then(() => cap.ta.focus());
      }));
    // A pasted picture is a file; pasted text stays text.
    cap.ta.onpaste = (e) => {
      for (const it of e.clipboardData.items)
        if (it.kind === "file") {
          const x = it.getAsFile();
          e.preventDefault();
          addFile(new File([x], x.name === "image.png" ? `paste-${Date.now()}.png` : x.name, { type: x.type }));
        }
    };
    // Saved with the text it had: the field is read-only until the server answers.
    const save = async () => {
      const text = cap.ta.value.trim(),
        to = dir || cap.dir;
      if (cap.busy) return;
      if (!text) {
        if (cap.files.length) toast("Write a line about it first");
        return cap.ta.focus();
      }
      if (!to) return toast("Pick a project first");
      cap.busy = cap.ta.readOnly = true;
      $("ice-save").disabled = true;
      $("ice-save").textContent = "Saving…";
      let j = { ok: false };
      try {
        j = await post("/icebox", { op: "add", dir: to, text, board: cap.board || undefined, files: await dataUrls(cap.files) });
      } finally {
        cap.busy = cap.ta.readOnly = false;
      }
      if (j.ok) {
        cap.ta.value = "";
        cap.files = [];
        iceCur = null;
        toast(`Added to the icebox${cap.board ? " · " + cap.board : ""}`);
        load();
      }
      if (srcOpen()) await openSources();
      cap.ta.focus();
    };
    cap.ta.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        save();
      }
    };
    $("ice-save").onclick = save;
    wirePick("ice-cp", (v) => {
      cap.dir = v;
      openSources().then(() => cap.ta.focus());
    });
    wirePick("ice-cb", (v) => {
      if (v === "\n") {
        const n = (prompt("New board: a client or a topic") || "").trim();
        if (!n) return cap.ta.focus();
        if (n.length > 40) return toast("A board name is 1 to 40 characters");
        v = n;
      }
      cap.board = v;
      cap.boardDir = dir || cap.dir;
      openSources().then(() => cap.ta.focus());
    });
  }
  if (iceMenu !== iceMenuFor) {
    iceMenuFor = iceMenu;
    iceMenuAt = iceMenu ? Date.now() : 0;
  }
  $("pbody").onscroll = () => {
    if (!iceMenu || Date.now() - iceMenuAt < 400) return;
    iceMenu = "";
    $("pbody").querySelector(".ice-mpop")?.remove();
    $("pbody").querySelector('[data-m][aria-expanded="true"]')?.setAttribute("aria-expanded", "false");
  };
  // The boards bar and the kind filters; the view switch.
  $("pbody")
    .querySelectorAll("[data-bd]")
    .forEach((b) => (b.onclick = () => {
      iceBoard = b.dataset.bd;
      // The box follows the chip: its board, and in All projects that board's project.
      const fb = iceBoard && boards.find((x) => sameName(x.name, iceBoard));
      if (fb) {
        cap.board = fb.name;
        cap.boardDir = fb.dir;
        if (!dir) cap.dir = fb.dir;
      }
      openSources();
    }));
  $("pbody")
    .querySelectorAll("[data-kf]")
    .forEach((b) => (b.onclick = () => {
      iceKinds.has(b.dataset.kf) ? iceKinds.delete(b.dataset.kf) : iceKinds.add(b.dataset.kf);
      openSources();
    }));
  $("pbody")
    .querySelectorAll("[data-view]")
    .forEach((b) => (b.onclick = () => {
      iceView = b.dataset.view;
      try {
        localStorage.setItem("kz-ice-view", iceView);
      } catch (e) {}
      openSources();
    }));
  // + Board: a name, and whether it is a client's (its items then count as Client).
  if ($("ice-nb"))
    $("ice-nb").onclick = async () => {
      const to = dir || cap.dir;
      if (!to) return toast("Pick a project first");
      const name = (prompt(dir ? "New board: a client or a topic" : `New board in ${capP?.label || "this project"}: a client or a topic`) || "").trim();
      if (!name) return;
      const client = confirm(`Is ${name} a client? Its items then count as Client.`);
      const j = await post("/icebox", { op: "boards", act: "add", dir: to, name, client });
      if (j.ok) {
        toast(`Board ${name} made`);
        load();
      }
      if (srcOpen()) openSources();
    };
  if (sdKeep && sdKeep[0] === iceMenu && $("ice-sd")) $("ice-sd").value = sdKeep[1];
  if (iceDraft && iceDraft[0] === iceForm && $("ice-title")) {
    $("ice-title").value = iceDraft[1];
    $("ice-details").value = iceDraft[2];
  }
  if ($("src-add")) {
    if (typed[5]) $("src-plat").value = typed[5];
    $("src-q").value = typed[6] || "";
    $("src-url").value = typed[0];
    $("src-label").value = typed[1];
    $("src-cat").value = typed[4] || "";
    if (typed[3] !== undefined && $("src-dir")) $("src-dir").value = typed[3];
  }
  if ($("src-to-settings"))
    $("src-to-settings").onclick = () => {
      store.setQ = "sources";
      go("settings", true);
    };
  // The tab is opened inside the click, before the sign-in URL comes back: a popup blocker
  // lets only that through. The board hears of the result through /events.
  const connect = async () => {
    const w = window.open("", "_blank");
    const j = await post("/chatgpt", { op: "connect" });
    if (j.ok && w) w.location = j.url;
    else {
      w?.close();
      if (j.ok) location.href = j.url;
    }
  };
  for (const id of ["cg-go", "cg-in"]) if ($(id)) $(id).onclick = connect;
  // Google needs the user's own OAuth client (Desktop app, Sheets API on); asked once.
  if ($("gg-in"))
    $("gg-in").onclick = async () => {
      if (!(d.google || {}).hasClient) {
        toast("Add your Google client in Settings first");
        store.setQ = "google";
        go("settings", true);
        return;
      }
      const w = window.open("", "_blank");
      const j = await post("/google", { op: "connect" });
      if (j.ok && w) w.location = j.url;
      else {
        w?.close();
        if (j.ok) location.href = j.url;
        else toast(j.error || "Could not start Google sign-in");
      }
    };
  if ($("gg-out"))
    $("gg-out").onclick = async () => {
      if (!confirm("Disconnect Google? Done requests stop being written to sheets.")) return;
      if ((await post("/google", { op: "disconnect" })).ok) {
        toast("Google disconnected");
        openSources();
      }
    };
  if ($("cg-skip"))
    $("cg-skip").onclick = async () => {
      if ((await post("/chatgpt", { op: "skip" })).ok) {
        openSources();
      }
    };
  if ($("cg-out"))
    $("cg-out").onclick = async () => {
      if (!confirm("Disconnect ChatGPT? Gather goes back to your agent.")) return;
      if ((await post("/chatgpt", { op: "disconnect" })).ok) {
        toast("ChatGPT disconnected");
        openSources();
      }
    };
  if (slide) {
    $("src-sec").offsetWidth;
    $("src-sec").classList.add("open");
    $("src-scrim").classList.add("on");
  }
  const srcShut = () => {
    srcShow = false;
    $("src-sec").classList.remove("open");
    $("src-scrim").classList.remove("on");
    $("src-sec").inert = true;
    $("src-tog").setAttribute("aria-expanded", "false");
    $("src-tog").focus();
  };
  $("src-x").onclick = $("src-scrim").onclick = srcShut;
  if ($("src-new"))
    $("src-new").onclick = () => {
      const b = $("src-addbox");
      srcAdd = b.hidden;
      b.hidden = !srcAdd;
      $("src-new").setAttribute("aria-expanded", srcAdd);
      if (srcAdd) $(srcKind === "social" ? "src-q" : "src-url").focus();
    };
  $("src-sec").onkeydown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      srcShut();
    }
  };
  const srcTog = () => {
    if ($("src-sec").classList.contains("open")) return srcShut();
    srcShow = true;
    openSources().then(() => srcShow && $("src-url")?.focus());
  };
  if ($("src-tog")) $("src-tog").onclick = srcTog;
  if ($("ice-addsrc")) $("ice-addsrc").onclick = srcTog;
  wirePick("ice-fs", (v) => {
    iceSrc = v;
    openSources();
  });
  wirePick("ice-fc", (v) => {
    iceCat = v;
    openSources();
  });
  if ($("ice-unf"))
    $("ice-unf").onclick = () => {
      iceCat = iceSrc = iceBoard = "";
      iceKinds.clear();
      if (!dir) store.shown.clear();
      setShown();
      openSources();
    };
  $("pbody")
    .querySelectorAll("[data-kind]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          if (srcKind === b.dataset.kind) return;
          srcKind = b.dataset.kind;
          openSources().then(() => $(srcKind === "social" ? "src-q" : "src-url")?.focus());
        }),
    );
  const act = async (body, done) => {
    const j = await post("/sources", body);
    if (j.ok) {
      done(j);
      load();
    }
    if (srcOpen()) openSources();
  };
  $("pbody")
    .querySelectorAll("[data-mv]")
    .forEach((m) => {
      const s = list[+m.dataset.mv],
        b = $("src-mb-" + m.dataset.mv),
        to = picked.get(m.dataset.k);
      if (to && [...m.options].some((o) => o.value === to)) m.value = to;
      (m.onchange = () => {
        b.disabled = m.value === s.dir;
      })();
      b.onclick = () =>
        act({ op: "move", dir: s.dir, to: m.value, url: s.url }, () =>
          toast("Source moved"),
        );
    });
  $("pbody")
    .querySelectorAll("[data-wb]")
    .forEach((m) => {
      const s = list[+m.dataset.wb];
      m.onclick = () => {
        const on = !m.classList.contains("on");
        if (on && s.social === undefined && /docs\.google\.com/.test(s.url) && !(d.google || {}).connected) {
          alert("Connect Google first (Sources header), so kaizen can write to the sheet.");
          return;
        }
        if (on && !confirm("When a promoted request's run is done, kaizen will write that back to this source. A closed issue or a changed cell is visible to others. Turn on?")) return;
        act({ op: "writeback", dir: s.dir, url: s.url, on }, () =>
          toast(on ? "Write back on" : "Write back off"),
        );
      };
    });
  $("pbody")
    .querySelectorAll("[data-ag-on]")
    .forEach((m) => {
      const s = list[+m.dataset.agOn];
      m.onclick = () => {
        const on = !m.classList.contains("on");
        act({ op: "paused", dir: s.dir, url: s.url, on: !on }, () =>
          toast(on ? "Auto gather on" : "Auto gather off"),
        );
      };
    });
  // The category saves on its button or Enter, never per keystroke.
  $("pbody")
    .querySelectorAll("[data-ct]")
    .forEach((m) => {
      const s = list[+m.dataset.ct],
        b = $("src-cs-" + m.dataset.ct),
        was = cats.get(m.dataset.k);
      if (was !== undefined) m.value = was;
      (m.oninput = () => {
        b.disabled = m.value.trim() === (s.category || "");
      })();
      m.onkeydown = (e) => {
        if (e.key === "Enter" && !b.disabled) b.click();
      };
      b.onclick = () => {
        b.disabled = true;
        act({ op: "category", dir: s.dir, url: s.url, category: m.value.trim() }, () =>
          toast(
            m.value.trim()
              ? `New requests from ${s.label || host(s.url)} go under ${m.value.trim()}`
              : "Category cleared",
          ),
        );
      };
    });
  // The acting button is disabled as it is pressed, which drops focus to the page; it goes back to the cursor row.
  const focusCur = () => {
    if (!document.activeElement || document.activeElement === document.body)
      $("pbody").querySelector(".ice-row.cur .ice-t,.ice-card.cur .ice-ct")?.focus();
  };
  // Before rows go, the cursor steps to the next row that stays, else the one before.
  const stepPast = (gone) => {
    const at = order.findIndex((i) => iceKey(ice[i]) === iceCur);
    if (at < 0 || !gone.has(iceCur)) return;
    const stay = (i) => !gone.has(iceKey(ice[i])),
      n = order.slice(at + 1).find(stay) ?? order.slice(0, at).reverse().find(stay);
    iceCur = n === undefined ? null : iceKey(ice[n]);
  };
  const iceAct = (op, it, msg, extra = {}) =>
    (async () => {
      stepPast(new Set([iceKey(it)]));
      const j = await post("/icebox", { op, dir: it.dir, ids: [it.id], ...extra });
      if (j.ok) {
        if (op === "promote" && iceForm === iceKey(it)) iceForm = icePro = null;
        toast(msg);
        load();
      }
      if (srcOpen()) openSources().then(focusCur);
    })();
  // Snooze: the items leave the page until their day, with Undo on the toast.
  const snoozeAll = async (its, until) => {
    if (!its.length) return;
    stepPast(new Set(its.map(iceKey)));
    iceMenu = "";
    iceBusy = true;
    const done = [];
    try {
      for (const dd of new Set(its.map((it) => it.dir))) {
        const xs = its.filter((it) => it.dir === dd);
        if ((await post("/icebox", { op: "snooze", dir: dd, ids: xs.map((it) => it.id), until })).ok) done.push(...xs);
      }
    } finally {
      iceBusy = false;
    }
    if (done.length) {
      done.forEach((it) => iceSel.delete(iceKey(it)));
      toast(`${done.length > 1 ? done.length + " snoozed" : "Snoozed"} until ${wakeDay(until).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`);
      const t = $("toast"),
        u = document.createElement("button");
      u.type = "button";
      u.className = "ice-undo";
      u.textContent = "Undo";
      u.onclick = async () => {
        t.classList.remove("on");
        let back = 0;
        for (const dd of new Set(done.map((it) => it.dir)))
          if ((await post("/icebox", { op: "unsnooze", dir: dd, ids: done.filter((it) => it.dir === dd).map((it) => it.id) })).ok) back++;
        if (back) {
          iceCur = iceKey(done[0]);
          toast("Back in the icebox");
        }
        load();
        if (srcOpen()) openSources();
      };
      t.classList.add("rep");
      t.append(" · ", u);
    }
    load();
    if (srcOpen()) openSources().then(focusCur);
  };
  // Kind and board: the item stays, changed.
  const setOne = async (it, body, msg) => {
    iceMenu = "";
    const j = await post("/icebox", { dir: it.dir, ids: [it.id], ...body });
    if (j.ok) {
      toast(msg);
      load();
    }
    if (srcOpen()) openSources().then(() => $("pbody").querySelector(`[data-k="${CSS.escape(iceKey(it))}"] [data-m]`)?.focus());
  };
  $("pbody")
    .querySelectorAll("[data-m]")
    .forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      const it = ice[+b.dataset.mi],
        m = iceKey(it) + " " + b.dataset.m;
      iceCur = iceKey(it);
      iceMenu = iceMenu === m ? "" : m;
      openSources().then(() => iceMenu && $("pbody").querySelector(".ice-mpop button")?.focus());
    }));
  // The open menu sits fixed under its button: inside the cards' columns an absolute one is split
  // between columns. Scrolling the page shuts it.
  $("pbody")
    .querySelectorAll(".ice-mpop")
    .forEach((pp) => {
      const it = ice[+pp.dataset.mi],
        btn = pp.parentElement.querySelector(`[data-m="${iceMenu.slice(iceKey(it).length + 1)}"]`) || pp.parentElement.querySelector(".ice-pf");
      if (btn) {
        const r = btn.getBoundingClientRect(),
          h = pp.offsetHeight,
          w = pp.offsetWidth;
        pp.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
        pp.style.top = (r.bottom + 4 + h > innerHeight - 8 ? Math.max(8, r.top - 4 - h) : r.bottom + 4) + "px";
      }
      pp.onclick = (e) => e.stopPropagation();
      pp.onkeydown = (e) => {
        const bs = [...pp.querySelectorAll("button,input")],
          n = bs.indexOf(document.activeElement);
        if (e.key === "Escape") {
          e.stopPropagation();
          iceMenu = "";
          openSources().then(focusCur);
        } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && document.activeElement?.type !== "date") {
          e.preventDefault();
          bs[(n + (e.key === "ArrowDown" ? 1 : bs.length - 1)) % bs.length]?.focus();
        }
      };
      pp.querySelectorAll("[data-sz]").forEach((b) => (b.onclick = () => {
        const v = b.dataset.sz || $("ice-sd").value;
        if (!v) return $("ice-sd").focus();
        snoozeAll([it], v);
      }));
      pp.querySelectorAll("[data-kd]").forEach((b) => (b.onclick = () => setOne(it, { op: "kind", kind: b.dataset.kd }, `Kind: ${KIND[b.dataset.kd]}`)));
      pp.querySelectorAll("[data-bo]").forEach((b) => (b.onclick = () => setOne(it, { op: "board", board: b.dataset.bo }, b.dataset.bo ? `Moved to ${b.dataset.bo}` : "Moved to the Inbox")));
      pp.querySelectorAll("[data-bo-new]").forEach((b) => (b.onclick = () => {
        const n = (prompt("New board: a client or a topic") || "").trim();
        if (n) setOne(it, { op: "board", board: n }, `Moved to ${n}`);
      }));
    });
  // Bulk: one dismiss per project; promote one request at a time, each its own task
  // titled as gathered (one promote call with several ids would merge them into one).
  const bulkDo = async (op) => {
    const its = ice.filter((it) => iceSel.has(iceKey(it)));
    if (!its.length) return;
    stepPast(new Set(its.map(iceKey)));
    iceBusy = true;
    $("ice-bp").disabled = $("ice-bd").disabled = $("ice-bz").disabled = true;
    let ok = 0;
    try {
      if (op === "dismiss")
        for (const dd of new Set(its.map((it) => it.dir))) {
          const ids = its.filter((it) => it.dir === dd).map((it) => it.id);
          if ((await post("/icebox", { op, dir: dd, ids })).ok) ok += ids.length;
        }
      else for (const it of its) if ((await post("/icebox", { op, dir: it.dir, ids: [it.id] })).ok) ok++;
    } finally {
      iceBusy = false;
    }
    iceSel.clear();
    if (ok)
      toast(
        `${ok} ${op === "promote" ? "promoted to Tasks" : "dismissed"}${ok < its.length ? `, ${its.length - ok} not` : ""}`,
      );
    load();
    if (srcOpen()) openSources().then(focusCur);
  };
  if (bulk) {
    $("ice-bz").onclick = () => snoozeAll(ice.filter((it) => iceSel.has(iceKey(it)) && live(it)), "1w");
    $("ice-bp").onclick = () => bulkDo("promote");
    $("ice-bd").onclick = () => bulkDo("dismiss");
    $("ice-bc").onclick = () => {
      iceSel.clear();
      openSources();
    };
  }
  wirePager(icePg, openSources);
  if ($("ice-all"))
    $("ice-all").onchange = () => {
      const k = order.map((i) => iceKey(ice[i]));
      if (nSel === order.length) k.forEach((x) => iceSel.delete(x));
      else k.forEach((x) => iceSel.add(x));
      openSources();
    };
  if ($("ice-all")) $("ice-all").indeterminate = nSel > 0 && nSel < order.length;
  $("pbody")
    .querySelectorAll("[data-ck]")
    .forEach(
      (c) =>
        (c.onchange = () => {
          const k = iceKey(ice[+c.dataset.ck]);
          iceCur = k;
          c.checked ? iceSel.add(k) : iceSel.delete(k);
          openSources();
        }),
    );
  // A row opens on its title or anywhere not a control; open shows what was gathered and the promote form.
  // A card opens in the Sort list (for this visit; the saved view stays), where notes, reply and promote are.
  const toggle = (i) => {
    const k = iceKey(ice[i]);
    iceCur = k;
    iceForm = iceForm === k && !cardsOn ? null : k;
    iceView = "sort";
    icePro = null;
    openSources().then(() => $("ice-o-" + i)?.focus());
  };
  $("pbody")
    .querySelectorAll(".ice-row")
    .forEach(
      (r) =>
        (r.onclick = (e) => {
          if (!e.target.closest("input,button,.ice-mpop")) toggle(+r.dataset.i);
        }),
    );
  $("pbody")
    .querySelectorAll("[data-o]")
    .forEach((b) => (b.onclick = () => toggle(+b.dataset.o)));
  // Images from a source load only when asked: fetching one tells its host the item was opened.
  $("pbody")
    .querySelectorAll("details.ice-imgs")
    .forEach((d) => (d.ontoggle = () => d.open && d.querySelectorAll("img[data-src]").forEach((i) => (i.src = i.dataset.src))));
  $("pbody")
    .querySelectorAll("[data-pr]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          const it = ice[+b.dataset.pr],
            k = iceKey(it);
          iceCur = iceForm = icePro = k;
          iceView = "sort";
          if (G.connected && !(iceTask && iceTask.k === k)) taskDraft(it);
          openSources().then(() => {
            $("ice-title")?.focus();
            $("ice-title")?.select();
          });
        }),
    );
  $("pbody")
    .querySelectorAll("[data-ds]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          b.disabled = true;
          iceAct("dismiss", ice[+b.dataset.ds], "Dismissed");
        }),
    );
  $("pbody")
    .querySelectorAll("[data-rs]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          b.disabled = true;
          iceAct("restore", ice[+b.dataset.rs], "Restored");
        }),
    );
  const open1 = ice.find((it) => iceKey(it) === iceForm);
  if ($("ice-rp"))
    $("ice-rp").onclick = async () => {
      const it = open1,
        k = iceKey(it);
      iceReply = { k, text: "", wait: true };
      openSources();
      const j = await post("/reply", { op: "draft", dir: it.dir, id: it.id, style: rStyle(it.dir) });
      if (!iceReply || iceReply.k !== k) return;
      iceReply = { k, text: j.text || "", note: j.ok ? j.note || "" : "", wait: false };
      openSources().then(() => $("ice-reply")?.focus());
    };
  if ($("ice-rst"))
    $("ice-rst").onchange = (e) => {
      const d = open1.dir;
      iceStyle[d] = e.target.value;
      try {
        localStorage.setItem("kz-reply-style:" + d, iceStyle[d]);
      } catch (e) {}
    };
  // Another draft in the picked style, told to differ from the one in the box; the box keeps its text until it lands.
  if ($("ice-rg"))
    $("ice-rg").onclick = async () => {
      const it = open1,
        r = iceReply;
      r.again = true;
      openSources();
      const j = await post("/reply", { op: "draft", dir: it.dir, id: it.id, style: rStyle(it.dir), avoid: r.text });
      if (iceReply !== r) return;
      r.again = false;
      if (j.text) r.text = j.text;
      r.note = j.ok ? j.note || "" : "";
      openSources().then(() => $("ice-reply")?.focus());
    };
  if ($("ice-reply")) {
    const ta = $("ice-reply");
    ta.oninput = () => {
      iceReply.text = ta.value;
      $("ice-rn").textContent = `${ta.value.length} chars`;
      $("ice-rs").disabled = !ta.value.trim();
    };
    ta.onkeydown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        $("ice-rc").click();
      }
    };
    $("ice-rc").onclick = () => {
      iceReply = null;
      openSources();
    };
    $("ice-rs").onclick = async () => {
      const it = open1,
        r = iceReply;
      r.busy = true;
      openSources();
      const j = await post("/reply", { op: "send", dir: it.dir, id: it.id, text: r.text });
      if (j.ok) {
        iceReply = null;
        toast("Reply posted");
      } else if (j.sent) iceReply = null;
      else r.busy = false;
      load();
      if (srcOpen()) openSources();
    };
  }

  // Ask for a draft; when it comes, fill the form only where the person has not typed.
  async function taskDraft(it) {
    const k = iceKey(it),
      before = { title: $("ice-title")?.dataset.k === k ? $("ice-title").value : it.text, details: $("ice-title")?.dataset.k === k ? $("ice-details").value : "" };
    iceTask = { k, wait: true, title: iceTask?.k === k ? iceTask.title : "", details: iceTask?.k === k ? iceTask.details : "" };
    const r = await fetch("/icebox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "task-draft", dir: it.dir, ids: [it.id] }) })
      .then((x) => x.json())
      .catch(() => ({ error: "kaizen did not answer" }));
    if (!iceTask || iceTask.k !== k) return;
    if (r.ok && r.title) {
      const ti = $("ice-title"), de = $("ice-details");
      const untouched = !ti || ti.dataset.k !== k || (ti.value === before.title && de.value === before.details);
      iceTask = { k, wait: false, title: r.title, details: r.details || "" };
      if (ti && ti.dataset.k === k && untouched) {
        ti.value = r.title;
        de.value = r.details || "";
      } else if (ti && ti.dataset.k === k) iceTask = { k, wait: false, title: ti.value, details: de.value, kept: true };
    } else iceTask = { k, wait: false, title: "", details: "", note: r.error || r.note || "ChatGPT did not answer" };
    if (srcOpen() && iceForm === k) openSources();
  }
  if ($("ice-td") && open1)
    $("ice-td").onclick = () => {
      iceTask = null;
      taskDraft(open1);
      openSources();
    };
  if ($("ice-ok")) {
    const ok = () => {
      const title = $("ice-title").value.trim();
      if (!title) {
        $("ice-title").focus();
        return;
      }
      $("ice-ok").disabled = true;
      iceAct("promote", open1, "Promoted to Tasks", { text: title, details: $("ice-details").value });
    };
    $("ice-ok").onclick = ok;
    $("ice-cancel").onclick = () => {
      icePro = null;
      openSources();
    };
    $("ice-title").onkeydown = (e) => {
      if (e.key === "Enter") ok();
      if (e.key === "Escape") $("ice-cancel").click();
    };
    $("ice-details").onkeydown = (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) ok();
      if (e.key === "Escape") $("ice-cancel").click();
    };
  }
  // Swipe: a decision flies the card off, clicks (when the board's sound is on), then posts.
  const swGo = async (op) => {
    const S = iceSwipe,
      i = deck[0];
    if (!S || S.busy || i === undefined) return;
    const it = ice[i],
      k = iceKey(it);
    if (op === "skip") {
      if (deck.length < 2) return;
      S.skip.set(k, Math.max(...deck.map((x) => S.skip.get(iceKey(ice[x])) || 0)) + 1);
      return openSources();
    }
    S.busy = true;
    const c = $("sw-card");
    if (c && motion()) {
      lift(c);
      const dir = op === "promote" ? 1 : -1;
      await c
        .animate([{ transform: getComputedStyle(c).transform }, { transform: `translateX(${dir * innerWidth}px) rotate(${dir * 30}deg)`, opacity: 0 }], {
          duration: 320,
          easing: "cubic-bezier(.3,.6,.4,1)",
          fill: "forwards",
        })
        .finished.catch(() => {});
    }
    if (soundPick() !== "off") playSound("pop");
    const j = await post("/icebox", { op, dir: it.dir, ids: [it.id] });
    S.busy = false;
    if (j.ok) {
      S.n++;
      op === "promote" ? S.pro++ : S.dis++;
      // Only a dismiss can be undone here: a promote has already made a task card.
      S.last = op === "dismiss" ? it : null;
      S.pop = true;
    } else toast(`Could not ${op}: ${j.error || "kaizen did not answer"}`);
    load();
    if (srcOpen()) openSources();
  };
  const swUndo = async () => {
    const S = iceSwipe,
      it = S && S.last;
    if (!it || S.busy) return;
    S.busy = true;
    const j = await post("/icebox", { op: "restore", dir: it.dir, ids: [it.id] });
    S.busy = false;
    if (j.ok) {
      S.n--;
      S.dis--;
      S.last = null;
      S.skip.set(iceKey(it), -1);
      toast("Restored");
    }
    load();
    if (srcOpen()) openSources();
  };
  const swExit = () => {
    iceSwipe = null;
    openSources().then(focusCur);
  };
  // Phone rows: drag right to make a task, left to dismiss (Undo on the toast), hold to snooze.
  // The page keeps scrolling: a drag counts only once it is mostly sideways (touch-action: pan-y
  // hands every vertical move to the browser, which cancels the pointer).
  const undoDismiss = (it) => {
    const t = $("toast"),
      u = document.createElement("button");
    u.type = "button";
    u.className = "ice-undo";
    u.textContent = "Undo";
    u.onclick = async () => {
      t.classList.remove("on");
      if ((await post("/icebox", { op: "restore", dir: it.dir, ids: [it.id] })).ok) {
        iceCur = iceKey(it);
        toast("Back in the icebox");
      }
      load();
      if (srcOpen()) openSources();
    };
    t.classList.add("rep");
    t.append(" · ", u);
  };
  const rowGo = async (r, it, op) => {
    r.classList.add("gone");
    r.style.setProperty("--to", (op === "promote" ? 1 : -1) * r.offsetWidth + "px");
    if (motion()) await new Promise((ok) => setTimeout(ok, 180));
    if (soundPick() !== "off") playSound("pop");
    stepPast(new Set([iceKey(it)]));
    const j = await post("/icebox", { op, dir: it.dir, ids: [it.id] });
    if (j.ok) {
      toast(op === "promote" ? "Made a task" : "Dismissed");
      if (op === "dismiss") undoDismiss(it);
    }
    load();
    if (srcOpen()) openSources();
  };
  $("pbody")
    .querySelectorAll(".ice-prow[data-swipe]")
    .forEach((r) => {
      const f = r.querySelector(".ice-pf"),
        it = ice[+r.dataset.i];
      f.onpointerdown = (e) => {
        if (e.button || r.classList.contains("gone") || e.target.closest(".ice-ptask,.ice-kb,a,input,summary,.ice-mpop")) return;
        const x0 = e.clientX,
          y0 = e.clientY;
        let dx = 0,
          mode = "";
        // A tap after a drag or a hold must not also open the row.
        // A hold redraws the page under the finger, so the click that follows its release lands on
        // the new menu: it is eaten on the whole document until just after that release.
        const eat = () => {
          const k = (c) => {
            c.stopPropagation();
            c.preventDefault();
          };
          document.addEventListener("click", k, { capture: true, once: true });
          let gone = false;
          const off = () => {
            if (gone) return;
            gone = true;
            document.removeEventListener("pointerup", off, { capture: true });
            document.removeEventListener("pointercancel", off, { capture: true });
            setTimeout(() => document.removeEventListener("click", k, { capture: true }), 60);
          };
          if (mode === "hold") {
            // Released, cancelled by the browser, or left far too long: the blocker goes either way.
            document.addEventListener("pointerup", off, { capture: true });
            document.addEventListener("pointercancel", off, { capture: true });
            setTimeout(off, 5000);
          } else off();
        };
        const hold = setTimeout(() => {
          if (mode) return;
          mode = "hold";
          eat();
          iceCur = iceKey(it);
          iceMenu = iceKey(it) + " snooze";
          navigator.vibrate?.(10);
          openSources().then(() => $("pbody").querySelector(".ice-mpop button")?.focus());
        }, 500);
        const reset = () => {
          f.style.transform = "";
          r.style.removeProperty("--p");
          delete r.dataset.dir;
        };
        const end = (cancel) => {
          clearTimeout(hold);
          f.onpointermove = f.onpointerup = f.onpointercancel = null;
          if (mode !== "drag") return;
          r.classList.remove("drag");
          swHeld = false;
          const late = swLate;
          swLate = false;
          eat();
          if (!cancel && Math.abs(dx) > r.offsetWidth * 0.35) rowGo(r, it, dx > 0 ? "promote" : "dismiss");
          else {
            reset();
            if (late) openSources();
          }
        };
        f.onpointermove = (m) => {
          const mx = m.clientX - x0,
            my = m.clientY - y0;
          if (!mode) {
            if (Math.hypot(mx, my) > 8) clearTimeout(hold);
            if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my)) {
              mode = "drag";
              f.setPointerCapture(m.pointerId);
              r.classList.add("drag");
              swHeld = true;
            } else if (Math.abs(my) > 10) mode = "scroll";
          }
          if (mode !== "drag") return;
          dx = mx;
          f.style.transform = `translateX(${dx}px)`;
          r.dataset.dir = dx > 0 ? "pro" : "dis";
          r.style.setProperty("--p", String(Math.min(1, Math.abs(dx) / (r.offsetWidth * 0.35))));
        };
        f.onpointerup = () => end(false);
        f.onpointercancel = () => end(true);
      };
    });
  if ($("ice-sw"))
    $("ice-sw").onclick = () => {
      iceSwipe = { n: 0, pro: 0, dis: 0, t0: Date.now(), last: null, skip: new Map(), busy: false, pop: false };
      openSources().then(() => $("sw-card")?.focus());
    };
  if ($("sw-x")) $("sw-x").onclick = swExit;
  if ($("sw-back")) $("sw-back").onclick = swExit;
  if ($("sw-d")) $("sw-d").onclick = () => swGo("dismiss");
  if ($("sw-p")) $("sw-p").onclick = () => swGo("promote");
  if ($("sw-s")) $("sw-s").onclick = () => swGo("skip");
  if ($("sw-u")) $("sw-u").onclick = swUndo;
  // A held or flying card is fixed to the window where it sits, so the panel's scroll box
  // and the page's own overflow cannot crop it on the way out.
  const lift = (c) => {
    if (c.classList.contains("lift")) return;
    const r = c.getBoundingClientRect();
    Object.assign(c.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    c.classList.add("lift");
  };
  const drop = (c) => {
    c.classList.remove("lift");
    for (const k of ["left", "top", "width", "height", "transform"]) c.style.removeProperty(k);
    c.style.removeProperty("--p");
  };
  // Drag: the card follows the pointer and tilts; past 100 px it decides, short of that it
  // springs back. --p (-1..1) fades the stamp in. Controls inside the card still click.
  const card = $("sw-card");
  if (card)
    card.onpointerdown = (e) => {
      if (e.button || e.target.closest("a,button,summary,details")) return;
      const x0 = e.clientX;
      let dx = 0;
      card.setPointerCapture(e.pointerId);
      card.classList.add("drag");
      lift(card);
      swHeld = true;
      card.onpointermove = (m) => {
        dx = m.clientX - x0;
        // Tilt by share of the card's width: a wide desktop card leans as much as a phone one.
        card.style.transform = `translateX(${dx}px) rotate(${(dx / card.offsetWidth) * 18}deg)`;
        card.style.setProperty("--p", String(Math.max(-1, Math.min(1, dx / 100))));
      };
      card.onpointerup = card.onpointercancel = () => {
        card.onpointermove = card.onpointerup = card.onpointercancel = null;
        card.classList.remove("drag");
        swHeld = false;
        const late = swLate;
        swLate = false;
        if (Math.abs(dx) > 100) swGo(dx > 0 ? "promote" : "dismiss");
        else {
          const from = card.style.transform;
          card.style.removeProperty("--p");
          const a = motion() && from ? card.animate([{ transform: from }, { transform: "none" }], { duration: 260, easing: "cubic-bezier(.3,1.4,.5,1)" }) : null;
          card.style.transform = "";
          (a ? a.finished.catch(() => {}) : Promise.resolve()).then(() => {
            drop(card);
            if (late) openSources();
          });
        }
      };
    };
  // Keys, read by the page's keydown while the icebox shows. True when the key was used.
  iceNav = (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return false;
    const k = e.key;
    if (iceSwipe) {
      if (k === "Escape" && $("src-sec")?.classList.contains("open")) {
        srcShut();
        return true;
      }
      const f = { ArrowLeft: () => swGo("dismiss"), ArrowRight: () => swGo("promote"), ArrowDown: () => swGo("skip"), z: swUndo, Escape: swExit }[k];
      if (!f) return false;
      e.preventDefault();
      f();
      return true;
    }
    const
      at = order.findIndex((i) => iceKey(ice[i]) === iceCur),
      i = order[at];
    if (k === "Escape") {
      if ($("src-sec")?.classList.contains("open")) {
        srcShut();
        return true;
      }
      if (iceMenu) {
        iceMenu = "";
        openSources().then(focusCur);
        return true;
      }
      if (iceForm) {
        if (icePro) icePro = null;
        else iceForm = null;
        openSources();
        return true;
      }
      if (iceSel.size) {
        iceSel.clear();
        openSources();
        return true;
      }
      return false;
    }
    if (at < 0) return false;
    if (k === "j" || k === "k") {
      e.preventDefault();
      const n = order[Math.max(0, Math.min(order.length - 1, at + (k === "j" ? 1 : -1)))];
      iceCur = iceKey(ice[n]);
      $("pbody")
        .querySelectorAll(".ice-row,.ice-card")
        .forEach((r) => r.classList.toggle("cur", +r.dataset.i === n));
      $("pbody").querySelector(`:is(.ice-row,.ice-card)[data-i="${n}"]`)?.scrollIntoView({ block: "nearest" });
      return true;
    }
    // h: snooze for a week, the selection when there is one.
    if (k === "h") {
      const its = iceSel.size ? ice.filter((it) => iceSel.has(iceKey(it)) && live(it)) : live(ice[i]) ? [ice[i]] : [];
      if (!its.length) return false;
      e.preventDefault();
      snoozeAll(its, "1w");
      return true;
    }
    const b =
      k === "o"
        ? $("ice-o-" + i)
        : k === "x"
          ? $("ice-ck-" + i)
          : k === "p"
            ? iceSel.size
              ? $("ice-bp")
              : $("ice-pr-" + i)
            : k === "d"
              ? iceSel.size
                ? $("ice-bd")
                : $("ice-ds-" + i)
              : null;
    if (!b || b.disabled) return false;
    e.preventDefault();
    b.click();
    return true;
  };
  $("pbody")
    .querySelectorAll("[data-chk]")
    .forEach((b) => {
      const s = list[+b.dataset.chk];
      b.onclick = () => {
        b.disabled = true;
        b.innerHTML = ico("refresh") + " Checking…";
        act({ op: "gather", dir: s.dir, url: s.url }, (j) => {
          const r = j.results && j.results[0];
          toast(
            r
              ? r.ok
                ? `${s.label || host(s.url)}: ${r.note}${r.added ? " in the icebox" : ""}`
                : `Failed: ${r.note}`
              : "Checked",
          );
        });
      };
    });
  // A social source is read by the agent, so Gather opens one on /kaizen gather.
  $("pbody")
    .querySelectorAll("[data-ag]")
    .forEach((b) => {
      const s = list[+b.dataset.ag];
      b.onclick = () => {
        b.disabled = true;
        if (chatOn) b.innerHTML = ico("refresh") + " Gathering…";
        act({ op: "agent", dir: s.dir, url: s.url }, (j) => {
          const r = j.results && j.results[0];
          toast(
            j.via === "chatgpt"
              ? r && r.ok
                ? `${s.label || host(s.url)}: ${r.note}${r.added ? " in the icebox" : ""}`
                : `Failed: ${r ? r.note : "no answer"}`
              : "/kaizen gather opened in your terminal: " + via(j.agent),
          );
        });
      };
    });
  $("pbody")
    .querySelectorAll("[data-rm]")
    .forEach((b) => {
      const s = list[+b.dataset.rm];
      b.onclick = () => {
        if (
          !confirm(
            `Remove ${s.label || host(s.url)}? What it gathered stays; added again later, it may bring back ones you deleted or dismissed.`,
          )
        )
          return;
        act({ op: "remove", dir: list[+b.dataset.rm].dir, url: list[+b.dataset.rm].url }, () =>
          toast("Source removed"),
        );
      };
    });
  // A row that went takes focus to the cursor row's title, never to whatever now holds its index.
  const ci = ice.findIndex((it) => iceKey(it) === iceCur);
  if (fPick) {
    const at = ice.findIndex((it) => iceKey(it) === fPick[0]);
    (at >= 0 ? $(fPick[1] + "-" + at) : ci >= 0 ? $("ice-o-" + ci) : null)?.focus();
  }
  const was = !fPick && typed[2] && $(typed[2]);
  if (was) (was.disabled ? $(was.id.replace("src-mb-", "src-mv-").replace("src-cs-", "src-ct-")) : was)?.focus();
  if ($("src-add")) {
    // A social source is a platform and what to follow; the server builds its link, and
    // nothing is gathered here: the agent reads it.
    $("src-add").onclick = () => {
      const social = srcKind === "social",
        url = $("src-url").value.trim(),
        q = $("src-q").value.trim(),
        plat = $("src-plat").value;
      if (social ? !q : !url) {
        $(social ? "src-q" : "src-url").focus();
        return;
      }
      const to = $("src-dir").value;
      if (!to) {
        $("src-dir").focus();
        return;
      }
      $("src-add").disabled = true;
      $("src-add").textContent = "Adding…";
      (async () => {
        const label = $("src-label").value.trim() || (social ? `${PLAT[plat]}: ${q}` : ""),
          category = $("src-cat").value.trim();
        const j = await post(
          "/sources",
          social
            ? { op: "add", dir: to, platform: plat, query: q, label, category }
            : { op: "add", dir: to, url, label, category },
        );
        if (j.ok && social) {
          $("src-q").value = $("src-label").value = $("src-cat").value = "";
          toast("Source added");
          load();
        } else if (j.ok) {
          $("src-url").value = $("src-label").value = $("src-cat").value = "";
          const g = await post("/sources", { op: "gather", dir: to, url }),
            r = g.results && g.results[0];
          toast(r ? (r.ok ? `Source added: ${r.note} in the icebox` : `Source added, but: ${r.note}`) : "Source added");
          load();
        } else toast(j.error || "Could not add source");
        if (j.ok) srcAdd = false;
        if (srcOpen()) openSources();
      })();
    };
    $("src-url").onkeydown =
      $("src-q").onkeydown =
      $("src-label").onkeydown =
      $("src-cat").onkeydown =
        (e) => {
          if (e.key === "Enter") $("src-add").click();
        };
  }
  if ($("src-go"))
    $("src-go").onclick = () => {
      $("src-go").disabled = true;
      $("src-go").innerHTML = ico("refresh") + " Gathering…";
      act({ op: "gather", dir: dir || undefined }, (j) => {
        const rs = j.results || [],
          soc = (r) => list.some((s) => s.url === r.url && s.social),
          n = rs.reduce((a, r) => a + r.added, 0),
          bad = rs.filter((r) => !r.ok && !soc(r)).length,
          ag = rs.filter(soc).length;
        toast(
          (n ? `${n} new in the icebox` : "Nothing new") +
            (bad ? `, ${bad} source${bad === 1 ? "" : "s"} could not be read` : "") +
            (ag ? `; ${ag} social for /kaizen gather` : ""),
        );
      });
    };
}
