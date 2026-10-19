import { store } from "./store.ts";
import { where } from "./agent-term.ts";
import { load, post } from "./api.ts";
import { mic, stopDictation } from "./dictation.ts";
import { $, esc, ico } from "./dom.ts";
import { draft, undraft } from "./drafts.ts";
import { COLS, ICON, MARKS, NAMES, WORD, age, d, need } from "./labels.ts";
import { brief } from "./markdown.ts";
import { open, toggleArchive } from "./panel.ts";
import { ideaCombo, list, newDir, plogo, short, showList, showable } from "./projects.ts";
import { askNotify, toast } from "./toast.ts";
import { resumable, resume } from "./approvals.ts";

let filter = null;
let query = ""; // the header filter box, matched against a card's title and request
// A column shows this many cards, then a "more" line; Done is where it matters.
const FOLD = 6;
const unfolded = new Set();
// Per column: "old" puts the oldest first; anything else is newest first.
let order = (() => {
  try {
    return JSON.parse(localStorage.getItem("kz-order")) || {};
  } catch (e) {
    return {};
  }
})();
let archive = false; // showing the archive instead of the board
// Clear on Done: menu, then cherry-pick mode.
let picking = false;
const picked = new Set();

// Two ideas may carry the same text; load() numbers the repeats so a key names one card.
export const key = (c) =>
  c._k || (c.kind === "idea" ? "idea:" + c.state + ":" + c.text : "run:" + c.state + ":" + c.id);

// Cards filed by a run sit inside it while it is on the board and not done; once the
// parent is done, archived or gone, they are back in their own columns.
const kidsOf = (p) => (p.kind === "run" ? store.S.cards.filter((c) => c.parent === p.id && c.state === p.state) : []);
const nested = (c) =>
  !!c.parent &&
  store.S.cards.some((p) => p.kind === "run" && p.id === c.parent && p.state === c.state && !p.archived && p.column !== 4);
const kidsOpen = new Set();

// What opening a waiting run does, in words: the card's button and its menu say the same.
const actionOf = (c) =>
  c.status !== "waiting"
    ? "Open"
    : { "approvals.plan": "Review plan", findings: "See findings", "approvals.review": "Review work" }[c.awaiting] || "Open";

function card(c) {
  const k = key(c),
    el = document.createElement("div");
  el.className =
    "card" +
    (k === store.openKey ? " open" : "") +
    (k === store.menuKey ? " menu" : "") +
    (c.archived ? " archived" : "");
  el.tabIndex = 0;
  el.dataset.k = k;
  el.setAttribute("role", "button");
  const st = ICON[c.status] || "idea",
    idt = c.kind === "idea" ? "" : c.text.replace(/-/g, " ");
  // The status icon carries the state; what a waiting run needs is its tooltip.
  const sttl = c.status === "waiting" ? need(c.awaiting) || "needs you" : c.status || "idea";
  // Footer: words on the left (project, what it needs), icon-only marks on the right.
  const chips = [],
    marks = [],
    mk = (id, t, cls = "") =>
      `<span class="mk${cls}" role="img" title="${esc(t)}" aria-label="${esc(t)}"><svg><use href="#${id}"/></svg></span>`;
  if (store.all) {
    const n = c.where.split("/").filter(Boolean).pop() || c.where;
    chips.push(`<span class="chip proj" title="${esc(c.where)}">${esc(n)}</span>`);
  }
  for (const t of c.tags || []) {
    if (MARKS[t])
      marks.push(
        mk(
          "c-" + t,
          t === "full" ? "Full run: separate reviewer" : t === "lite" ? "Lite run: one session" : NAMES[t] || t,
          t === "full" || t === "lite" ? " accent" : "",
        ),
      );
    else if (t === "yolo")
      marks.push(`<span class="mk warn" title="Started in Yolo: the agent runs commands without asking">yolo</span>`);
    else chips.push(`<span class="chip">${esc(NAMES[t] || t)}</span>`);
  }
  if (c.pty && c.pty.alive)
    marks.push(mk("i-term", "The agent is running in this card: open it, terminal button at the top", " run"));
  // A gathered idea's notes open with the stamp promote() writes (ingest() wrote it before
  // the icebox); its chip names the source.
  const g = c.notes && /^\[[^\]]*\] (?:Gathered from|Promoted from the icebox:) (.+?)\. Outside text/.exec(c.notes);
  // A card filed by a run names that run; the parent itself shows nothing.
  if (c.parent)
    chips.push(`<span class="chip link" title="Filed by ${esc(c.parent)}">${esc(c.parent.replace(/^\d{4}-\d\d-\d\d-/, "").replace(/-/g, " "))}</span>`);
  if (c.branch) chips.push(`<span class="chip" title="Built on its own branch, ${esc(c.branch)}">branch</span>`);
  if (g) chips.push(`<span class="chip" title="From ${esc(g[1])}">gathered</span>`);
  else if (c.notes) chips.push(`<span class="chip">notes</span>`);
  // Information only: the panel's button is where it is committed and pushed.
  if (c.git)
    marks.push(
      mk(
        "c-git",
        c.git === "pushed" ? "Committed & pushed" : "Not committed & pushed yet",
        c.git === "pushed" ? " ok" : " warn",
      ),
    );
  if (c.open) marks.push(mk("i-bug", `${c.open} open finding${c.open === 1 ? "" : "s"} to fix`, " warn"));
  const pick = picking && !archive && c.column === 4;
  // Done cards are one line on the board; the panel still shows everything.
  if (c.column === 4 && !archive) el.classList.add("compact");
  // The one thing a card asks of you, on its face: what a waiting run needs, or resuming a stalled one.
  const act =
    c.kind === "run" && !archive && !pick
      ? c.status === "waiting"
        ? `<button class="btn sm pri act" data-a="open">${actionOf(c)}</button>`
        : c.status === "stalled" && resumable(c)
          ? `<button class="btn sm act" data-a="resume">Resume</button>`
          : ""
      : "";
  el.innerHTML =
    (pick ? `<input type="checkbox" class="pick" ${picked.has(k) ? "checked" : ""} aria-label="Select">` : "") +
    `<div class="c-id"><span class="st d-${st}" role="img" title="${esc(sttl)}" aria-label="${esc(sttl)}"><svg><use href="#s-${st}"/></svg></span><span class="idt">${esc(idt)}</span><span class="age">${c.kind === "run" ? age(c.moved || store.S.now, store.S.now) : ""}</span><button class="ib sm more" data-a="menu" title="Actions" aria-label="Actions" aria-haspopup="menu" aria-expanded="${k === store.menuKey}">${ico("more")}</button></div>
  <div class="c-title"${c.kind === "idea" && brief(c.text).parts.length ? ` title="${esc(c.text)}"` : ""}>${esc(c.kind === "idea" ? brief(c.text).head : c.title || c.id)}</div>
  ${act}
  ${chips.length || marks.length ? `<div class="c-foot"><span class="c-chips">${chips.join("")}</span><span class="c-marks">${marks.join("")}</span></div>` : ""}`;
  const kids = kidsOf(c);
  if (kids.length) {
    const on = kidsOpen.has(k),
      nDone = kids.filter((x) => x.status === "done").length,
      wait = kids.some((x) => x.status === "waiting");
    const box = document.createElement("div");
    box.className = "kids";
    box.innerHTML =
      `<button class="kids-t" aria-expanded="${on}">${on ? "▾" : "▸"} ${kids.length} ${kids.length === 1 ? "child" : "children"}${nDone ? ` · ${nDone} done` : ""}${wait ? `<span class="kids-w" title="A child is waiting on you"></span>` : ""}</button>` +
      (on
        ? `<ul>${kids
            .map((x, i) => {
              const s = ICON[x.status] || "idea";
              return `<li data-i="${i}" tabindex="0" role="button" title="Open"><span class="st d-${s}"><svg><use href="#s-${s}"/></svg></span><span class="kids-s">${esc(WORD[x.status] || x.status)}</span><span class="kids-n" title="${esc(x.title || x.text || x.id)}">${esc(x.kind === "idea" ? brief(x.text).head : (x.text || x.id || "").replace(/-/g, " "))}</span></li>`;
            })
            .join("")}</ul>`
        : "");
    box.querySelector(".kids-t").onclick = (e) => {
      e.stopPropagation();
      on ? kidsOpen.delete(k) : kidsOpen.add(k);
      render();
    };
    box.querySelectorAll("li").forEach((li) => {
      const go = (e) => {
        e.stopPropagation();
        open(kids[+li.dataset.i]);
      };
      li.onclick = go;
      li.onkeydown = (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go(e));
    });
    el.appendChild(box);
  }
  if (k === store.menuKey) {
    const items = [];
    if (archive) {
      items.push(["restore", "Restore", ico("restore")]);
      items.push(["open", "Open", ico("open")]);
      if (c.kind === "idea") items.push(null, ["delete", "Delete", ico("trash"), "danger"]);
    } else if (c.kind === "idea" && c.status === "idea") {
      items.push(
        ["run", "Run", ico("play")],
        ["edit", "Edit", ico("pen")],
        ...(store.S.projects.some((p) => p.dir !== c.state) ? [["move", "Move to project", ico("ext")]] : []),
        ["archive", "Archive", ico("archive")],
        null,
        ["reject", "Reject", ico("x")],
        ["delete", "Delete", ico("trash"), "danger"],
      );
    } else if (c.kind === "idea") {
      items.push(
        ["open", "Open", ico("open")],
        ["run", "Run again", ico("play")],
        ["archive", "Archive", ico("archive")],
        null,
        ["delete", "Remove", ico("trash"), "danger"],
      );
    } else {
      items.push(["open", actionOf(c), ico("open")]);
      items.push(["archive", "Archive", ico("archive")]);
      if (c.status === "waiting" || c.status === "running" || c.status === "stalled") {
        items.push(null, ["reject", "Abandon", ico("x"), "danger"]);
      }
    }
    el.innerHTML += `<div class="menu-pop" role="menu">${items.map((i) => (i ? `<button role="menuitem" data-a="${i[0]}" class="${i[3] || ""}">${i[2]}${i[1]}</button>` : "<hr>")).join("")}</div>`;
  }
  el.querySelectorAll("[data-a]").forEach(
    (bt) =>
      (bt.onclick = async (e) => {
        e.stopPropagation();
        const a = bt.dataset.a;
        const was = store.menuKey;
        store.menuKey = null;
        if (a === "menu") {
          store.menuKey = was === k ? null : k;
          render();
          return;
        }
        if (a === "open") {
          open(c);
          return;
        }
        if (a === "resume") {
          resume(c, bt);
          return;
        }
        if (a === "archive" || a === "restore") {
          toggleArchive(c, a === "archive");
          return;
        }
        store.mode = a;
        store.modeKey = k;
        render();
      }),
  );
  if (pick) {
    el.classList.toggle("picked", picked.has(k));
    el.onclick = () => {
      picked.has(k) ? picked.delete(k) : picked.add(k);
      render();
    };
    return el;
  }
  el.onclick = () => {
    if (store.menuKey) {
      store.menuKey = null;
      render();
      return;
    }
    open(c);
  };
  el.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(c);
    }
  };
  return el;
}

function inlineForm(c) {
  const li = document.createElement("li");
  li.className = "inl";
  const dir = c.state;
  if (store.mode === "edit") {
    li.innerHTML = `<input value="${esc(c.text)}"><textarea placeholder="Notes: links, paths, background">${esc(c.notes || "")}</textarea><div class="q dim" id="clong" hidden>The first line is over 72 characters; logs will cut it short.</div><div class="row"><button class="btn ghost" data-a="c">Cancel</button><button class="btn pri" data-a="s">Save</button></div>`;
    li.querySelector("[data-a=s]").onclick = async () => {
      const next = li.querySelector("input").value.trim(),
        notes = li.querySelector("textarea").value.trim();
      store.mode = null;
      if (next && (next !== c.text || notes !== (c.notes || "")))
        await post("/inbox", { op: "edit", dir, text: c.text, next, notes });
      load();
    };
  }
  if (store.mode === "reject") {
    const idea = c.kind === "idea";
    li.innerHTML = `<div class="q">${idea ? "Reject this idea?" : "Abandon this run?"} The reason is recorded.</div><input placeholder="Reason"><div class="row"><button class="btn ghost" data-a="c">Keep it</button><button class="btn warn" data-a="s">${idea ? "Reject" : "Abandon"}</button></div>`;
    li.querySelector("[data-a=s]").onclick = async () => {
      const why = li.querySelector("input").value.trim();
      if (!why) {
        toast("A reason is required");
        return;
      }
      store.mode = null;
      const r = idea
        ? await post("/inbox", { op: "reject", dir, text: c.text, reason: why })
        : await post("/abort", { dir, id: c.id, why });
      if (r.ok) toast(idea ? "Rejected" : "Abandoned, reason recorded");
      load();
    };
  }
  if (store.mode === "delete") {
    li.innerHTML = `<div class="q">Delete "${esc(c.text)}"?</div><div class="q dim">Not recorded anywhere.</div><div class="row"><button class="btn ghost" data-a="c">Keep it</button><button class="btn danger" data-a="s">Delete</button></div>`;
    li.querySelector("[data-a=s]").onclick = async () => {
      store.mode = null;
      const r = await post("/inbox", { op: "delete", dir, text: c.text });
      if (r.ok) toast("Deleted");
      load();
    };
  }
  if (store.mode === "move") {
    const ps = store.S.projects.filter((p) => p.dir !== dir);
    li.innerHTML = `<div class="q">Move "${esc(c.text)}" to</div><select class="sel" aria-label="Project">${ps.map((p) => `<option value="${esc(p.dir)}" title="${esc(p.label)}">${esc(short(p.label))}</option>`).join("")}</select><div class="row"><button class="btn ghost" data-a="c">Cancel</button><button class="btn pri" data-a="s">Move</button></div>`;
    li.querySelector("[data-a=s]").onclick = async () => {
      const sel = li.querySelector("select"),
        to = sel.value,
        name = sel.selectedOptions[0]?.textContent;
      store.mode = null;
      const r = await post("/inbox", { op: "move", dir, to, text: c.text });
      if (r.ok) toast(`Moved to ${name}`);
      load();
    };
  }
  if (store.mode === "run") {
    li.innerHTML = `<div class="q">Run "${esc(c.text)}"</div><div class="q dim">Opens your agent with this request in a terminal.</div><div class="q dim">Full plans, builds, and checks with a separate reviewer. Lite does it in one session.</div><div id="run-pick" style="display:grid;gap:6px"><div id="run-agent" class="agents" role="radiogroup" aria-label="Agent"></div></div><div class="run-actions"><label class="yolo" id="run-yolo" title="Yolo: the agent runs every command and edit without asking" hidden><button type="button" class="chk" role="switch" aria-checked="false"></button>Yolo</label><div class="row"><button class="btn ghost" data-a="c">Cancel</button><button class="btn" data-a="l">Lite</button><button class="btn pri" data-a="s">Full run</button></div></div>`;
    li.querySelector("[data-a=s]").onclick = () => startRun(c, "full");
    li.querySelector("[data-a=l]").onclick = () => startRun(c, "lite");
    runForm(li, c);
  }
  li.querySelector("[data-a=c]").onclick = () => {
    store.mode = null;
    render();
  };
  // Edit and reject take dictation; the run prompt has no field.
  li.querySelectorAll("input,textarea").forEach((f, i) => draft(f, "f:" + store.mode + ":" + store.modeKey + ":" + i));
  if (store.mode !== "run") {
    const m = mic([...li.querySelectorAll("input,textarea")]);
    if (m) li.querySelector(".row").prepend(m);
  }
  const inp = li.querySelector("input");
  if (inp) {
    inp.onkeydown = (e) => {
      if (e.key === "Enter") li.querySelector("[data-a=s]").click();
      if (e.key === "Escape") {
        store.mode = null;
        render();
      }
    };
    setTimeout(() => inp.focus());
  }
  return li;
}

// The agent and Basic/Yolo picked in the open Run form. Kept here, not in the form:
// the board is rebuilt on every server change, and the choice must outlive that.
// Yolo never outlives the form: render() drops it once the form is closed.
let runPick = null;
// The tool a launch opened, and why when it is not the one asked for.
export const via = (a) => a.name + (a.note ? ". " + a.note : "");
async function runForm(li, c) {
  const k = key(c),
    box = li.querySelector("#run-agent");
  const d = await fetch("/agents?dir=" + encodeURIComponent(c.state))
    .then((r) => r.json())
    .catch(() => null);
  if (!d || !d.agents || !d.agents.length) {
    li.querySelector("#run-pick").hidden = true;
    return;
  }
  // Antigravity and Gemini CLI are both Google's agent on Gemini; offer one of them.
  if (d.agents.some((a) => a.cmd === "agy")) d.agents = d.agents.filter((a) => a.cmd !== "gemini");
  if (!runPick || runPick.k !== k)
    runPick = { k, agent: d.agents.some((a) => a.cmd === d.default) ? d.default : d.agents[0].cmd };
  box.innerHTML = d.agents
    .map(
      (a) =>
        `<button type="button" class="agent" role="radio" aria-checked="${a.cmd === runPick.agent}" data-cmd="${esc(a.cmd)}"><svg><use href="#c-${esc(a.cmd)}"/></svg>${esc(a.name)}</button>`,
    )
    .join("");
  const yb = li.querySelector("#run-yolo");
  // Yolo only where the picked tool has a skip-permissions mode; Basic otherwise.
  const sw = yb.querySelector(".chk");
  const showYolo = () => {
    const can = !!d.agents.find((a) => a.cmd === runPick.agent)?.yolo,
      on = !!runPick.yolo;
    yb.hidden = !can;
    sw.classList.toggle("on", on);
    sw.setAttribute("aria-checked", on);
  };
  box.querySelectorAll(".agent").forEach(
    (b) =>
      (b.onclick = () => {
        runPick.agent = b.dataset.cmd;
        box.querySelectorAll(".agent").forEach((x) => x.setAttribute("aria-checked", x === b));
        showYolo();
      }),
  );
  sw.onclick = () => {
    runPick.yolo = !runPick.yolo;
    showYolo();
  };
  showYolo();
  box.onkeydown = sw.onkeydown = (e) => {
    if (e.key === "Escape") {
      store.mode = null;
      render();
    }
  };
}

async function startRun(c, kind) {
  store.mode = null;
  askNotify();
  const p = runPick && runPick.k === key(c) ? runPick : null;
  runPick = null;
  const yolo = !!(p && p.yolo && !$("run-yolo")?.hidden);
  const r = await post("/run", { dir: c.state, text: c.text, kind, agent: p ? p.agent : undefined, yolo });
  if (r.ok) {
    toast((kind === "full" ? "Full" : "Lite") + (yolo ? " yolo" : "") + " run " + where(r) + ": " + via(r.agent));
    if (r.pty) store.wantTerm = key(c);
  }
  load();
}

const HINT = { 1: "Ideas you run are planned here", 2: "Approved plans are built here", 3: "Finished builds are checked here" };

export function render() {
  // A closed form leaves no draft behind; an open one is reopened after a reload.
  // A form whose card is gone (restored after a reload, or deleted elsewhere) has nowhere to show.
  if (store.mode && store.mode !== "new" && !store.S.cards.some((c) => key(c) === store.modeKey)) store.mode = null;
  if (store.mode !== "run" && runPick) runPick.yolo = false;
  if (!store.mode) undraft("f:");
  try {
    sessionStorage.setItem(
      "kz-form",
      JSON.stringify(["new", "edit", "reject"].includes(store.mode) ? [store.mode, store.modeKey] : null),
    );
  } catch (e) {}
  // The board is rebuilt below; the card that had focus gets it back.
  const fk = focusedKey();
  // All projects: only the ones ticked in the filter, or every one when none is.
  const only = store.all && store.shown.size && showable().some((p) => store.shown.has(p.dir));
  const cs = store.S.cards.filter((c) => c.archived === archive && (!only || store.shown.has(c.state))),
    b = $("board");
  b.innerHTML = "";
  b.removeAttribute("aria-busy");
  const nArch = store.S.cards.filter((c) => c.archived).length;
  const n = (s) => cs.filter((c) => c.status === s).length;
  const strip = [];
  // One chip per status on the board: its mark, its count, and a click filters to it. Running always shows.
  for (const st of ["waiting", "running", "stalled", "starting", "idea", "done", "abandoned"]) {
    const k = n(st);
    if (!k && st !== "running") continue;
    const mark =
      st === "running"
        ? `<span class="d-run"><span class="pulse"></span></span>`
        : `<span class="st d-${ICON[st]}"><svg><use href="#s-${ICON[st]}"/></svg></span>`;
    strip.push(
      `<button class="${st === "waiting" ? "attn " : ""}${filter === st ? "on" : ""}" data-f="${st}" title="Show only ${WORD[st]}">${mark}${k} ${WORD[st]}${st === "idea" && k !== 1 ? "s" : ""}</button>`,
    );
  }
  strip.push(
    `<button class="${archive ? "on" : ""}" data-f="__archive" title="${cs.filter((c) => c.kind === "idea").length} ideas · ${cs.filter((c) => c.kind === "run").length} runs on the board">${archive ? "Back to board" : "Archive " + nArch}</button>`,
  );
  $("strip").innerHTML = strip.join("");
  // The phone's status button: amber dot while a run waits, accent while a filter or the archive is on.
  $("fbtn").hidden = false;
  $("fbtn").classList.toggle("on", !!filter || archive);
  $("fbtn").classList.toggle("wait", !filter && !archive && n("waiting") > 0);
  $("strip")
    .querySelectorAll("button")
    .forEach(
      (c) =>
        (c.onclick = () => {
          if (c.dataset.f === "__archive") {
            archive = !archive;
            filter = null;
            render();
            return;
          }
          filter = filter === c.dataset.f ? null : c.dataset.f;
          render();
        }),
    );
  // [label, folder, from the projects folder]: the button names the current one, the open list is redrawn.
  store.PL = [
    ["All projects", "all"],
    ...store.S.projects.map((p) => [p.label, p.dir]),
    ...store.S.fresh.map((p) => [p.label, p.dir, 1]),
    ["Find projects on this PC…", "__find"],
  ];
  const cur = store.all || !store.S.dir ? "All projects" : (store.PL.find((p) => p[1] === store.S.dir) || ["All projects"])[0];
  $("proj").innerHTML =
    store.all || !store.S.dir
      ? `<span class="plogo" aria-hidden="true">${ico("board")}</span><span>${esc(cur)}</span>`
      : `${plogo(store.S.dir, cur)}<span>${esc(short(cur))}</span>`;
  $("proj").title = cur;
  if (!$("projpop").hidden) list();
  $("showc").hidden = !store.all;
  const sp = showable(),
    ns = sp.filter((p) => store.shown.has(p.dir)).length;
  $("show").textContent = ns ? `Showing ${ns} of ${sp.length}` : "Showing all";
  if (!$("showpop").hidden) showList();
  if (!cs.length && store.mode !== "new") {
    b.innerHTML = archive
      ? '<div class="empty"><div class="mascot"></div><b>Nothing archived</b></div>'
      : '<div class="empty"><div class="mascot"></div><b>Nothing here yet</b><p>Add an idea and kaizen will plan it, build it, and check the result.</p><button class="btn pri" id="newempty">New idea</button></div>';
    if (!archive)
      $("newempty").onclick = () => {
        store.mode = "new";
        render();
      };
  }
  COLS.forEach((name, ci) => {
    const s = document.createElement("section");
    const q = query.trim().toLowerCase();
    const list = cs.filter(
      (c) =>
        c.column === ci &&
        (!filter || c.status === filter) &&
        (archive || !nested(c)) &&
        (!q || `${c.title || ""} ${c.text || ""} ${c.id || ""}`.toLowerCase().includes(q)),
    );
    // Runs age by their last move, ideas by inbox position (new ones are appended).
    if (ci < 4) {
      const at = (c) => (c.kind === "run" ? c.moved || 0 : store.S.cards.indexOf(c)),
        old = order[ci] === "old";
      // Runs waiting on you go first, then the column's own order.
      const w = (c) => (c.status === "waiting" ? 1 : 0);
      list.sort((a, b) => w(b) - w(a) || (old ? at(a) - at(b) : at(b) - at(a)));
    }
    const clearable = ci === 4 && !archive && list.length;
    const olderThan = (days) => list.filter((c) => store.S.now - (c.moved || store.S.now) > days * d);
    let head = `<h2>${name}<i>${list.length || ""}</i>${ci < 4 && list.length > 1 ? `<button class="btn sm ghost ord" title="Sort order">${order[ci] === "old" ? "Oldest" : "Newest"}</button>` : ""}${ci === 0 && !archive ? `<button class="ib sm" title="New idea" aria-label="New idea">${ico("plus")}</button>` : ""}`;
    if (clearable && picking)
      head += `<span class="pickbar"><button class="btn sm ghost" data-p="cancel">Cancel</button><button class="btn sm pri" data-p="go" ${picked.size ? "" : "disabled"}>Archive ${picked.size || ""}</button></span>`;
    else if (clearable) head += `<button class="btn sm ghost clear" title="Archive finished runs">Clear ▾</button>`;
    if (clearable && store.clearMenu)
      head += `<div class="menu-pop clear-pop"><button data-c="7">Older than a week <i>${olderThan(7).length}</i></button><button data-c="3">Older than 3 days <i>${olderThan(3).length}</i></button><button data-c="0">Everything <i>${list.length}</i></button><hr><button data-c="pick">Pick which…</button></div>`;
    s.innerHTML = head + `</h2>`;
    {
      const o = s.querySelector(".ord");
      if (o)
        o.onclick = (e) => {
          e.stopPropagation();
          order[ci] = order[ci] === "old" ? "new" : "old";
          try {
            localStorage.setItem("kz-order", JSON.stringify(order));
          } catch (e) {}
          render();
        };
    }
    if (ci === 0 && !archive)
      s.querySelector(".ib").onclick = () => {
        store.mode = "new";
        render();
      };
    if (clearable) {
      const cl = s.querySelector(".clear");
      if (cl)
        cl.onclick = (e) => {
          e.stopPropagation();
          store.clearMenu = !store.clearMenu;
          render();
        };
      s.querySelectorAll("[data-c]").forEach(
        (bt) =>
          (bt.onclick = async (e) => {
            e.stopPropagation();
            store.clearMenu = false;
            const v = bt.dataset.c;
            if (v === "pick") {
              picking = true;
              picked.clear();
              render();
              return;
            }
            const set = olderThan(+v);
            if (!set.length) {
              toast("Nothing that old");
              render();
              return;
            }
            for (const c of set) await post("/archive", { dir: c.state, id: c.id });
            toast("Archived " + set.length);
            load();
          }),
      );
      s.querySelectorAll("[data-p]").forEach(
        (bt) =>
          (bt.onclick = async (e) => {
            e.stopPropagation();
            if (bt.dataset.p === "cancel") {
              picking = false;
              picked.clear();
              render();
              return;
            }
            const set = list.filter((c) => picked.has(key(c)));
            picking = false;
            picked.clear();
            for (const c of set) await post("/archive", { dir: c.state, id: c.id });
            toast("Archived " + set.length);
            load();
          }),
      );
    }
    const ul = document.createElement("ul");
    if (ci === 0 && store.mode === "new") {
      const f = document.createElement("li");
      f.className = "inl";
      f.innerHTML = `${store.all ? `<div class="combo" id="ndc"><button class="sel" id="newdir" aria-label="Project for this idea" aria-haspopup="listbox" aria-expanded="false"></button><div class="menu-pop" hidden><input class="sel" aria-label="Search projects" placeholder="Search projects…" spellcheck="false" autocomplete="off"><div id="nds" role="listbox"></div></div></div>` : ""}<input id="newidea" placeholder="What would you like done?"><textarea id="newnotes" placeholder="Notes: links, paths, background (optional)"></textarea><div class="att" id="newatt"></div><input type="file" id="newfile" multiple hidden><div class="row"><button class="ib" id="newpick" aria-label="Attach files" title="Attach files">${ico("clip")}</button><button class="btn ghost" id="nc">Cancel</button><button class="btn pri" id="ns">Add</button></div>`;
      ul.appendChild(f);
      const inp = f.querySelector("#newidea"),
        files = [];
      draft(inp, "f:new:0");
      draft(f.querySelector("textarea"), "f:new:1");
      const save = async () => {
        const text = inp.value.trim();
        if (!text) return;
        const notes = f.querySelector("textarea").value.trim();
        store.mode = null;
        const dir = store.all ? newDir : null;
        const r = await post("/inbox", dir ? { op: "add", dir, text, notes } : { op: "add", text, notes });
        if (r.ok) {
          toast("Idea added");
          // The idea exists first: a failed upload leaves it as plain text.
          if (files.length) {
            const enc = await Promise.all(
              files.map(
                (x) =>
                  new Promise((res) => {
                    const rd = new FileReader();
                    rd.onload = () => res({ name: x.name, data: rd.result });
                    rd.readAsDataURL(x);
                  }),
              ),
            );
            const n = await post("/note", { dir, for: text, text: "", files: enc });
            if (!n.ok) toast("Idea added, files not attached");
          }
        }
        load();
      };
      const add = (x) => {
        files.push(x);
        f.querySelector("#newatt").textContent = files.map((y) => y.name).join(" · ");
      };
      f.querySelector("#newpick").onclick = () => f.querySelector("#newfile").click();
      f.querySelector("#newfile").onchange = (e) => {
        [...e.target.files].forEach(add);
        e.target.value = "";
      };
      for (const el of [inp, f.querySelector("textarea")])
        el.onpaste = (e) => {
          for (const it of e.clipboardData.items)
            if (it.kind === "file") {
              const x = it.getAsFile();
              add(new File([x], x.name === "image.png" ? `paste-${Date.now()}.png` : x.name, { type: x.type }));
              e.preventDefault();
            }
        };
      if (store.all) ideaCombo(f);
      f.querySelector("#ns").onclick = save;
      f.querySelector("#nc").onclick = () => {
        store.mode = null;
        render();
      };
      {
        const m = mic([inp, f.querySelector("textarea")]);
        if (m) f.querySelector(".row").prepend(m);
      }
      inp.onkeydown = (e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") {
          store.mode = null;
          render();
        }
      };
      setTimeout(() => inp.focus());
    }
    const shown = unfolded.has(ci) || list.length <= FOLD + 1 ? list : list.slice(0, FOLD);
    shown.forEach((c) => {
      if (store.modeKey === key(c) && store.mode && store.mode !== "new") {
        ul.appendChild(inlineForm(c));
        return;
      }
      const li = document.createElement("li");
      li.appendChild(card(c));
      ul.appendChild(li);
    });
    if (shown.length < list.length) {
      const li = document.createElement("li");
      li.innerHTML = `<button class="more-btn">Show ${list.length - shown.length} more</button>`;
      li.firstChild.onclick = () => {
        unfolded.add(ci);
        render();
      };
      ul.appendChild(li);
    } else if (unfolded.has(ci) && list.length > FOLD + 1) {
      const li = document.createElement("li");
      li.innerHTML = `<button class="more-btn">Show less</button>`;
      li.firstChild.onclick = () => {
        unfolded.delete(ci);
        render();
      };
      ul.appendChild(li);
    }
    // An empty middle column says what lands in it, so it does not look broken.
    if (!list.length && ci >= 1 && ci <= 3 && cs.length && !filter && !q && !archive)
      ul.innerHTML = `<li class="hint">${HINT[ci]}</li>`;
    s.appendChild(ul);
    b.appendChild(s);
  });
  // The tab says how many runs wait on you, so a background tab still tells you.
  const nw = store.S.cards.filter((c) => c.kind === "run" && c.status === "waiting" && !c.archived).length;
  document.title = nw ? `(${nw}) kaizen` : "kaizen";
  stopDictation(false); // forms were just rebuilt; a listener whose field is gone would write into nothing
  if (fk && document.activeElement === document.body) cardEl(fk)?.focus({ preventScroll: true });
}
// The header filter box lives outside #board, so a redraw keeps what is typed; draft() keeps it over a reload.
export function filterBox() {
  const el = $("bq");
  draft(el, "bq");
  query = el.value;
  el.addEventListener("input", () => {
    query = el.value;
    render();
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      el.value = "";
      el.dispatchEvent(new Event("input"));
      el.blur();
    }
  });
}
// Phones: the footer's status strip opens as a sheet under the filter button; a press outside closes it.
export function statusSheet() {
  const b = $("fbtn"),
    f = document.querySelector(".ftr");
  const set = (on) => {
    f.classList.toggle("on", on);
    b.setAttribute("aria-expanded", on);
    if (on) f.style.top = b.getBoundingClientRect().bottom + 6 + "px";
  };
  b.onclick = () => set(!f.classList.contains("on"));
  document.addEventListener("pointerdown", (e) => {
    if (f.classList.contains("on") && !f.contains(e.target) && !b.contains(e.target)) set(false);
  });
  document.addEventListener("keydown", (e) => e.key === "Escape" && f.classList.contains("on") && set(false));
}
export const focusedKey = () => document.activeElement?.closest?.("#board .card")?.dataset.k;
export const cardEl = (k) => k && $("board").querySelector('.card[data-k="' + CSS.escape(k) + '"]');
// Arrows and hjkl, as on the terminal board: up/down within a column, left/right to the
// nearest column with cards, at the same row or its last card.
export function nav(dx, dy) {
  const cols = [...$("board").querySelectorAll("section")]
    .map((s) => [...s.querySelectorAll(".card")])
    .filter((l) => l.length);
  if (!cols.length) return;
  const cur = document.activeElement.closest(".card");
  let ci = cols.findIndex((l) => l.includes(cur)),
    ri = 0;
  if (ci < 0) ci = 0;
  else {
    ri = cols[ci].indexOf(cur);
    if (dy) ri = Math.max(0, Math.min(cols[ci].length - 1, ri + dy));
    else {
      ci = Math.max(0, Math.min(cols.length - 1, ci + dx));
      ri = Math.min(ri, cols[ci].length - 1);
    }
  }
  const t = cols[ci][ri];
  t.focus({ preventScroll: true });
  t.scrollIntoView({ block: "nearest", inline: "nearest" });
}
