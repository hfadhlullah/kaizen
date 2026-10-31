import { store } from "./store.ts";
import { where } from "./agent-term.ts";
import { load, post } from "./api.ts";
import { mic, stopDictation } from "./dictation.ts";
import { $, dataUrls, html, ico, modal, raw } from "./dom.ts";
import { draft, undraft } from "./drafts.ts";
import { COLS, ICON, MARKS, NAMES, WORD, age, d, need } from "./labels.ts";
import { brief } from "./markdown.ts";
import { open, openAt, toggleArchive } from "./panel.ts";
import { isPhone } from "./phone.ts";
import { ideaCombo, list, newDir, plogo, setNewDir, short, showList, showable } from "./projects.ts";
import { askNotify, toast } from "./toast.ts";
import { answer, decided, resumable, resume } from "./approvals.ts";
import { termsBadge } from "./terms.ts";
import { boardBadge, waitingCount } from "./badge.ts";
import { openWorkspace } from "./run-view.ts";
import { boardMode, drawWsBoard, initWsBoard, syncMode } from "./ws-board-ui.ts";

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
// The Ideas column shows ideas or the runs' open backlog, never both; kept per browser.
let ideasTab = (() => {
  try {
    return localStorage.getItem("kz-ideas-tab") === "backlog" ? "backlog" : "ideas";
  } catch (e) {
    return "ideas";
  }
})();
// On the Backlog tab: one severity, or null for every one.
let sev = null;
const SEVS = [
  ["high", "High+", (s) => s === "critical" || s === "high"],
  ["medium", "Medium", (s) => s === "medium"],
  ["low", "Low", (s) => s === "low"],
  ["none", "No severity", (s) => !s],
];
// Open backlog items as cards for the Ideas column. A card's key names its line by
// source and number, which is what Start and Reject send back.
const backlogList = () =>
  (store.S.backlog || []).map((b) => ({
    ...b,
    kind: "backlog",
    status: b.starting ? "starting" : "idea",
    title: b.text,
    column: 0,
    archived: false,
    _k: "backlog:" + b.state + ":" + b.source + "#" + b.n,
  }));
// A backlog card opens its source run on the Backlog tab, the item marked.
const show = (c) => {
  if (c.kind !== "backlog") return open(c);
  const r = store.S.cards.find((x) => x.kind === "run" && x.id === c.source && x.state === c.state);
  if (!r) return toast(c.source === "orphan" ? "Kept from a run that was pruned" : "That run was not found");
  openAt(r, "backlog", c.n);
};
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
// One already answered from this page says so until the agent moves the run on.
const actionOf = (c) =>
  decided.has(answer(c))
    ? "Sent to agent"
    : c.status !== "waiting"
    ? "Open"
    : c.healed
    ? "Approve"
    : { "approvals.plan": "Review plan", findings: "See findings", "approvals.review": "Review work" }[c.awaiting] || "Open";

function card(c) {
  const k = key(c),
    el = document.createElement("div");
  el.className =
    "card" +
    (k === store.openKey ? " open" : "") +
    (k === store.menuKey ? " menu" : "") +
    (store.flash.has(k) ? " flash" : "") +
    (c.archived ? " archived" : "");
  el.tabIndex = 0;
  el.dataset.k = k;
  el.setAttribute("role", "button");
  const st = ICON[c.status] || "idea",
    idt = c.kind === "run" ? c.text.replace(/-/g, " ") : "";
  // The status icon carries the state; what a waiting run needs is its tooltip.
  const sttl = c.status === "waiting" ? need(c.awaiting) || "needs you" : c.status || "idea";
  // Footer: words on the left (project, what it needs), icon-only marks on the right.
  const chips = [],
    marks = [],
    mk = (id, t, cls = "") =>
      html`<span class="mk${cls}" role="img" title="${t}" aria-label="${t}"><svg><use href="#${id}"/></svg></span>`;
  if (store.all) {
    const n = c.where.split("/").filter(Boolean).pop() || c.where;
    chips.push(html`<span class="chip proj" title="${c.where}">${n}</span>`);
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
      marks.push(html`<span class="mk warn" title="Started in Yolo: the agent runs commands without asking">yolo</span>`);
    else chips.push(html`<span class="chip">${NAMES[t] || t}</span>`);
  }
  // Orchestration: only a run that has workers carries them, so any other card is unchanged.
  const wk: { id: string; status: string; bypass: boolean }[] = c.workers || [];
  if (wk.length) chips.push(html`<span class="chip" title="${wk.map((x) => `${x.id} ${x.status}${x.bypass ? " (bypass)" : ""}`).join(", ")}">${wk.length} workers</span>`);
  if (c.signal === "blocked") marks.push(mk("i-ask", `Waiting on you: ${c.blocked?.question ?? ""}`, " warn ask"));
  else if (c.signal === "stale") marks.push(html`<span class="mk warn" title="The agent has gone quiet: no report and no terminal activity">stale</span>`);
  else if (c.signal === "unverified") marks.push(html`<span class="mk warn" title="The agent ended without finishing this stage properly">unverified</span>`);
  if (c.pty && c.pty.alive && c.pty.asking)
    marks.push(mk("i-ask", "The agent is asking you something: open it, terminal button at the top", " warn ask"));
  else if (c.pty && c.pty.alive)
    marks.push(mk("i-term", "The agent is running in this run's workspace: open it", " run"));
  // A gathered idea's notes open with the stamp promote() writes (ingest() wrote it before
  // the icebox); its chip names the source.
  const g = c.notes && /^\[[^\]]*\] (?:Gathered from|Promoted from the icebox:) (.+?)\. Outside text/.exec(c.notes);
  // A card filed by a run names that run; the parent itself shows nothing.
  if (c.parent)
    chips.push(html`<span class="chip link" title="Filed by ${c.parent}">${c.parent.replace(/^\d{4}-\d\d-\d\d-/, "").replace(/-/g, " ")}</span>`);
  if (c.kind === "backlog") {
    if (c.severity)
      chips.push(html`<span class="chip${c.severity === "critical" || c.severity === "high" ? " warn" : ""}"><i></i>${c.severity}</span>`);
    chips.push(
      c.source === "orphan"
        ? html`<span class="chip" title="Kept from a pruned run">orphaned</span>`
        : html`<span class="chip link" title="Left by ${c.source}${c.at ? " · " + c.at : ""}">${c.source.replace(/^\d{4}-\d\d-\d\d-/, "").replace(/-/g, " ")}</span>`,
    );
  }
  if (c.branch) chips.push(html`<span class="chip" title="Built on its own branch, ${c.branch}">branch</span>`);
  if (g) chips.push(html`<span class="chip" title="From ${g[1]}">gathered</span>`);
  else if (c.notes) chips.push(html`<span class="chip">notes</span>`);
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
        ? html`<button class="btn sm${decided.has(answer(c)) ? "" : " pri"} act" data-a="open">${actionOf(c)}</button>`
        : c.status === "stalled" && resumable(c)
          ? html`<button class="btn sm act" data-a="resume">Resume</button>`
          : ""
      : "";
  el.innerHTML =
    (pick ? html`<input type="checkbox" class="pick" ${raw(picked.has(k) ? "checked" : "")} aria-label="Select">` : "") +
    html`<div class="c-id"><span class="st d-${st}" role="img" title="${sttl}" aria-label="${sttl}"><svg><use href="#s-${st}"/></svg></span><span class="idt"${c.kind === "run" && c.title ? html` title="${c.title}"` : ""}>${idt}</span><span class="age">${c.kind === "run" ? age(c.moved || store.S.now, store.S.now) : ""}</span><button class="ib sm more" data-a="menu" title="Actions" aria-label="Actions" aria-haspopup="menu" aria-expanded="${String(k === store.menuKey)}">${ico("more")}</button></div>
  ${c.signal === "blocked" ? html`<div class="c-block">${c.blocked?.question ?? ""}</div>` : c.phase && c.status === "running" ? html`<div class="c-phase">${c.phase}</div>` : ""}<div class="c-title"${c.kind === "idea" && brief(c.text).parts.length ? html` title="${c.text}"` : ""}>${c.kind === "idea" ? brief(c.text).head : c.title || c.id}</div>${wk.length ? html`<div class="c-phase">${wk.map((x) => `${x.id} ${x.status}${x.bypass ? " · bypass" : ""}`).join(" · ")}${c.workersMerge ? ` · merge ${c.workersMerge}` : ""}</div>` : ""}
  ${act}
  ${chips.length || marks.length ? html`<div class="c-foot"><span class="c-chips">${chips}</span><span class="c-marks">${marks}</span></div>` : ""}`;
  const kids = kidsOf(c);
  if (kids.length) {
    const on = kidsOpen.has(k),
      nDone = kids.filter((x) => x.status === "done").length,
      wait = kids.some((x) => x.status === "waiting");
    const box = document.createElement("div");
    box.className = "kids";
    box.innerHTML =
      html`<button class="kids-t" aria-expanded="${String(on)}">${on ? "▾" : "▸"} ${kids.length} ${kids.length === 1 ? "child" : "children"}${nDone ? ` · ${nDone} done` : ""}${wait ? html`<span class="kids-w" title="A child is waiting on you"></span>` : ""}</button>` +
      (on
        ? html`<ul>${kids
            .map((x, i) => {
              const s = ICON[x.status] || "idea";
              return html`<li data-i="${i}" tabindex="0" role="button" title="Open"><span class="st d-${s}"><svg><use href="#s-${s}"/></svg></span><span class="kids-s">${WORD[x.status] || x.status}</span><span class="kids-n" title="${x.title || x.text || x.id}">${x.kind === "idea" ? brief(x.text).head : (x.text || x.id || "").replace(/-/g, " ")}</span></li>`;
            })}</ul>`
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
    } else if (c.kind === "backlog") {
      items.push(
        ["run", c.status === "starting" ? "Run again" : "Run", ico("play")],
        ["open", "Open its run", ico("open")],
        null,
        ["reject", "Reject", ico("x"), "danger"],
      );
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
      if (c.column === 1 && c.status !== "abandoned") items.push(["toidea", "Back to idea", ico("restore")]);
    }
    el.innerHTML += html`<div class="menu-pop" role="menu">${items.map((i) => (i ? html`<button role="menuitem" data-a="${i[0]}" class="${i[3] || ""}">${i[2]}${i[1]}</button>` : raw("<hr>")))}</div>`;
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
          show(c);
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
        if (a === "toidea") {
          const r = await post("/to-idea", { dir: c.state, id: c.id });
          if (r.ok) toast("Back in Ideas");
          load();
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
    show(c);
  };
  el.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      show(c);
    }
  };
  return el;
}

// Edit, Abandon or Reject over the page it was asked from: a workspace never leaves for the Board.
export function formPopup(c, mode) {
  const dl = modal(""),
    f = dl.querySelector("form");
  f.onsubmit = (e) => e.preventDefault();
  dl.classList.toggle("sheet", isPhone());
  dl.addEventListener("close", () => stopDictation(false));
  const [m, k] = [store.mode, store.modeKey];
  store.mode = mode;
  store.modeKey = key(c);
  const li = inlineForm(c);
  [store.mode, store.modeKey] = [m, k]; // the form is built; the Board draws none of its own
  li.className = "";
  li.style.display = "block";
  li.querySelectorAll<HTMLButtonElement>("button:not([type])").forEach((b) => (b.type = "button"));
  f.append(li);
  li.querySelector<HTMLElement>("input,textarea")?.focus();
}

function inlineForm(c) {
  const li = document.createElement("li");
  const done = () => li.closest("dialog")?.close();
  li.className = "inl";
  const dir = c.state;
  if (store.mode === "edit") {
    if (editFiles.k !== key(c)) editFiles = { k: key(c), files: [] };
    const files = editFiles.files;
    li.innerHTML = html`<input value="${c.text}"><textarea placeholder="Anything the planner should know">${c.notes || ""}</textarea><div class="row"><div class="att" id="editatt"></div><button type="button" class="ib" id="editpick" aria-label="Attach files" title="Attach files">${ico("clip")}</button></div><input type="file" id="editfile" multiple hidden><div class="q dim" id="clong" hidden>The first line is over 72 characters; logs will cut it short.</div><div class="row"><button class="btn ghost" data-a="c">Cancel</button><button class="btn pri" data-a="s">Save</button></div>`;
    const shown = () => (li.querySelector("#editatt").textContent = files.map((f) => f.name).join(" · "));
    const add = (f) => { files.push(f); shown(); };
    shown();
    li.querySelector("#editpick").onclick = () => li.querySelector("#editfile").click();
    li.querySelector("#editfile").onchange = (e) => {
      [...e.target.files].forEach(add);
      e.target.value = "";
    };
    for (const el of [li.querySelector("input"), li.querySelector("textarea")])
      el.onpaste = (e) => {
        for (const it of e.clipboardData.items)
          if (it.kind === "file") {
            const f = it.getAsFile();
            add(new File([f], f.name === "image.png" ? `paste-${Date.now()}.png` : f.name, { type: f.type }));
            e.preventDefault();
          }
      };
    li.querySelector("[data-a=s]").onclick = async () => {
      const next = li.querySelector("input").value.trim(),
        notes = li.querySelector("textarea").value.trim();
      if (!next) return;
      if (next !== c.text || notes !== (c.notes || "")) {
        const r = await post("/inbox", { op: "edit", dir, text: c.text, next, notes });
        if (!r.ok) return;
      }
      if (files.length) {
        const r = await post("/note", { dir, for: next, text: "", files: await dataUrls(files) });
        if (!r.ok) toast("Idea saved, files not attached");
      }
      editFiles = { k: "", files: [] };
      store.mode = null;
      done();
      load();
    };
  }
  if (store.mode === "reject") {
    const idea = c.kind !== "run";
    li.innerHTML = html`<div class="q">${c.kind === "backlog" ? "Not doing this backlog item?" : idea ? "Reject this idea?" : "Abandon this run?"} The reason is recorded.</div><input placeholder="Why not?"><div class="row"><button class="btn ghost" data-a="c">Keep it</button><button class="btn warn" data-a="s">${idea ? "Reject" : "Abandon"}</button></div>`;
    li.querySelector("[data-a=s]").onclick = async () => {
      const why = li.querySelector("input").value.trim();
      if (!why) {
        toast("A reason is required");
        return;
      }
      store.mode = null;
      done();
      const r =
        c.kind === "backlog"
          ? await post("/backlog", { op: "reject", dir, source: c.source, n: c.n, reason: why })
          : idea
            ? await post("/inbox", { op: "reject", dir, text: c.text, reason: why })
            : await post("/abort", { dir, id: c.id, why });
      if (r.ok) toast(idea ? "Rejected" : "Abandoned, reason recorded");
      load();
    };
  }
  if (store.mode === "delete") {
    li.innerHTML = html`<div class="q">Delete "${c.text}"?</div><div class="q dim">Not recorded anywhere.</div><div class="row"><button class="btn ghost" data-a="c">Keep it</button><button class="btn danger" data-a="s">Delete</button></div>`;
    li.querySelector("[data-a=s]").onclick = async () => {
      store.mode = null;
      const r = await post("/inbox", { op: "delete", dir, text: c.text });
      if (r.ok) toast("Deleted");
      load();
    };
  }
  if (store.mode === "move") {
    const ps = store.S.projects.filter((p) => p.dir !== dir);
    li.innerHTML = html`<div class="q">Move "${c.text}" to</div><select class="sel" aria-label="Project">${ps.map((p) => html`<option value="${p.dir}" title="${p.label}">${short(p.label)}</option>`)}</select><div class="row"><button class="btn ghost" data-a="c">Cancel</button><button class="btn pri" data-a="s">Move</button></div>`;
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
    li.innerHTML = runHtml(c);
    li.querySelector("[data-a=s]").onclick = () => startRun(c, "full");
    li.querySelector("[data-a=l]").onclick = () => startRun(c, "lite");
    runForm(li, c);
  }
  li.querySelector("[data-a=c]").onclick = () => {
    if (store.mode === "edit") editFiles = { k: "", files: [] };
    store.mode = null;
    done();
    render();
  };
  // Edit and reject take dictation; the run prompt has no field.
  li.querySelectorAll("input:not([type=file]),textarea").forEach((f, i) => draft(f, "f:" + store.mode + ":" + store.modeKey + ":" + i));
  if (store.mode !== "run") {
    const m = mic([...li.querySelectorAll("input:not([type=file]),textarea")]);
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

const runHtml = (c) =>
  html`<div class="q">Run "${c.text}"</div><div class="q dim">Opens your agent with this request in a terminal.</div><div class="q dim">Full plans, builds, and checks with a separate reviewer. Lite does it in one session.</div><div id="run-pick" style="display:grid;gap:6px"><div id="run-agent" class="agents" role="radiogroup" aria-label="Agent"></div></div><div class="run-actions"><label class="yolo" id="run-yolo" title="Yolo: the agent runs every command and edit without asking" hidden><button type="button" class="chk" role="switch" aria-checked="false"></button>Yolo</label><div class="row"><button type="button" class="btn ghost" data-a="c">Cancel</button><button type="button" class="btn" data-a="l">Lite</button><button type="button" class="btn pri" data-a="s">Full run</button></div></div>`;
// The run form as a popup over any page: Start in the new-idea form and on Ideas.
export function runPopup(c) {
  const dl = modal(runHtml(c)),
    f = dl.querySelector("form");
  dl.classList.toggle("sheet", isPhone());
  const go = (kind) => {
    // startRun reads the Yolo switch, so the dialog closes after it has.
    void startRun(c, kind);
    dl.close();
  };
  f.querySelector<HTMLElement>("[data-a=s]").onclick = () => go("full");
  f.querySelector<HTMLElement>("[data-a=l]").onclick = () => go("lite");
  f.querySelector<HTMLElement>("[data-a=c]").onclick = () => dl.close();
  runForm(f, c);
}

let editFiles = { k: "", files: [] };
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
        html`<button type="button" class="agent" role="radio" aria-checked="${String(a.cmd === runPick.agent)}" data-cmd="${a.cmd}"><svg><use href="#c-${a.cmd}"/></svg>${a.name}</button>`,
    )
    .join("");
  // The picked tool's accounts, when it has any: its default first chosen, the normal login beside it.
  const showAccounts = () => {
    li.querySelector("#run-acct")?.remove();
    const a = d.agents.find((x) => x.cmd === runPick.agent);
    runPick.account = undefined;
    if (!a?.accounts?.length) return;
    const sel = document.createElement("select");
    sel.id = "run-acct";
    sel.className = "sel";
    sel.setAttribute("aria-label", "Account");
    sel.innerHTML = html`<option value="">Normal login</option>${a.accounts.map((x) => html`<option value="${x.id}">${x.name}</option>`)}`.s;
    sel.value = a.defaultAccount ?? "";
    runPick.account = sel.value;
    sel.onchange = () => (runPick.account = sel.value);
    box.after(sel);
  };
  showAccounts();
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
  const backlog = c.kind === "backlog" ? { source: c.source, n: c.n } : undefined;
  const r = await post("/run", { dir: c.state, text: c.text, backlog, kind, agent: p ? p.agent : undefined, account: p?.account, yolo });
  if (r.ok) {
    toast((kind === "full" ? "Full" : kind === "lite" ? "Lite" : "Started") + (yolo ? " yolo" : "") + " run " + where(r) + ": " + via(r.agent));
    // A backlog card has no terminal of its own; the run's card gets it once the run exists.
    if (r.pty && !backlog) (store.wantTerm = key(c)), (store.wantPty = { key: r.pty, at: Date.now() });
    // An idea's run opens in its workspace; the view follows it once the run card exists.
    if (!backlog) openWorkspace(c);
  }
  load();
}

const HINT = { 0: "Add an idea to start a run", 1: "Ideas you run are planned here", 2: "Approved plans are built here", 3: "Finished builds are checked here" };

// Files picked in the new-idea form. Held here, not in the form, because the board
// redraws the inline form on every change and a redraw would drop them.
let newFiles = [];
// The new-idea form, wired into f: inline at the top of Ideas, or in a modal.
// Opened from another page (Ideas, a workspace, the side menu): always the project picker,
// preset to that page's project or empty so one is chosen. The Board keeps its own rule.
let formPick: { dir: string | null } | null = null;
function ideaForm(f, shut) {
  // A phone has no project picker in its header: the form is the only place to choose.
  const picking = store.all || !!formPick || isPhone();
  const close = () => {
    newFiles = [];
    shut();
  };
  f.innerHTML = html`${picking ? html`<div class="combo" id="ndc"><button type="button" class="sel" id="newdir" aria-label="Project for this idea" aria-haspopup="listbox" aria-expanded="false"></button><div class="menu-pop" hidden><input class="sel" aria-label="Search projects" placeholder="Search projects…" spellcheck="false" autocomplete="off"><div id="nds" role="listbox"></div></div></div>` : ""}<input id="newidea" placeholder="What do you want to build?"><label for="newnotes">Anything the planner should know <span class="dim">(optional)</span></label><textarea id="newnotes" placeholder="Context, constraints, examples, and what a good result looks like"></textarea><div class="att" id="newatt"></div><input type="file" id="newfile" multiple hidden><div class="row"><button type="button" class="ib" id="newpick" aria-label="Attach files" title="Attach files">${ico("clip")}</button><button type="button" class="btn ghost" id="nc">Cancel</button><div class="split"><button type="button" class="btn pri" id="ns">Add</button><button type="button" class="btn pri" id="nm" aria-label="More ways to add" aria-haspopup="menu" aria-expanded="false">${ico("chev")}</button><div class="menu-pop" role="menu" hidden><button type="button" role="menuitem" id="nr" title="Add the idea and run it now">${ico("play")}Start run</button></div></div></div>`;
  const inp = f.querySelector("#newidea"),
    files = newFiles;
  draft(inp, "f:new:0");
  draft(f.querySelector("textarea"), "f:new:1");
  // run: add the idea, then launch it at once with the project's runner and agent.
  const save = async (run) => {
    const text = inp.value.trim();
    if (!text) return;
    const notes = f.querySelector("textarea").value.trim();
    const dir = picking ? newDir : null;
    if (picking && !dir) {
      toast("Choose a project for this idea");
      f.querySelector<HTMLElement>("#newdir")?.click();
      return;
    }
    close();
    const r = await post("/inbox", dir ? { op: "add", dir, text, notes } : { op: "add", text, notes });
    if (r.ok) {
      toast("Idea added");
      // The idea exists first: a failed upload leaves it as plain text.
      if (files.length) {
        const enc = await dataUrls(files);
        const n = await post("/note", { dir, for: text, text: "", files: enc });
        if (!n.ok) toast("Idea added, files not attached");
      }
      if (run) {
        await load();
        const c = store.S.cards.find((x) => x.kind === "idea" && x.text === text && (!dir || x.state === dir));
        if (c) return runPopup(c);
      }
    }
    load();
  };
  const shown = () => (f.querySelector("#newatt").textContent = files.map((y) => y.name).join(" · "));
  const add = (x) => {
    files.push(x);
    shown();
  };
  shown();
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
  if (picking) {
    if (formPick) setNewDir(formPick.dir);
    // From another page a choice is always required: a preset project the picker does not offer is not swapped for another.
    ideaCombo(f, !!formPick);
  }
  f.querySelector("#ns").onclick = () => save(false);
  f.querySelector("#nr").onclick = () => save(true);
  {
    const mb = f.querySelector("#nm"),
      menu = f.querySelector(".split .menu-pop");
    // Focus moves into the menu only when it was opened from the keyboard.
    const show = (on, kbd) => {
      menu.hidden = !on;
      mb.setAttribute("aria-expanded", String(on));
      if (on && kbd) setTimeout(() => menu.querySelector("button").focus());
    };
    mb.onclick = (e) => {
      e.stopPropagation();
      show(menu.hidden, e.detail === 0);
    };
    menu.onkeydown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        show(false);
        mb.focus();
      }
    };
    f.addEventListener("click", (e) => {
      if (!menu.hidden && !e.target.closest(".split")) show(false);
    });
    const sp = f.querySelector(".split");
    sp.addEventListener("focusout", (e) => {
      if (!sp.contains(e.relatedTarget)) show(false);
    });
  }
  f.querySelector("#nc").onclick = close;
  {
    const m = mic([inp, f.querySelector("textarea")]);
    if (m) f.querySelector(".row").prepend(m);
  }
  inp.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save(false);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };
  setTimeout(() => inp.focus());
}

// New idea from the top bar, the empty board or n: the same form, in a modal.
export function newIdea(from?: { dir: string | null }) {
  // The header button passes its click event: only an explicit { dir } is another page's call.
  formPick = from && "dir" in from ? from : null;
  if (store.mode === "new") {
    store.mode = null;
    render();
  }
  newFiles = [];
  const dl = modal("");
  const f = dl.querySelector("form");
  f.onsubmit = (e) => e.preventDefault();
  dl.addEventListener("close", () => stopDictation(false));
  ideaForm(f, () => dl.close());
}

export function render() {
  // A closed form leaves no draft behind; an open one is reopened after a reload.
  // A form whose card is gone (restored after a reload, or deleted elsewhere) has nowhere to show.
  if (store.mode && store.mode !== "new" && ![...store.S.cards, ...backlogList()].some((c) => key(c) === store.modeKey))
    store.mode = null;
  if (store.mode !== "run" && runPick) runPick.yolo = false;
  if (store.mode !== "edit") editFiles = { k: "", files: [] };
  if (!store.mode) undraft("f:");
  // Reassigned, not emptied: a form still open (the modal) keeps its own array.
  if (store.mode !== "new") newFiles = [];
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
  syncMode();
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
    ["New project…", "__new"],
    ["Find projects on this PC…", "__find"],
    ["Clone from GitHub…", "__clone"],
  ];
  const cur = store.all || !store.S.dir ? "All projects" : (store.PL.find((p) => p[1] === store.S.dir) || ["All projects"])[0];
  $("proj").innerHTML =
    store.all || !store.S.dir
      ? html`<span class="plogo" aria-hidden="true">${ico("board")}</span><span>${cur}</span>`
      : html`${plogo(store.S.dir, cur)}<span>${short(cur)}</span>`;
  $("proj").title = cur;
  if (!$("projpop").hidden) list();
  $("showc").hidden = !store.all;
  const sp = showable(),
    ns = sp.filter((p) => store.shown.has(p.dir)).length;
  $("show").textContent = ns ? `Showing ${ns} of ${sp.length}` : "Showing all";
  if (!$("showpop").hidden) showList();
  // Workspaces mode: the same page, a different body.
  const wsm = boardMode() === "ws";
  if (wsm) drawWsBoard((dir) => (!only || store.shown.has(dir)) && (store.all || !store.S.dir || dir === store.S.dir));
  if (!wsm && !cs.length && store.mode !== "new") {
    b.innerHTML = archive
      ? '<div class="empty"><div class="mascot"></div><b>Nothing archived</b></div>'
      : '<div class="empty"><div class="mascot"></div><b>Nothing here yet</b><p>Add an idea and kaizen will plan it, build it, and check the result.</p><button class="btn pri" id="newempty">New idea</button></div>';
    if (!archive)
      $("newempty").onclick = newIdea;
  }
  (wsm ? [] : COLS).forEach((name, ci) => {
    const s = document.createElement("section");
    const q = query.trim().toLowerCase();
    const bl = ci === 0 && !archive && ideasTab === "backlog";
    const all = bl ? backlogList().filter((c) => !only || store.shown.has(c.state)) : cs;
    const list = all.filter(
      (c) =>
        c.column === ci &&
        (!bl || !sev || SEVS.find((x) => x[0] === sev)[2](c.severity)) &&
        (!filter || c.status === filter) &&
        (archive || !nested(c)) &&
        (!q || `${c.title || ""} ${c.text || ""} ${c.id || ""}`.toLowerCase().includes(q)),
    );
    // Runs age by their last move, ideas by when they were added, across every project;
    // an idea from before the stamp falls back to its inbox position.
    if (ci < 4 && !bl) {
      const at = (c) => (c.kind === "run" ? c.moved || 0 : c.added || 0),
        old = order[ci] === "old",
        pos = (c) => store.S.cards.indexOf(c);
      // Runs waiting on you go first, then the column's own order.
      const w = (c) => (c.status === "waiting" ? 1 : 0);
      list.sort((a, b) => w(b) - w(a) || (old ? at(a) - at(b) || pos(a) - pos(b) : at(b) - at(a) || pos(b) - pos(a)));
    }
    const clearable = ci === 4 && !archive && list.length;
    const olderThan = (days) => list.filter((c) => store.S.now - (c.moved || store.S.now) > days * d);
    // The Ideas column is titled by its two tabs, icons without counts: ideas, or the
    // runs' leftovers. On Backlog a filter icon narrows it to one severity.
    const tabbed = ci === 0 && !archive,
      nb = tabbed ? backlogList().filter((c) => !only || store.shown.has(c.state)) : [];
    const title = tabbed
      ? `<span class="itabs" role="tablist" aria-label="Ideas column">${[
          ["ideas", "Ideas", `<svg><use href="#s-idea"/></svg>`],
          ["backlog", "Backlog: what finished runs left undone", ico("clock")],
        ]
          .map(
            ([v, l, svg]) =>
              `<button role="tab" aria-selected="${String(ideasTab === v)}" data-t="${v}" title="${l}" aria-label="${l}">${svg}${ideasTab === v ? `<b>${l.split(":")[0]}</b>` : ""}</button>`,
          )
          .join("")}</span>`
      : `${name}<i>${list.length || ""}</i>`;
    const sevBtn = bl
      ? `<button class="ib sm sevf${sev ? " on" : ""}" data-sv="1" title="${sev ? "Severity: " + SEVS.find((x) => x[0] === sev)[1] : "Filter by severity"}" aria-label="Filter by severity" aria-haspopup="menu" aria-expanded="${String(store.sevMenu)}">${ico("filter")}</button>` +
        (store.sevMenu
          ? `<div class="menu-pop sev-pop" role="menu"><button role="menuitemradio" aria-checked="${String(!sev)}" data-s="">All severities <i>${nb.length}</i></button><hr>${SEVS.map(
              ([v, l, f]) =>
                `<button role="menuitemradio" aria-checked="${String(sev === v)}" data-s="${v}">${l} <i>${nb.filter((c) => f(c.severity)).length}</i></button>`,
            ).join("")}</div>`
          : "")
      : "";
    let head = `<h2>${title}${ci < 4 && !bl && list.length > 1 ? `<button class="btn sm ghost ord" title="Sort order">${order[ci] === "old" ? "Oldest" : "Newest"}</button>` : ""}${sevBtn}${tabbed ? `<button class="ib sm newi" title="New idea" aria-label="New idea">${ico("plus")}</button>` : ""}`;
    if (clearable && picking)
      head += `<span class="pickbar"><button class="btn sm ghost" data-p="cancel">Cancel</button><button class="btn sm pri" data-p="go" ${picked.size ? "" : "disabled"}>Archive ${picked.size || ""}</button></span>`;
    else if (clearable) head += `<button class="btn sm ghost clear" title="Archive finished runs">Clear ▾</button>`;
    if (clearable && store.clearMenu)
      head += `<div class="menu-pop clear-pop"><button data-c="7">Older than a week <i>${olderThan(7).length}</i></button><button data-c="3">Older than 3 days <i>${olderThan(3).length}</i></button><button data-c="0">Everything <i>${list.length}</i></button><hr><button data-c="pick">Pick which…</button></div>`;
    s.innerHTML = head + `</h2>`;
    if (tabbed) {
      s.querySelectorAll("[data-t]").forEach(
        (bt) =>
          (bt.onclick = () => {
            ideasTab = bt.dataset.t;
            store.sevMenu = false;
            try {
              localStorage.setItem("kz-ideas-tab", ideasTab);
            } catch (e) {}
            render();
          }),
      );
      const sv = s.querySelector("[data-sv]");
      if (sv)
        sv.onclick = (e) => {
          e.stopPropagation();
          store.sevMenu = !store.sevMenu;
          render();
        };
      s.querySelectorAll("[data-s]").forEach(
        (bt) =>
          (bt.onclick = (e) => {
            e.stopPropagation();
            sev = bt.dataset.s || null;
            store.sevMenu = false;
            render();
          }),
      );
    }
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
    if (tabbed)
      s.querySelector(".newi").onclick = () => {
        store.mode = "new";
        ideasTab = "ideas";
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
      ul.appendChild(f);
      ideaForm(f, () => {
        store.mode = null;
        render();
      });
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
    if (!list.length && !ul.children.length && ci <= 3 && !bl && cs.length && !filter && !q && !archive)
      ul.innerHTML = `<li class="hint">${HINT[ci]}</li>`;
    if (bl && !list.length && !filter && !q)
      ul.innerHTML = `<li class="hint">${sev ? "Nothing at this severity" : "What finished runs left undone shows here"}</li>`;
    s.appendChild(ul);
    b.appendChild(s);
  });
  // The tab says how many runs wait on you, or agents wait on input, so a background tab still tells you.
  const nw = waitingCount(store.S.cards);
  document.title = nw ? `(${nw}) kaizen` : "kaizen";
  if (store.all) boardBadge(store.S.cards, [...store.S.projects, ...(store.S.rail ?? [])], store.S.agents);
  termsBadge();
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
  initWsBoard(render);
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
