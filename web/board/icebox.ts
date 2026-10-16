import { store } from "./store.ts";
import { termStop } from "./agent-term.ts";
import { load, post } from "./api.ts";
import { via } from "./cards.ts";
import { stopDictation } from "./dictation.ts";
import { $, esc, ico } from "./dom.ts";
import { setShown, showable } from "./projects.ts";
import { toast } from "./toast.ts";
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
const rStyle = (dir) => {
  if (!iceStyle[dir])
    try {
      iceStyle[dir] = localStorage.getItem("kz-reply-style:" + dir);
    } catch (e) {}
  return iceStyle[dir] || "casual";
};
const STYLES = { casual: "Casual", fun: "Fun", helpful: "Helpful", promo: "Promo" };
export let iceForm = null,
  iceCur = null,
  iceSrc = "",
  iceCat = "",
  srcKind = "link",
  srcShow = null,
  srcAdd = false,
  iceBusy = false,
  iceNav = null;
const iceSel = new Set();
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
export async function openSources() {
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
  if (!srcOpen()) $("pbody").innerHTML = `<p class="snone">Loading…</p>`;
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
    if (PLAT[soc]) return `<span class="fav">${ico("b-" + soc)}</span>`;
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
    return `<span class="fav">${src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}${ico(fb)}</span>`;
  };
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
    (on && !store.S.projects.some((p) => p.dir === on)
      ? `<option value="${esc(on)}" selected>${esc(name || on)}</option>`
      : "") +
    store.S.projects
      .map((p) => `<option value="${esc(p.dir)}"${p.dir === on ? " selected" : ""}>${esc(p.label)}</option>`)
      .join("");
  const cards = list
    .map((s, i) => {
      const st = srcType(s),
        title = s.label || host(s.url);
      // A social source is never read by kaizen, so its not-ok is the agent's turn, not a failure.
      const statusHtml =
        s.social && (!s.last || (!s.last.ok && /gathered by your agent/i.test(s.last.note)))
          ? `<span class="src-badge dim">${ico("at")}${chatOn ? "Gathered with ChatGPT" : "Gathered by your agent"}</span>`
          : !s.last
            ? `<span class="src-badge dim">Not gathered yet</span>`
            : s.last.ok
              ? `<span class="src-badge ok"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-6" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${esc(s.last.note)}</span><span class="hint" style="margin:0">${ago(s.last.at)}</span>`
              : `<span class="src-badge warn"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" stroke="currentColor" fill="none" stroke-width="1.8"/><path d="M8 5v3.5M8 11v.1" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/></svg>Failed: ${esc(s.last.note)}</span><span class="hint" style="margin:0">${ago(s.last.at)}</span>`;
      return `<div class="src-card" id="src-card-${i}"><div class="src-hd"><div class="src-info"><span class="src-ico" title="${st === "social" ? esc(PLAT[s.social] || "social") : st}">${fav(s.url, st === "sheet" ? "sheet" : st === "doc" ? "doc" : st === "social" ? "at" : "link", s.social)}</span><span class="src-title" title="${esc(title)}">${esc(title)}</span></div><div class="src-acts">${s.social ? `<button class="btn ghost sm" id="src-ag-${i}" data-ag="${i}" aria-label="Gather ${esc(title)} with your agent" title="${chatOn ? "Read this source with your ChatGPT plan" : "Open your agent to run /kaizen gather for this project"}">${ico("refresh")} Gather</button>` : `<button class="btn ghost sm" id="src-chk-${i}" data-chk="${i}" aria-label="Check ${esc(title)} now" title="Check this source now">${ico("refresh")} Check</button>`}<button class="btn ghost danger sm" id="src-rm-${i}" data-rm="${i}" aria-label="Remove ${esc(title)}" title="Remove source">${ico("trash")}</button></div></div><div class="src-url"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.url)}"><span>${esc(s.url)}</span>${ico("ext")}</a></div><div class="src-status">${statusHtml}</div><div class="src-dest"><span>Category</span><input class="sel" id="src-ct-${i}" data-ct="${i}" data-k="${esc(s.dir + " " + s.url)}" value="${esc(s.category || "")}" placeholder="e.g. Feedback" maxlength="40" aria-label="Category of ${esc(title)}"><button class="btn sm" id="src-cs-${i}" aria-label="Save the category of ${esc(title)}" disabled>Save</button></div><div class="src-dest"><span>Project</span><select class="sel" id="src-mv-${i}" data-mv="${i}" data-k="${esc(s.dir + " " + s.url)}" aria-label="Project of ${esc(title)}">${opts(s.dir, s.project)}</select><button class="btn sm" id="src-mb-${i}" aria-label="Move ${esc(title)} to the chosen project" disabled>Move</button></div></div>`;
    })
    .join("");
  const fails = ((d && d.failed) || [])
    .map((f) => `<p style="color:var(--dim)">The sources of ${esc(f)} could not be read.</p>`)
    .join("");
  const emptyState = `<div class="src-empty"><div class="src-empty-ico">${ico("link")}</div><h4>No request sources yet</h4><p>Connect shared links to gather requests into the icebox, where you choose which become ideas. Nothing runs automatically until you start it.</p><div class="src-empty-grid"><div class="src-empty-item"><strong>Google Sheets</strong>Public sheets with idea or task rows. Rows marked Done are skipped.</div><div class="src-empty-item"><strong>Google Docs</strong>Shared public docs with items or notes written line by line.</div><div class="src-empty-item"><strong>Public links</strong>TSV, CSV, or raw text links containing requests.</div><div class="src-empty-item"><strong>Social media</strong>A keyword, #hashtag or @account on X, TikTok, Instagram or Threads, read by your agent.</div></div></div>`;
  const social = srcKind === "social";
  const addOn = !list.length || srcAdd || [typed[0], typed[1], typed[4], typed[6]].some(Boolean);
  const addBox = `<div class="src-add" id="src-addbox"${addOn ? "" : " hidden"}><div class="hd"><h4>Add a source</h4><div class="src-kind" role="group" aria-label="Kind of source"><button id="src-k-link" data-kind="link" aria-pressed="${!social}">Link</button><button id="src-k-social" data-kind="social" aria-pressed="${social}">Social</button></div></div><label for="src-url"${social ? " hidden" : ""}><span>Link</span><input class="sel" id="src-url" placeholder="https://docs.google.com/spreadsheets/d/… or any public link" spellcheck="false" autocomplete="off"></label><div class="two plat"${social ? "" : " hidden"}><label for="src-plat"><span>Platform</span><select class="sel" id="src-plat">${Object.entries(
    PLAT,
  )
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join(
      "",
    )}</select></label><label for="src-q"><span>Follow</span><input class="sel" id="src-q" placeholder="keyword, #hashtag or @account" maxlength="100" spellcheck="false" autocomplete="off"></label></div><div class="two"><label for="src-label"><span>Label <i>optional</i></span><input class="sel" id="src-label" placeholder="${social ? "e.g. Mentions on X" : "e.g. Feedback Q4"}"></label><label for="src-cat"><span>Category <i>optional</i></span><input class="sel" id="src-cat" placeholder="${social ? "e.g. Social" : "e.g. Bugs"}" maxlength="40"></label></div><label for="src-dir"><span>Project</span><select class="sel" id="src-dir">${dir ? "" : `<option value="">Choose project…</option>`}${opts(dir)}</select></label><div class="acts"><span class="hint">${social ? (chatOn ? "Your ChatGPT plan reads public posts when you press Gather on the source." : "Kaizen signs in nowhere. Your agent reads public posts when you press Gather on the source.") : "Public links only. For private docs, run /kaizen gather."}</span><button class="btn pri" id="src-add">Add source</button></div></div>`;
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
  const catOf = (it) => (it.status === "dismissed" ? "Dismissed" : it.category || "Uncategorised"),
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
  const groups = new Map();
  ice.forEach((it, i) => {
    if (!inProj(it) || (iceCat ? catOf(it) !== iceCat : it.status === "dismissed") || (iceSrc && srcKey(it) !== iceSrc)) return;
    const k = catOf(it);
    groups.has(k) || groups.set(k, []);
    groups.get(k).push(i);
  });
  // Rows in the order they are drawn, which is the order j and k walk.
  const order = [...groups.values()].flat();
  // A checked request a filter hides is unchecked: a bulk action only ever acts on what shows.
  {
    const vis = new Set(order.map((i) => iceKey(ice[i])));
    [...iceSel].forEach((k) => vis.has(k) || iceSel.delete(k));
  }
  if (!order.some((i) => iceKey(ice[i]) === iceCur)) iceCur = order.length ? iceKey(ice[order[0]]) : null;
  const nSel = order.filter((i) => iceSel.has(iceKey(ice[i]))).length;
  // Filters are plain dropdowns, each shown only when it has a choice to make. Projects are
  // narrowed by the board's own Showing picker above, not here.
  const many = byProj.size > 1,
    opt = (v, on, t) => `<option value="${esc(v)}"${on ? " selected" : ""}>${esc(t)}</option>`;
  const pick = (id, label, xs) =>
    `<select class="sel ice-sel" id="${id}" aria-label="${label}">${xs.join("")}</select>`;
  const chips =
    (byCat.size > 1
      ? pick("ice-fc", "Category", [
          opt("", !iceCat, "All categories"),
          ...[...byCat.keys()].map((k) => opt(k, iceCat === k, k)),
        ])
      : "") +
    (bySrc.size > 1
      ? pick("ice-fs", "Source", [
          opt("", !iceSrc, "All sources"),
          ...[...bySrc].map(([k, { it }]) => opt(k, iceSrc === k, srcName(it))),
        ])
      : "");
  const bar = `<div class="ice-bar">${order.length ? `<input type="checkbox" id="ice-all" aria-label="Select every request shown"${nSel && nSel === order.length ? " checked" : ""}>` : ""}<span class="count">${iceCat === "Dismissed" ? `${order.length} dismissed` : `${order.length < waiting ? `${order.length} of ${waiting}` : waiting} waiting`}</span>${chips}<span class="end"></span><button class="btn sm" id="src-go"${list.length ? "" : " disabled"}>${ico("refresh")} Gather all</button><button class="btn ghost sm" id="src-tog" aria-expanded="${srcShow ?? !list.length}" aria-controls="src-sec">${ico("link")} Sources · ${list.length}</button></div>`;
  const bulk = iceSel.size
    ? `<div class="ice-bulk" role="toolbar" aria-label="Selected requests"><span>${iceSel.size} selected</span><span class="end"></span><button class="btn sm" id="ice-bp" title="Each becomes its own idea, titled as gathered (p)">${ico("plus")} Promote</button><button class="btn ghost sm" id="ice-bd" title="Dismiss (d)">${ico("x")} Dismiss</button><button class="btn ghost sm" id="ice-bc" title="Clear selection (Esc)">Clear</button></div>`
    : "";
  // The open item's form: a clean title for the idea's card and the person's own details;
  // what was gathered is added to the idea's notes by the server.
  const form = (it) =>
    `<div class="ice-form"><label for="ice-title" class="hint" style="margin:0">Idea title</label><input class="sel" id="ice-title" data-k="${esc(iceKey(it))}" maxlength="200" value="${esc(it.text)}" aria-label="Idea title"><label for="ice-details" class="hint" style="margin:0">Details</label><textarea class="sel" id="ice-details" rows="3" placeholder="What, for whom, why" aria-label="Details"></textarea><div class="ice-form-acts"><span class="hint">Source goes into the notes.</span><button class="btn ghost sm" id="ice-cancel">Cancel</button><button class="btn pri sm" id="ice-ok">Promote</button></div></div>`;
  // A gathered post can be answered: Reply drafts, the box is the approval, Send reply posts that text.
  const replyBox = (it) => {
    if (!it.post) return "";
    if (it.replied) return `<span class="hint" style="margin:0">You replied to this post ${ago(it.replied)}.</span>`;
    const r = iceReply && iceReply.k === iceKey(it) ? iceReply : null;
    const style = (d) =>
      `<select class="sel" id="ice-rst" aria-label="Reply style" title="Promo names kaizen; Helpful may mention it when it fits; Casual and Fun never do"${d ? " disabled" : ""}>${Object.entries(
        STYLES,
      )
        .map(([v, l]) => `<option value="${v}"${v === rStyle(it.dir) ? " selected" : ""}>${l}</option>`)
        .join("")}</select>`;
    if (!r)
      return `<div class="ice-form-acts"><span class="hint">You review it before it posts.</span>${G.connected ? style(false) : ""}<button class="btn sm" id="ice-rp">Reply</button></div>`;
    if (r.wait) return `<div class="ice-form-acts"><span class="hint">Drafting…</span></div>`;
    return `<div class="ice-form"><label for="ice-reply" class="hint" style="margin:0">Your reply${r.note ? ` · ${esc(r.note)}` : ""}</label><textarea class="sel" id="ice-reply" rows="3" maxlength="2000" aria-label="Your reply"${r.busy || r.again ? " disabled" : ""}>${esc(r.text)}</textarea><span class="hint" id="ice-rn" style="margin:0">${r.again ? "Writing another…" : `${r.text.length} chars`}</span><div class="ice-form-acts"><span class="end"></span>${G.connected ? `${style(r.busy || r.again)}<button class="btn ghost sm" id="ice-rg"${r.busy || r.again ? " disabled" : ""}>Regenerate</button>` : ""}<button class="btn ghost sm" id="ice-rc"${r.busy ? " disabled" : ""}>Cancel</button><button class="btn pri sm" id="ice-rs"${r.busy || r.again || !r.text.trim() ? " disabled" : ""}>${r.busy ? "Sending…" : "Send reply"}</button></div></div>`;
  };
  const row = (i) => {
    const it = ice[i],
      k = iceKey(it),
      open = iceForm === k;
    return (
      `<div class="ice-row${iceCur === k ? " cur" : ""}${iceSel.has(k) ? " sel" : ""}" data-i="${i}" data-k="${esc(k)}"><input type="checkbox" id="ice-ck-${i}" data-ck="${i}"${iceSel.has(k) ? " checked" : ""} aria-label="Select: ${esc(it.text)}"><span class="ice-src" title="${esc(srcName(it))}">${fav(it.source, "link", list.find((x) => x.dir === it.dir && x.url === it.source)?.social)}</span><button class="ice-t" id="ice-o-${i}" data-o="${i}" aria-expanded="${open}" title="${esc(it.text)}">${esc(it.text)}</button><span class="ice-meta">${many ? `<span class="nm">${esc(it.project || "")}</span>` : ""}${it.replied ? `<span title="Replied ${esc(ago(it.replied))}">replied</span>` : ""}<span class="ice-age">${ago(it.at)}</span><span class="ice-ra"><button class="btn ghost sm" id="ice-pr-${i}" data-pr="${i}" title="Promote to Ideas as gathered (p)" aria-label="Promote to Ideas: ${esc(it.text)}">${ico("plus")}</button>${it.status === "dismissed" ? `<button class="btn ghost sm" id="ice-rs-${i}" data-rs="${i}" title="Restore to waiting" aria-label="Restore: ${esc(it.text)}">Restore</button>` : `<button class="btn ghost sm" id="ice-ds-${i}" data-ds="${i}" title="Dismiss (d)" aria-label="Dismiss: ${esc(it.text)}">${ico("x")}</button>`}</span></span></div>` +
      (open
        ? `<div class="ice-open">${it.notes ? `<div class="ice-notes">${esc(it.notes)}</div>` : ""}${(it.images || []).filter((u) => /^https:\/\//.test(u)).length ? `<details class="ice-imgs"><summary>Show images (${it.images.filter((u) => /^https:\/\//.test(u)).length}) — loads them from the source's site</summary>${it.images.filter((u) => /^https:\/\//.test(u)).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer"><img data-src="${esc(u)}" alt="" referrerpolicy="no-referrer"></a>`).join("")}</details>` : ""}<span class="hint" style="margin:0">From ${esc(srcName(it))} · ${ago(it.at)}${it.post ? ` · <a href="${esc(it.post)}" target="_blank" rel="noopener">open post</a>` : ""}</span>${replyBox(it)}${form(it)}</div>`
        : "")
    );
  };
  const inbox =
    waiting && !order.length
      ? `<div class="ice-zero"><h4>Nothing matches</h4><p>${waiting} waiting outside these filters.</p><p style="margin-top:10px"><button class="btn sm" id="ice-unf">Clear filters</button></p></div>`
      : order.length
        ? `<div class="ice-list">${[...groups].map(([g, ix]) => `<div class="ice-cat">${esc(g)}<i>${ix.length}</i></div>${ix.map(row).join("")}`).join("")}</div>`
        : `<div class="ice-zero"><h4>Inbox zero</h4><p>Nothing waiting. Gather all checks your sources for new requests; /kaizen discover in your agent sorts what comes in.</p></div>`;
  // The sources, in the right-hand drawer: shut until asked for, open by itself while there
  // are none until closed. Slid in only when opened; a rebuild while open shows it in place.
  const drawer = srcShow ?? !list.length,
    slide = drawer && !$("src-sec")?.classList.contains("open");
  const sec = `<div class="src-scrim${drawer && !slide ? " on" : ""}" id="src-scrim"></div><aside class="src-sec${drawer && !slide ? " open" : ""}" id="src-sec" aria-label="Sources"${drawer ? "" : " inert"}><header><div class="t"><b>Sources</b><div class="sub">${d && d.every && d.every !== "off" ? `Auto-check every ${esc(d.every)}` : "Auto-check off"} · <a id="src-to-settings" role="button" tabindex="0">Settings</a> · ${G.connected ? `ChatGPT${G.email ? " " + esc(G.email) : ""} <a id="cg-out" role="button" tabindex="0">Disconnect</a>` : `<a id="cg-in" role="button" tabindex="0">Connect ChatGPT</a>`}</div></div><div class="src-hda">${list.length ? `<button class="btn sm" id="src-new" aria-expanded="${addOn}" aria-controls="src-addbox">${ico("plus")} Add</button>` : ""}<button class="ib" id="src-x" aria-label="Close sources" title="Close">${ico("close")}</button></div></header><div class="body">${addBox}${list.length ? `<div class="src-list">${cards}</div>` : emptyState}</div></aside>`;
  // First visit: offer the ChatGPT plan for social sources, or keep the agent.
  const onb =
    G.use === "ask" && !G.connected
      ? `<div class="cg-onb"><b>Gather social posts with your ChatGPT plan</b><p>Connect ChatGPT Plus or Pro and Gather reads X, TikTok, Instagram and Threads sources right here, counted against your plan, with no agent to open. Skip it and Gather keeps using your agent. You can change this in Settings.</p><div class="acts"><button class="btn ghost" id="cg-skip">Skip for now</button><button class="btn pri" id="cg-go">Continue with ChatGPT</button></div></div>`
      : "";
  $("pbody").innerHTML =
    d && d.error
      ? `<p style="color:var(--dim)">${esc(d.error)}</p>`
      : !d
        ? `<p style="color:var(--dim)">The icebox could not be read.</p>`
        : onb + bar + bulk + fails + inbox + sec;
  if (!d || d.error) return;
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
  if ($("cg-skip"))
    $("cg-skip").onclick = async () => {
      if ((await post("/chatgpt", { op: "skip" })).ok) {
        toast("Gather keeps using your agent");
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
  $("src-tog").onclick = () => {
    if ($("src-sec").classList.contains("open")) return srcShut();
    srcShow = true;
    openSources().then(() => srcShow && $("src-url")?.focus());
  };
  if ($("ice-fs"))
    $("ice-fs").onchange = (e) => {
      iceSrc = e.target.value;
      openSources();
    };
  if ($("ice-fc"))
    $("ice-fc").onchange = (e) => {
      iceCat = e.target.value;
      openSources();
    };
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
          toast(`Source moved. Requests already gathered stay in ${s.project || "the old project"}.`),
        );
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
        if (op === "promote" && iceForm === iceKey(it)) iceForm = null;
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
    openSources().then(() => {
      const t = $("ice-title");
      if (t && iceForm === k) {
        t.focus();
        t.select();
      } else $("ice-o-" + i)?.focus();
    });
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
          b.disabled = true;
          iceAct("promote", ice[+b.dataset.pr], "Promoted to Ideas");
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
      iceForm = null;
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
  // Keys, read by the page's keydown while the icebox shows. True when the key was used.
  iceNav = (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return false;
    const k = e.key,
      at = order.findIndex((i) => iceKey(ice[i]) === iceCur),
      i = order[at];
    if (k === "Escape") {
      if ($("src-sec")?.classList.contains("open")) {
        srcShut();
        return true;
      }
      if (iceForm) {
        iceForm = null;
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
          toast("Source added. Click Gather on it to have your agent read its posts.");
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
