// The notebook page. Bundled into web/dist/notebook.js by `bun run build:web`; the page
// never sees the filesystem, only /vault. See design.md, "Notebook", for the look.
import { refreshBoardBadge } from "../board/badge.ts";
import { initRail } from "../board/workspace.ts";
// embed=1: a run workspace's note tab shows the note alone, without the side menu and header.
if (new URLSearchParams(location.search).has("embed")) document.body.classList.add("embed");
import {
  Autosave,
  age,
  backlinks,
  createEditor,
  emptyBoard,
  folderOf,
  freshName,
  last,
  parseQuery,
  pickProject,
  renameMessage,
  renameTarget,
  resolve,
  searchNotes,
  startNote,
  tagCounts,
  toggleTag,
  tree,
  type Board,
  type EditorHandle,
  type EditorHost,
  type Note,
  type Tree,
} from "@lib/notebook";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const ico = (n: string) => `<svg><use href="#i-${n}"/></svg>`;

let board: Board = emptyBoard(); // what [[run:…]] and [[idea:…]] can name, from /links
let dir = ""; // the state dir whose notes/ is shown
let notes: Note[] = [];
let open: string | null = null; // the note in the editor
let confirmDelete = false;
const shut = new Set<string>(); // folders folded in the tree, for this page load

function toast(msg: string) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("on");
  setTimeout(() => el.classList.remove("on"), 2600);
}
async function post(body: Record<string, unknown>) {
  try {
    const r = await fetch("/vault", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dir, ...body }),
    });
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  } catch {
    return { status: 0, error: "The board is not running" };
  }
}

// ---- the editor: one per open note (lib/notebook/engine.ts)

let ed: EditorHandle | null = null;
const host: EditorHost = {
  names: () => notes.map((n) => n.name),
  board: () => board,
  dir: () => dir,
  edited: () => save.edit(),
  save: () => void flush(),
  openNote: (n) => void openNote(n),
  openOrCreate: (n) => void openOrCreate(n),
  search(q) {
    $<HTMLInputElement>("q").value = q;
    drawSide();
  },
  toast,
  // Leave for the board only once the note is on disk.
  async go(href) {
    await flush();
    if (save.dirty) {
      toast("This note is not saved yet");
      return;
    }
    location.href = href;
  },
};

// ---- saving (lib/notebook/autosave.ts)

const save = new Autosave({
  read: () => ed?.text() ?? null,
  timer: { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) },
  save: (name, text, base) => post({ op: "save", name, text, base }) as never,
  onState: (s) => drawMeta(s === "saving" ? "Saving…" : undefined),
  onSaved: (name, text, mtime) => upsert({ name, mtime, text }),
  onError: toast,
});
const flush = () => save.flush();
function upsert(n: Note) {
  notes = [n, ...notes.filter((x) => x.name !== n.name)];
  drawSide();
  drawLinks();
}

// ---- the vault

async function load() {
  let r: { notes?: Note[]; error?: string };
  try {
    r = await (await fetch("/vault?dir=" + encodeURIComponent(dir))).json();
  } catch {
    toast("The board is not running");
    return;
  }
  if (!r.notes) {
    toast(r.error || "Could not read notes");
    return;
  }
  notes = r.notes;
  // The board's items, for chips and completion; a failure keeps the last ones.
  try {
    const b = await (await fetch("/links?dir=" + encodeURIComponent(dir))).json();
    if (Array.isArray(b.runs)) board = b;
  } catch {
    /* keep */
  }
  const mine = open && notes.find((n) => n.name === open);
  // Someone else changed the open note: take it only when nothing typed here is unsaved.
  if (mine && mine.mtime !== save.base && !save.dirty && !save.busy) {
    save.adopt(mine.mtime);
    ed?.replace(mine.text);
  }
  ed?.refresh();
  drawSide();
  drawLinks();
  drawPane();
}

// Laying down a page: the note being left is copied onto a sheet under the paper
// side, and the next note slides a short way in over it from the right, fading up,
// like a fresh sheet dealt onto a stack, while the one beneath eases left into its
// shadow. The sidebar sits above both, so nothing moves across it. The copy
// is pixels only: never focused, never read. Transform and opacity only, so it stays
// smooth. Every open does it, the first one too. Nothing moves under reduced motion.
const DEAL = { duration: 260, easing: "cubic-bezier(.22,.61,.36,1)" };
function lift(): HTMLElement | null {
  const main = document.querySelector<HTMLElement>(".main")!;
  const m = document.documentElement.dataset.motion;
  if (m ? m === "reduce" : matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const r = main.getBoundingClientRect(),
    top = main.scrollTop;
  const sheet = main.cloneNode(true) as HTMLElement;
  sheet.classList.add("sheet");
  sheet.setAttribute("aria-hidden", "true");
  sheet.inert = true;
  Object.assign(sheet.style, {
    left: r.left + "px",
    top: r.top + "px",
    width: r.width + "px",
    height: r.height + "px",
  });
  sheet.append(Object.assign(document.createElement("i"), { className: "shade" }));
  // After the real page in document order, so every id still finds the real one first.
  document.body.append(sheet);
  sheet.scrollTop = top;
  return sheet;
}
function turn(sheet: HTMLElement | null) {
  if (!sheet) return;
  const main = document.querySelector<HTMLElement>(".main")!;
  main.classList.add("dealt");
  const done = () => {
    main.classList.remove("dealt");
    sheet.remove();
  };
  main
    .animate(
      [
        { transform: "translateX(56px)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      DEAL,
    )
    .finished.then(done, done);
  // The old page is gone before the new one is fully up, so the two never read as one.
  sheet.animate(
    [
      { transform: "none", opacity: 1 },
      { transform: "translateX(-24px)", opacity: 0, offset: 0.6 },
      { transform: "translateX(-24px)", opacity: 0 },
    ],
    { ...DEAL, fill: "forwards" },
  );
  sheet.querySelector<HTMLElement>(".shade")!.animate([{ opacity: 0 }, { opacity: 1 }], { ...DEAL, fill: "forwards" });
}

// False when the open note still holds text that is not on disk: it stays open.
async function openNote(name: string | null): Promise<boolean> {
  if (name === open) return true;
  await flush();
  if (save.dirty) {
    toast(save.conflict ? "Choose Keep mine or Load theirs first" : "This note is not saved yet");
    return false;
  }
  const sheet = lift();
  open = name;
  confirmDelete = false;
  const n = name ? notes.find((x) => x.name === name) : null;
  save.open(name, n?.mtime ?? 0);
  ed?.destroy();
  ed = name ? createEditor($("editor"), n?.text ?? "", host) : null;
  try {
    name ? sessionStorage.setItem("kz-note:" + dir, name) : sessionStorage.removeItem("kz-note:" + dir);
  } catch {
    /* private window */
  }
  document.body.classList.remove("side-open");
  drawSide();
  drawPane();
  drawLinks();
  turn(sheet);
  return true;
}

async function create(name: string) {
  const r = await post({ op: "save", name, text: "", base: 0 });
  if (!r.ok) {
    toast(r.status === 409 ? "A note with that name exists" : r.error || "Could not create the note");
    return false;
  }
  upsert({ name: r.name, mtime: r.mtime, text: "" });
  return openNote(r.name);
}
async function openOrCreate(name: string) {
  const hit = resolve(
    name,
    notes.map((n) => n.name),
  );
  if (hit) return void openNote(hit);
  if (await create(name)) ed?.focus();
}
async function newNote() {
  if (
    await create(
      freshName(
        notes.map((n) => n.name),
        open ? folderOf(open) : "",
      ),
    )
  ) {
    const t = $<HTMLInputElement>("title");
    t.focus();
    t.select();
  }
}

async function rename(to: string) {
  const target = open ? renameTarget(open, to) : null;
  if (!open || !target) {
    drawPane();
    return;
  }
  const from = open;
  await flush();
  const r = await post({ op: "rename", name: from, to });
  if (!r.ok) {
    toast(r.error || "Could not rename");
    drawPane();
    return;
  }
  // Another note was opened meanwhile: the rename stands, the editor stays where it is.
  if (open !== from) {
    await load();
    return;
  }
  open = target;
  save.renamed(target);
  await load();
  save.adopt(notes.find((n) => n.name === open)?.mtime ?? save.base);
  toast(renameMessage(from, open));
}

async function remove() {
  if (!open) return;
  save.discard();
  const r = await post({ op: "delete", name: open });
  if (!r.ok) {
    toast(r.error || "Could not delete");
    return;
  }
  toast("Moved to notes/.trash");
  notes = notes.filter((n) => n.name !== open);
  await openNote(null);
}

// ---- drawing

function drawSide() {
  const raw = $<HTMLInputElement>("q").value,
    q = parseQuery(raw);
  // Tags, most used first.
  $("tags").innerHTML = tagCounts(notes)
    .map(
      ([g, c]) =>
        `<button class="chip${g === q.tag ? " on" : ""}" data-tag="${esc(g)}" aria-pressed="${g === q.tag}">#${esc(g)} <span>${c}</span></button>`,
    )
    .join("");
  $("tagsh").hidden = !tagCounts(notes).length;
  const row = (n: string, withFolder = false) => {
    const note = notes.find((x) => x.name === n);
    return `<li><button class="nt${n === open ? " cur" : ""}" data-open="${esc(n)}"${n === open ? ' aria-current="true"' : ""}><span class="nm">${esc(last(n))}</span>${withFolder && folderOf(n) ? `<span class="fd">${esc(folderOf(n))}</span>` : ""}<span class="age">${note ? age(note.mtime) : ""}</span></button></li>`;
  };
  if (q.text) {
    const hits = searchNotes(notes, q);
    $("tree").innerHTML = hits.length
      ? `<ul>${hits.map((n) => row(n.name, true)).join("")}</ul>`
      : `<p class="none">No note matches.</p>`;
    return;
  }
  const draw = (tr: Tree, path: string): string =>
    `<ul>${[...tr.folders]
      .map(([f, sub]) => {
        const p = path + f;
        return `<li><details data-folder="${esc(p)}"${shut.has(p) ? "" : " open"}><summary><i class="chev">${ico("chev")}</i>${ico("folder")}<span>${esc(f)}</span></summary>${draw(sub, p + "/")}</details></li>`;
      })
      .join("")}${tr.notes.map((n) => row(n)).join("")}</ul>`;
  $("tree").innerHTML = notes.length ? draw(tree(notes.map((n) => n.name)), "") : "";
}

// Full screen: the open note alone, no header or sidebar. Off until the icon turns it
// on; it then holds from note to note until the icon or Esc turns it off. With no note
// open the page is never full screen: picking one needs the sidebar.
let full = false;
function setFull(on: boolean) {
  full = on;
  drawPane();
}
// Width: the reading column (boxed, 68ch) or the whole paper side. Kept per browser.
let wide = false;
try {
  wide = localStorage.getItem("kz-note-wide") === "1";
} catch {
  /* no storage */
}
function setWide(on: boolean) {
  wide = on;
  try {
    localStorage.setItem("kz-note-wide", on ? "1" : "0");
  } catch {
    /* no storage */
  }
  drawPane();
}

function drawPane() {
  const has = !!open;
  document.body.classList.toggle("full", has && full);
  document.body.classList.toggle("wide", wide);
  $("pane").hidden = !has;
  $("empty").hidden = has || notes.length > 0;
  $("pick").hidden = has || !notes.length;
  if (!has) return;
  const t = $<HTMLInputElement>("title");
  if (document.activeElement !== t) t.value = open!;
  drawMeta();
}

function drawMeta(state?: string) {
  const m = $("meta");
  if (!open) return;
  if (save.conflict) {
    m.innerHTML = `<span class="warnw">This note changed somewhere else since you opened it.</span><span class="acts"><button class="btn ghost" id="theirs">Load theirs</button><button class="btn pri" id="mine">Keep mine</button></span>`;
    $("theirs").onclick = () => {
      const c = save.takeTheirs();
      if (c) ed?.replace(c.text);
      drawMeta();
    };
    $("mine").onclick = () => {
      save.keepMine();
      drawMeta();
    };
    return;
  }
  if (confirmDelete) {
    m.innerHTML = `<span>Move this note to <code>notes/.trash</code>?</span><span class="acts"><button class="btn ghost" id="cancel">Cancel</button><button class="btn danger" id="del">Delete</button></span>`;
    $("cancel").onclick = () => {
      confirmDelete = false;
      drawMeta();
    };
    $("del").onclick = () => {
      confirmDelete = false;
      void remove();
    };
    return;
  }
  const where = folderOf(open);
  m.innerHTML = `<span>${where ? esc(where) : "Notes"}</span><span>·</span><span id="saved">${state ?? (save.dirty ? "Not saved yet" : "Saved")}</span><span class="sp"></span><button class="ib" id="wide" title="${wide ? "Boxed width" : "Full width"}" aria-label="${wide ? "Boxed width" : "Full width"}" aria-pressed="${wide}">${ico(wide ? "box" : "wide")}</button><button class="ib" id="full" title="${full ? "Exit full screen (Esc)" : "Full screen"}" aria-label="${full ? "Exit full screen" : "Full screen"}">${ico(full ? "min" : "max")}</button><button class="ib" id="trash" title="Delete note" aria-label="Delete note">${ico("trash")}</button>`;
  $("trash").onclick = () => {
    confirmDelete = true;
    drawMeta();
  };
  $("full").onclick = () => setFull(!full);
  $("wide").onclick = () => setWide(!wide);
}

function drawLinks() {
  const box = $("links");
  if (!open) {
    box.hidden = true;
    return;
  }
  const from = backlinks(notes, open);
  box.hidden = !from.length;
  box.innerHTML = `<h3>Linked from</h3><ul>${from.map((n) => `<li><button class="nt" data-open="${esc(n.name)}"><span class="nm">${esc(last(n.name))}</span>${folderOf(n.name) ? `<span class="fd">${esc(folderOf(n.name))}</span>` : ""}</button></li>`).join("")}</ul>`;
}

// ---- wiring

document.addEventListener("click", (e) => {
  // The narrow layout's drawer closes on any click outside it.
  const tg = e.target as HTMLElement;
  if (document.body.classList.contains("side-open") && !tg.closest?.(".side,#side"))
    document.body.classList.remove("side-open");
  const el = (e.target as HTMLElement).closest?.("[data-open],[data-tag]") as HTMLElement | null;
  if (!el || el.closest(".cm-editor")) return;
  if (el.dataset.open) void openNote(el.dataset.open);
  else if (el.dataset.tag) {
    const q = $<HTMLInputElement>("q");
    q.value = toggleTag(q.value, el.dataset.tag);
    drawSide();
  }
});
$("tree").addEventListener(
  "toggle",
  (e) => {
    const d = e.target as HTMLDetailsElement;
    if (d.dataset.folder) d.open ? shut.delete(d.dataset.folder) : shut.add(d.dataset.folder);
  },
  true,
);
$("q").addEventListener("input", drawSide);
$("new").onclick = () => void newNote();
$("new2").onclick = () => void newNote();
$("side").onclick = () => document.body.classList.toggle("side-open");
const title = $<HTMLInputElement>("title");
title.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    title.blur();
  }
  if (e.key === "Escape") {
    title.value = open ?? "";
    title.blur();
  }
});
title.addEventListener("blur", () => void rename(title.value));
document.addEventListener("keydown", (e) => {
  // Esc in the name or search field is theirs (it undoes a rename there).
  if (e.key !== "Escape" || (e.target as HTMLElement).matches?.("input")) return;
  document.body.classList.remove("side-open");
  if (document.body.classList.contains("full")) setFull(false);
});
// Closing with text not on disk: the browser asks first.
addEventListener("beforeunload", (e) => {
  if (save.dirty) e.preventDefault();
});
// Leaving for the board through Search (Ctrl+K): the note is written first.
addEventListener("kz-leave", ((e: CustomEvent) => e.detail.wait(flush())) as EventListener);
// Leaving with unsaved text: a keepalive request outlives the page.
addEventListener("pagehide", () => {
  if (open && ed && save.dirty && !save.conflict)
    fetch("/vault", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dir, op: "save", name: open, text: ed.text(), base: save.base }),
    });
});

// The project: ?dir= in the URL, else the one the board picked last, else where it started.
(async () => {
  try {
    const th = localStorage.getItem("kz-theme");
    if (th) document.documentElement.dataset.theme = th;
    if (localStorage.getItem("kz-color") === "blue") document.documentElement.dataset.color = "blue";
  } catch {
    /* no storage */
  }
  let S: { dir: string | null; projects: { dir: string; label: string }[]; known?: { dir: string; label: string }[] };
  try {
    S = await (await fetch("/state")).json();
  } catch {
    toast("The board is not running");
    return;
  }
  let kept: string | null = null;
  try {
    kept = localStorage.getItem("kz-proj");
  } catch {
    /* no storage */
  }
  // The Notes tab lists every known project, not only the board picker's (a project outside the Projects folder too).
  ({ dir, projects: S.projects } = pickProject(new URLSearchParams(location.search).get("dir"), kept, S.dir, S.known ?? S.projects));
  const sel = $<HTMLSelectElement>("proj");
  sel.innerHTML = S.projects
    .map((p) => `<option value="${esc(p.dir)}" title="${esc(p.label)}"${p.dir === dir ? " selected" : ""}>${esc(p.label.split(/[\\/]/).filter(Boolean).pop() || p.label)}</option>`)
    .join("");
  // Folder names only, as on the board; the full path is the tooltip.
  const full = () => (sel.title = S.projects.find((p) => p.dir === sel.value)?.label ?? "");
  full();
  sel.onchange = async () => {
    if (!(await openNote(null))) {
      sel.value = dir;
      return;
    }
    dir = sel.value;
    full();
    // window.: `history` here is CodeMirror's undo extension.
    const u = new URL(location.href);
    u.searchParams.set("dir", dir);
    window.history.replaceState(null, "", u);
    await load();
  };
  await load();
  let lastNote: string | null = null;
  try {
    lastNote = sessionStorage.getItem("kz-note:" + dir);
  } catch {
    /* no storage */
  }
  // ?note= is the board's "Linked from notes"; otherwise the note open last in this tab.
  const again = startNote(notes.map((n) => n.name), new URLSearchParams(location.search).get("note"), lastNote);
  if (again) await openNote(again);
  initRail();
  void refreshBoardBadge();
  // Every write under a state dir arrives as `changed`, this page's own saves included.
  const listen = () => {
    const es = new EventSource("/events");
    es.onmessage = (ev) => {
      if (ev.data === "changed") { void load(); void refreshBoardBadge(); }
    };
    es.onerror = () => {
      es.close();
      setTimeout(listen, 3000);
    };
  };
  listen();
})();
