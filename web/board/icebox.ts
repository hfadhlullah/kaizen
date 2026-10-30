import { store } from "./store.ts";
import { termStop } from "./agent-term.ts";
import { load, post } from "./api.ts";
import { via } from "./cards.ts";
import { mic, stopDictation } from "./dictation.ts";
import { $, dataUrls, html, ico, modal, motion, pageOf, pager, pagerHtml, raw, SKEL, wirePager } from "./dom.ts";
import { ideaCombo, newDir, plogo, setShown, short, showable } from "./projects.ts";
import { playSound, soundPick, toast } from "./toast.ts";
import { go, view } from "./views.ts";

// ---- the icebox: requests gathered from request sources, read like an inbox, until
// someone promotes them to ideas or dismisses them. The sources themselves sit in a
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
  const gen = ++store.pageGen;
  stopDictation(true);
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
  const fRow = srcOpen() && document.activeElement?.closest?.(".ice-row"),
    fPick = fRow ? [fRow.dataset.k, document.activeElement.id.replace(/-\d+$/, "")] : null;
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
    // Dismissed items ride along, shown only under their own category.
    ice = [...((d && d.icebox) || []), ...((d && d.dismissed) || [])],
    waiting = ((d && d.icebox) || []).length,
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
      return html`<div class="src-card" id="src-card-${i}"><div class="src-hd"><span class="src-ico" title="${st === "social" ? (PLAT[s.social] || "social") : st}">${fav(s.url, kind, s.social)}</span><div class="src-info"><span class="src-title" title="${title}">${title}</span><a class="src-url" href="${s.url}" target="_blank" rel="noopener noreferrer" title="${s.url}"><span>${bare}</span>${ico("ext")}</a></div><div class="src-acts">${s.social ? html`<button class="ib sm" id="src-ag-${i}" data-ag="${i}" aria-label="Gather ${title} with your agent" title="${chatOn ? "Gather with your ChatGPT plan" : "Gather: opens your agent on /kaizen gather"}">${ico("refresh")}</button>` : html`<button class="ib sm" id="src-chk-${i}" data-chk="${i}" aria-label="Check ${title} now" title="Check now">${ico("refresh")}</button>`}<button class="ib sm danger" id="src-rm-${i}" data-rm="${i}" aria-label="Remove ${title}" title="Remove source">${ico("trash")}</button></div></div><div class="src-status">${statusHtml}</div><div class="src-fields"><label class="src-f" title="Category"><span>Category</span><input class="sel" id="src-ct-${i}" data-ct="${i}" data-k="${s.dir + " " + s.url}" value="${s.category || ""}" placeholder="${platOf(s)}" maxlength="40" aria-label="Category of ${title}"><button class="btn sm pri" id="src-cs-${i}" aria-label="Save the category of ${title}" disabled>Save</button></label><label class="src-f" title="Project"><span>Project</span>${plogo(s.dir, s.project || "")}<select class="sel" id="src-mv-${i}" data-mv="${i}" data-k="${s.dir + " " + s.url}" aria-label="Project of ${title}">${opts(s.dir, s.project)}</select><button class="btn sm pri" id="src-mb-${i}" aria-label="Move ${title} to the chosen project" disabled>Move</button></label></div><div class="src-sws">${st === "sheet" || /github\.com/.test(s.url) ? html`<label class="src-sw">Write back<button class="chk sm${s.writeback ? " on" : ""}" id="src-wb-${i}" data-wb="${i}" role="switch" aria-checked="${String(!!s.writeback)}" aria-label="Write back to ${title}"></button></label>` : ""}<label class="src-sw" title="Off: the scheduled gather skips this source; Check now still reads it">Auto gather<button class="chk sm${s.paused ? "" : " on"}" id="src-ag-on-${i}" data-ag-on="${i}" role="switch" aria-checked="${String(!s.paused)}" aria-label="Auto gather ${title}"></button></label></div></div>`;
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
  const byCat = count(pv, catOf);
  if (iceCat && !byCat.has(iceCat)) iceCat = "";
  const cv = pv.filter((it) => !iceCat || catOf(it) === iceCat);
  const bySrc = count(cv, srcKey);
  if (iceSrc && !bySrc.has(iceSrc)) iceSrc = "";
  const keys = new Set(ice.map(iceKey));
  if (iceForm && !keys.has(iceForm)) iceForm = null;
  if (icePro !== iceForm) icePro = null;
  const groups = new Map();
  ice.forEach((it, i) => {
    if (!inProj(it) || (iceCat ? catOf(it) !== iceCat : it.status === "dismissed" || it.status === "done") || (iceSrc && srcKey(it) !== iceSrc)) return;
    const k = catOf(it);
    groups.has(k) || groups.set(k, []);
    groups.get(k).push(i);
  });
  // Rows in the order they are drawn, which is the order j and k walk.
  const filtered = [...groups.values()].flat();
  // Only the page: j and k, select-all and bulk actions stay on what shows.
  const order = pageOf(icePg, filtered);
  const onPage = new Set(order);
  const isWaiting = (it) => !["promoted", "dismissed", "done"].includes(it.status);
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
  const bar = html`<div class="tk-bar ice-bar">${order.length ? html`<input type="checkbox" id="ice-all" aria-label="Select every request shown"${nSel && nSel === order.length ? " checked" : ""}>` : ""}<span class="count">${iceCat === "Dismissed" || iceCat === "Done" ? `${order.length} ${iceCat.toLowerCase()}` : `${order.length < waiting ? `${order.length} of ${waiting}` : waiting} waiting`}</span><span class="end"></span>${String(chips) ? html`<details class="ice-filt"><summary class="ib${iceCat || iceSrc ? " on" : ""}" aria-label="Filter requests" title="Filter requests">${ico("filter")}</summary><div class="ice-fpop">${chips}</div></details>` : ""}${order.some((i) => isWaiting(ice[i])) ? html`<button class="btn ghost sm" id="ice-sw" title="Sort one at a time: swipe right to promote, left to dismiss"><span aria-hidden="true">⇆</span> Swipe</button>` : ""}<button class="btn ghost sm" id="ice-new" title="Add a request by hand">${ico("plus")} Add</button><button class="btn sm" id="src-go"${list.length ? "" : " disabled"}>${ico("refresh")} Gather all</button><button class="btn ghost sm" id="src-tog" aria-expanded="${String(!!srcShow)}" aria-controls="src-sec">${ico("link")} Sources · ${list.length}</button></div>`;
  const bulk = iceSel.size
    ? html`<div class="ice-bulk" role="toolbar" aria-label="Selected requests"><span>${iceSel.size} selected</span><span class="end"></span><button class="btn sm" id="ice-bp" title="Promote (p)">${ico("plus")} Promote</button><button class="btn ghost sm" id="ice-bd" title="Dismiss (d)">${ico("x")} Dismiss</button><button class="btn ghost sm" id="ice-bc" title="Clear selection (Esc)">Clear</button></div>`
    : "";
  // The open item's form: a clean title for the idea's card and the person's own details;
  // what was gathered is added to the idea's notes by the server.
  const form = (it) =>
    html`<div class="ice-form"><label for="ice-title" class="hint" style="margin:0">Idea title</label><input class="sel" id="ice-title" data-k="${iceKey(it)}" maxlength="200" value="${it.text}" aria-label="Idea title"><label for="ice-details" class="hint" style="margin:0">Details</label><textarea class="sel" id="ice-details" rows="3" aria-label="Details"></textarea><div class="ice-form-acts"><span class="end"></span><button class="btn ghost sm" id="ice-cancel">Cancel</button><button class="btn pri sm" id="ice-ok">Promote</button></div></div>`;
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
  const imgs = (it) =>
    (it.images || []).filter((u) => /^https:\/\//.test(u)).length ? html`<details class="ice-imgs"><summary>Show images (${it.images.filter((u) => /^https:\/\//.test(u)).length}) — loads them from the source's site</summary>${it.images.filter((u) => /^https:\/\//.test(u)).map((u, n) => { const src = `/ice-image?dir=${encodeURIComponent(it.dir)}&id=${encodeURIComponent(it.id)}&i=${n}`; return html`<a href="${src}" target="_blank" rel="noopener noreferrer"><img data-src="${src}" alt="" referrerpolicy="no-referrer"></a>`; })}</details>` : "";
  const row = (i) => {
    const it = ice[i],
      k = iceKey(it),
      open = iceForm === k;
    const head = html`<div class="ice-row${iceCur === k ? " cur" : ""}${iceSel.has(k) ? " sel" : ""}" data-i="${i}" data-k="${k}"><input type="checkbox" id="ice-ck-${i}" data-ck="${i}"${iceSel.has(k) ? " checked" : ""} aria-label="Select: ${it.text}"><span class="ice-src" title="${srcName(it)}">${fav(it.source, "link", list.find((x) => x.dir === it.dir && x.url === it.source)?.social)}</span><button class="ice-t" id="ice-o-${i}" data-o="${i}" aria-expanded="${String(open)}" title="${it.text}">${it.text}</button><span class="ice-meta">${many ? html`<span class="nm" title="${it.project || ""}">${plogo(it.dir, it.project || "")}${short(it.project || "")}</span>` : ""}${it.status === "done" && it.written ? html`<span title="Written back ${ago(it.written)}">written back</span>` : ""}${it.status === "done" && it.writeError ? html`<span title="${it.writeError}">write-back failed</span>` : ""}${it.status === "promoted" ? html`<span title="Promoted to Ideas: ${it.idea || ""}">promoted</span>` : ""}${it.replied ? html`<span title="Replied ${ago(it.replied)}">replied</span>` : ""}<span class="ice-age">${ago(it.at)}</span><span class="ice-ra">${it.status === "promoted" || it.status === "done" ? "" : html`<button class="btn ghost sm" id="ice-pr-${i}" data-pr="${i}" title="Promote to Ideas (p)" aria-label="Promote to Ideas: ${it.text}">${ico("plus")}</button>`}${it.status === "promoted" || it.status === "done" ? "" : it.status === "dismissed" ? html`<button class="btn ghost sm" id="ice-rs-${i}" data-rs="${i}" title="Restore to waiting" aria-label="Restore: ${it.text}">Restore</button>` : html`<button class="btn ghost sm" id="ice-ds-${i}" data-ds="${i}" title="Dismiss (d)" aria-label="Dismiss: ${it.text}">${ico("x")}</button>`}</span></span></div>`;
    const more = open
      ? html`<div class="ice-open">${it.notes ? html`<div class="ice-notes">${it.notes}</div>` : ""}${imgs(it)}<span class="hint" style="margin:0">From ${srcName(it)} · ${ago(it.at)}${it.post ? html` · <a href="${it.post}" target="_blank" rel="noopener">open post</a>` : ""}</span>${replyBox(it)}${icePro === k ? form(it) : ""}</div>`
      : "";
    return html`${head}${more}`;
  };
  const inbox =
    waiting && !order.length
      ? html`<div class="ice-zero"><h4>No matches</h4><p style="margin-top:10px"><button class="btn sm" id="ice-unf">Clear filters</button></p></div>`
      : order.length
        ? html`<div class="tk-list ice-list">${[...groups].map(([g, ix]) => (ix.some((i) => onPage.has(i)) ? html`<div class="ice-cat">${g}<i>${ix.length}</i></div>${ix.filter((i) => onPage.has(i)).map(row)}` : ""))}${pagerHtml(icePg)}</div>`
        : html`<div class="ice-zero"><h4>Nothing waiting</h4><p>Requests gathered from your sources wait here until you turn them into ideas.</p>${list.length ? "" : html`<p style="margin-top:10px"><button class="btn sm pri" id="ice-addsrc">${ico("plus")} Add a source</button></p>`}</div>`;
  // Swipe: the waiting requests the filters show, least skipped first; a restored one
  // comes back on top. Nothing is written by a skip.
  const deck = iceSwipe
    ? filtered.filter((i) => isWaiting(ice[i])).sort((a, b) => (iceSwipe.skip.get(iceKey(ice[a])) || 0) - (iceSwipe.skip.get(iceKey(ice[b])) || 0))
    : [];
  // The card always names its project: a swipe decides for that project's Ideas.
  const pName = (it) => it.project || store.S.projects.find((p) => p.dir === it.dir)?.label || "";
  const swCard = (i, back) => {
    const it = ice[i];
    return html`<div class="sw-card${back ? " back" : ""}"${back ? raw(' aria-hidden="true"') : raw(' id="sw-card" tabindex="-1" aria-label="Request: swipe or press → to promote, ← to dismiss"')}><div class="sw-hd">${fav(it.source, "link", srcOf(it)?.social)}<span class="sw-src" title="${srcName(it)}">${srcName(it)}</span><span class="sw-proj" title="${pName(it)}">${plogo(it.dir, pName(it))}${short(pName(it))}</span><span class="ice-age">${ago(it.at)}</span></div><p class="sw-t">${it.text}</p>${back ? "" : html`${it.notes ? html`<div class="ice-notes">${it.notes}</div>` : ""}${imgs(it)}${it.post ? html`<a class="hint" href="${it.post}" target="_blank" rel="noopener">open post</a>` : ""}<span class="sw-stamp pro">Promote</span><span class="sw-stamp dis">Dismiss</span>`}</div>`;
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
  const sec = html`<div class="src-scrim${drawer && !slide ? " on" : ""}" id="src-scrim"></div><aside class="src-sec${drawer && !slide ? " open" : ""}" id="src-sec" aria-label="Sources"${drawer ? "" : " inert"}><header><div class="t"><b>Sources</b><div class="src-chips"><a id="src-to-settings" class="schip" role="button" tabindex="0" title="${d && d.every && d.every !== "off" ? `Checked every ${d.every}` : "Auto-check off"}: change in Settings">${ico("clock")}${d && d.every && d.every !== "off" ? (d.every) : "Off"}</a>${G.connected ? html`<span class="schip on" title="ChatGPT${G.email ? ": " + (G.email) : ""}">${ico("ai")}ChatGPT<a id="cg-out" role="button" tabindex="0" aria-label="Disconnect ChatGPT" title="Disconnect">${ico("x")}</a></span>` : html`<a id="cg-in" class="schip" role="button" tabindex="0" title="Connect ChatGPT">${ico("ai")}ChatGPT</a>`}${(d.google || {}).connected ? html`<span class="schip on" title="Google connected">${ico("google")}Google<a id="gg-out" role="button" tabindex="0" aria-label="Disconnect Google" title="Disconnect">${ico("x")}</a></span>` : html`<a id="gg-in" class="schip" role="button" tabindex="0" title="Connect Google">${ico("google")}Google</a>`}</div></div><div class="src-hda">${list.length ? html`<button class="btn sm" id="src-new" aria-expanded="${String(addOn)}" aria-controls="src-addbox">${ico("plus")} Add</button>` : ""}<button class="ib" id="src-x" aria-label="Close sources" title="Close">${ico("close")}</button></div></header><div class="body">${addBox}${list.length ? html`<div class="src-list">${cards}</div>` : emptyState}</div></aside>`;
  // First visit: offer the ChatGPT plan for social sources, or keep the agent.
  const onb =
    G.use === "ask" && !G.connected
      ? html`<div class="cg-onb"><div class="acts"><b>Gather social posts with ChatGPT?</b><span class="end"></span><button class="btn ghost" id="cg-skip">Skip</button><button class="btn pri" id="cg-go">Connect</button></div></div>`
      : "";
  // A rebuild replaces the drawer: keep where it was scrolled to.
  const at = $("src-sec")?.querySelector(".body")?.scrollTop ?? 0;
  $("pbody").innerHTML =
    d && d.error
      ? html`<p style="color:var(--dim)">${d.error}</p>`
      : !d
        ? html`<p style="color:var(--dim)">The icebox could not be read.</p>`
        : iceSwipe
          ? html`${swipe()}${sec}`
          : html`${onb}${bar}${bulk}${fails}${inbox}${sec}`;
  if (!d || d.error) return;
  const body = $("src-sec")?.querySelector(".body");
  if (body) body.scrollTop = at;
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
      iceCat = iceSrc = "";
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
      $("pbody").querySelector(".ice-row.cur .ice-t")?.focus();
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
  // Bulk: one dismiss per project; promote one request at a time, each its own idea
  // titled as gathered (one promote call with several ids would merge them into one).
  const bulkDo = async (op) => {
    const its = ice.filter((it) => iceSel.has(iceKey(it)));
    if (!its.length) return;
    stepPast(new Set(its.map(iceKey)));
    iceBusy = true;
    $("ice-bp").disabled = $("ice-bd").disabled = true;
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
        `${ok} ${op === "promote" ? "promoted to Ideas" : "dismissed"}${ok < its.length ? `, ${its.length - ok} not` : ""}`,
      );
    load();
    if (srcOpen()) openSources().then(focusCur);
  };
  if (bulk) {
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
  const toggle = (i) => {
    const k = iceKey(ice[i]);
    iceCur = k;
    iceForm = iceForm === k ? null : k;
    icePro = null;
    openSources().then(() => $("ice-o-" + i)?.focus());
  };
  $("pbody")
    .querySelectorAll(".ice-row")
    .forEach(
      (r) =>
        (r.onclick = (e) => {
          if (!e.target.closest("input,button")) toggle(+r.dataset.i);
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
          const k = iceKey(ice[+b.dataset.pr]);
          iceCur = iceForm = icePro = k;
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

  if ($("ice-ok")) {
    const ok = () => {
      const title = $("ice-title").value.trim();
      if (!title) {
        $("ice-title").focus();
        return;
      }
      $("ice-ok").disabled = true;
      iceAct("promote", open1, "Promoted to Ideas", { text: title, details: $("ice-details").value });
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
      // Only a dismiss can be undone here: a promote has already made an idea card.
      S.last = op === "dismiss" ? it : null;
      S.pop = true;
    } else toast(`Could not ${op}: ${j.error || "the board did not answer"}`);
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
        .querySelectorAll(".ice-row")
        .forEach((r) => r.classList.toggle("cur", +r.dataset.i === n));
      $("pbody").querySelector(`.ice-row[data-i="${n}"]`)?.scrollIntoView({ block: "nearest" });
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
  if ($("ice-new"))
    $("ice-new").onclick = () => {
      const all = !dir;
      if (!dir && !showable().length) return toast("Pick a project first");
      // The new-idea form, cut down: the request, files, dictation and, in All projects, the project.
      const dl = modal(
        `${all ? `<div class="combo" id="ndc"><button type="button" class="sel" id="newdir" aria-label="Project for this request" aria-haspopup="listbox" aria-expanded="false"></button><div class="menu-pop" hidden><input class="sel" aria-label="Search projects" placeholder="Search projects…" spellcheck="false" autocomplete="off"><div id="nds" role="listbox"></div></div></div>` : ""}<textarea id="newidea" placeholder="What did someone ask for?" aria-label="Request"></textarea><div class="att"></div><input type="file" multiple hidden><div class="row"><button type="button" class="ib" id="newpick" aria-label="Attach files" title="Attach files">${ico("clip")}</button><button type="button" class="btn ghost" value="">Cancel</button><button class="btn pri">Add</button></div>`,
      );
      const f = dl.querySelector("form"),
        inp = f.querySelector("textarea"),
        files = [];
      const add = (x) => {
        files.push(x);
        f.querySelector(".att").textContent = files.map((y) => y.name).join(" · ");
      };
      f.querySelector("#newpick").onclick = () => f.querySelector("input[type=file]").click();
      f.querySelector("input[type=file]").onchange = (e) => {
        [...e.target.files].forEach(add);
        e.target.value = "";
      };
      inp.onpaste = (e) => {
        for (const it of e.clipboardData.items)
          if (it.kind === "file") {
            const x = it.getAsFile();
            add(new File([x], x.name === "image.png" ? `paste-${Date.now()}.png` : x.name, { type: x.type }));
            e.preventDefault();
          }
      };
      f.querySelector(".btn.ghost").onclick = () => dl.close();
      if (all) ideaCombo(f);
      const m = mic([inp]);
      if (m) f.querySelector(".row").prepend(m);
      dl.addEventListener("close", () => stopDictation(false));
      inp.onkeydown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          f.requestSubmit();
        }
      };
      f.onsubmit = async (e) => {
        e.preventDefault();
        const text = inp.value.trim(),
          to = dir || newDir;
        if (!text) return inp.focus();
        if (!to) return toast("Pick a project first");
        const j = await post("/icebox", { op: "add", dir: to, text, files: await dataUrls(files) });
        if (j.ok) {
          toast("Added to the icebox");
          dl.close();
        }
      };
      inp.focus();
    };
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
