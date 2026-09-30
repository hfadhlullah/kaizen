// The notebook page. Bundled into web/notebook.js by `bun run build:web`; the page
// never sees the filesystem, only /vault. See design.md, "Notebook", for the look.
import { EditorView, Decoration, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { EditorState, StateEffect, StateField, type Range } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxTree, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { markdown, markdownLanguage, markdownKeymap } from "@codemirror/lang-markdown";
import { tags as t } from "@lezer/highlight";
import { autocompletion, type CompletionContext, type Completion } from "@codemirror/autocomplete";
import { wikilinks, tags, resolve, safeUrl, tree, freshName, parseTable, type Tree } from "./notes-lib.ts";

type Note = { name: string; mtime: number; text: string };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const ico = (n: string) => `<svg><use href="#i-${n}"/></svg>`;
const last = (name: string) => name.split("/").pop()!;
const folderOf = (name: string) => name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : "";

let dir = "";                         // the state dir whose notes/ is shown
let notes: Note[] = [];
let open: string | null = null;       // the note in the editor
let base = 0;                         // the mtime it was loaded or last saved at
let dirty = false, saving: Promise<void> | null = null, timer: ReturnType<typeof setTimeout> | undefined;
let conflict: { text: string; mtime: number } | null = null;
let confirmDelete = false;
const shut = new Set<string>();       // folders folded in the tree, for this page load

function toast(msg: string) { const el = $("toast"); el.textContent = msg; el.classList.add("on"); setTimeout(() => el.classList.remove("on"), 2600); }
async function post(body: Record<string, unknown>) {
  try {
    const r = await fetch("/vault", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dir, ...body }) });
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  } catch { return { status: 0, error: "The board is not running" }; }
}

// ---- live preview: markdown hidden and typeset on every line the cursor is not on

class Check extends WidgetType {
  constructor(readonly on: boolean, readonly at: number) { super(); }
  eq(o: Check) { return o.on === this.on && o.at === this.at; }
  toDOM(view: EditorView) {
    const b = document.createElement("input");
    b.type = "checkbox"; b.checked = this.on; b.className = "cm-task";
    b.setAttribute("aria-label", this.on ? "done" : "to do");
    b.addEventListener("mousedown", (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.at, to: this.at + 3, insert: this.on ? "[ ]" : "[x]" } });
    });
    return b;
  }
  ignoreEvent() { return true; }
}
class Bullet extends WidgetType {
  eq() { return true; }
  toDOM() { const s = document.createElement("span"); s.className = "cm-bullet"; s.textContent = "•"; return s; }
}
class Rule extends WidgetType {
  eq() { return true; }
  toDOM() { const s = document.createElement("span"); s.className = "cm-rule"; return s; }
}
class Img extends WidgetType {
  constructor(readonly src: string, readonly alt: string) { super(); }
  eq(o: Img) { return o.src === this.src && o.alt === this.alt; }
  toDOM() { const i = document.createElement("img"); i.src = this.src; i.alt = this.alt; i.className = "cm-img"; return i; }
}

// A table the cursor is not in is drawn as one; clicking it puts the cursor in its
// source. Cells are text nodes: nothing in a note becomes markup.
class TableView extends WidgetType {
  constructor(readonly src: string, readonly at: number) { super(); }
  eq(o: TableView) { return o.src === this.src && o.at === this.at; }
  toDOM(view: EditorView) {
    const t = parseTable(this.src), wrap = document.createElement("div"), table = document.createElement("table");
    wrap.className = "cm-table";
    const row = (cells: string[], tag: "th" | "td") => {
      const tr = document.createElement("tr");
      cells.forEach((c, i) => { const el = document.createElement(tag); el.textContent = c; if (t.align[i]) el.style.textAlign = t.align[i]!; tr.append(el); });
      return tr;
    };
    const head = document.createElement("thead"), body = document.createElement("tbody");
    head.append(row(t.head, "th")); t.rows.forEach((r) => body.append(row(r, "td")));
    table.append(head, body); wrap.append(table);
    wrap.addEventListener("mousedown", (e) => { e.preventDefault(); view.dispatch({ selection: { anchor: this.at } }); view.focus(); });
    return wrap;
  }
  ignoreEvent() { return true; }
}
// Whether the editor has focus, as state: an unfocused editor shows every table drawn.
const focusSet = StateEffect.define<boolean>();
const focused = StateField.define<boolean>({
  create: () => false,
  update: (v, tr) => tr.effects.reduce((f, e) => e.is(focusSet) ? e.value : f, v),
});
// Block widgets may span lines, which a view plugin may not do: tables live in a field.
function tables(state: EditorState) {
  const out: Range<Decoration>[] = [], sel = state.selection.main, live = state.field(focused, false);
  syntaxTree(state).iterate({
    enter(n) {
      if (n.name !== "Table") return;
      const from = state.doc.lineAt(n.from).from, to = state.doc.lineAt(n.to).to;
      if (live && sel.to >= from && sel.from <= to) return false;
      out.push(Decoration.replace({ widget: new TableView(state.sliceDoc(from, to), from), block: true }).range(from, to));
      return false;
    },
  });
  return Decoration.set(out);
}
const tableField = StateField.define<DecorationSet>({
  create: tables,
  update: (v, tr) => tr.docChanged || tr.selection || tr.effects.some((e) => e.is(focusSet)) || syntaxTree(tr.startState) !== syntaxTree(tr.state) ? tables(tr.state) : v,
  provide: (f) => EditorView.decorations.from(f),
});

const hide = Decoration.replace({});
const refresh = StateEffect.define<null>();   // the list of notes changed: redraw missing links

function build(view: EditorView): DecorationSet {
  const { state } = view, doc = state.doc, out: Range<Decoration>[] = [];
  const live = new Set<number>();
  // Only a focused editor has a cursor line: a note just opened reads fully typeset.
  if (view.hasFocus) for (const r of state.selection.ranges) for (let l = doc.lineAt(r.from).number; l <= doc.lineAt(r.to).number; l++) live.add(l);
  const on = (pos: number) => live.has(doc.lineAt(pos).number);
  // A plugin may not replace a line break: anything that would is left as written.
  const put = (d: Decoration, from: number, to: number) => { if (doc.lineAt(from).number === doc.lineAt(to).number) out.push(d.range(from, to)); };
  const lines = (from: number, to: number, cls: string) => {
    for (let l = doc.lineAt(from).number; l <= doc.lineAt(to).number; l++) out.push(Decoration.line({ class: cls }).range(doc.line(l).from));
  };
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from, to,
      enter(n) {
        const name = n.name;
        const h = /^ATXHeading(\d)$/.exec(name);
        if (h) { lines(n.from, n.from, `cm-h cm-h${Math.min(+h[1]!, 4)}`); return; }
        if (name === "HeaderMark" && n.node.parent?.name.startsWith("ATX")) {
          if (!on(n.from)) put(hide, n.from, Math.min(n.to + (doc.sliceString(n.to, n.to + 1) === " " ? 1 : 0), doc.lineAt(n.from).to));
          return;
        }
        if (name === "EmphasisMark" || name === "StrikethroughMark" || (name === "CodeMark" && n.node.parent?.name === "InlineCode")) {
          if (!on(n.from)) put(hide, n.from, n.to);
          return;
        }
        if (name === "Blockquote") { lines(n.from, n.to, "cm-quote"); return; }
        if (name === "QuoteMark") {
          if (!on(n.from)) put(hide, n.from, Math.min(n.to + (doc.sliceString(n.to, n.to + 1) === " " ? 1 : 0), doc.lineAt(n.from).to));
          return;
        }
        if (name === "FencedCode") {
          lines(n.from, n.to, "cm-fence");
          out.push(Decoration.line({ class: "cm-fence-a" }).range(doc.lineAt(n.from).from), Decoration.line({ class: "cm-fence-z" }).range(doc.lineAt(n.to).from));
          return false;
        }
        if (name === "HorizontalRule") { if (!on(n.from)) put(Decoration.replace({ widget: new Rule() }), n.from, n.to); return; }
        if (name === "ListMark" && n.node.parent?.parent?.name === "BulletList") {
          if (on(n.from)) return;
          const task = n.node.nextSibling?.name === "Task";
          put(task ? hide : Decoration.replace({ widget: new Bullet() }), n.from, task ? Math.min(n.to + 1, doc.lineAt(n.from).to) : n.to);
          return;
        }
        if (name === "TaskMarker") {
          if (!on(n.from)) put(Decoration.replace({ widget: new Check(/x/i.test(doc.sliceString(n.from, n.to)), n.from) }), n.from, n.to);
          return;
        }
        if (name === "Image") {
          const url = n.node.getChild("URL"), marks = n.node.getChildren("LinkMark");
          if (on(n.from) || !url || marks.length < 2) return false;
          const src = safeUrl(doc.sliceString(url.from, url.to));
          if (src && /^https?:/i.test(src)) put(Decoration.replace({ widget: new Img(src, doc.sliceString(marks[0]!.to, marks[1]!.from)) }), n.from, n.to);
          return false;
        }
        if (name === "Link") {
          const url = n.node.getChild("URL"), marks = n.node.getChildren("LinkMark");
          // Only the inline form `[text](url)`; a reference link stays as written.
          if (!url || marks.length < 4) return;
          const href = safeUrl(doc.sliceString(url.from, url.to));
          const text = { from: marks[0]!.to, to: marks[1]!.from };
          // A link to somewhere safeUrl refuses stays as written, so what it points at is visible.
          if (on(n.from) || !href) { out.push(Decoration.mark({ class: "cm-link-src" }).range(n.from, n.to)); return; }
          if (text.to > text.from) out.push(Decoration.mark({ class: "cm-link", attributes: { "data-href": href } }).range(text.from, text.to));
          put(hide, marks[0]!.from, marks[0]!.to); put(hide, marks[1]!.from, n.to);
          return;
        }
        if (name === "URL" && n.node.parent?.name !== "Link" && n.node.parent?.name !== "Image") {
          const href = safeUrl(doc.sliceString(n.from, n.to));
          out.push(Decoration.mark({ class: "cm-link", attributes: href && !on(n.from) ? { "data-href": href } : {} }).range(n.from, n.to));
        }
      },
    });
  }
  // Wikilinks and tags are not markdown: found by notes-lib over the text.
  // ponytail: the whole note is scanned on each redraw; limit to visible ranges if notes reach megabytes.
  const text = doc.toString(), names = notes.map((x) => x.name);
  for (const w of wikilinks(text)) {
    const target = resolve(w.name, names);
    const cls = "cm-wiki" + (target ? "" : " cm-wiki-missing");
    if (on(w.from)) { out.push(Decoration.mark({ class: cls }).range(w.from, w.to)); continue; }
    const labelAt = text.lastIndexOf(w.label, w.to - 2);
    const lf = labelAt > w.from ? labelAt : w.from + 2, lt = lf + w.label.length;
    put(hide, w.from, lf); out.push(Decoration.mark({ class: cls, attributes: { "data-note": target ?? w.name } }).range(lf, lt)); put(hide, lt, w.to);
  }
  for (const g of tags(text)) out.push(Decoration.mark({ class: "cm-tag", attributes: on(g.from) ? {} : { "data-tag": g.tag } }).range(g.from, g.to));
  return Decoration.set(out, true);
}

const preview = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = build(view); }
  update(u: ViewUpdate) {
    if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || syntaxTree(u.startState) !== syntaxTree(u.state)
      || u.transactions.some((tr) => tr.effects.some((e) => e.is(refresh)))) this.decorations = build(u.view);
  }
}, { decorations: (v) => v.decorations });

const look = HighlightStyle.define([
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.monospace, fontFamily: "var(--mono)", fontSize: "0.86em", background: "var(--bg)", borderRadius: "var(--r-s)", padding: "1px 4px" },
  { tag: [t.processingInstruction, t.meta, t.url, t.labelName, t.contentSeparator], color: "var(--dim)" },
  { tag: t.link, color: "var(--accent)" },
  { tag: t.quote, color: "var(--dim)" },
]);

// Clicks on what the preview drew: a link opens, a wikilink opens its note, a tag filters.
const clicks = EditorView.domEventHandlers({
  mousedown(e) {
    const el = (e.target as HTMLElement).closest?.("[data-href],[data-note],[data-tag]") as HTMLElement | null;
    if (!el || e.button !== 0) return false;
    e.preventDefault();
    const href = el.dataset.href;
    // A relative link is a note (`[x](Other%20note.md)`), as in Obsidian; the rest open in a tab.
    if (href && !/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      let name = href; try { name = decodeURIComponent(href); } catch { /* as written */ }
      const hit = resolve(name.split("#")[0]!, notes.map((x) => x.name));
      hit ? void openNote(hit) : toast(`No note named ${name}`);
    } else if (href) window.open(href, "_blank", "noopener");
    else if (el.dataset.note) openOrCreate(el.dataset.note);
    else if (el.dataset.tag) { $<HTMLInputElement>("q").value = "#" + el.dataset.tag; drawSide(); }
    return true;
  },
});

// The `/` menu: at the start of a line, `/` offers the blocks, so nobody has to
// remember markdown. Picking one replaces the `/word` with the block's source; `|`
// in the text marks where the cursor lands.
const BLOCKS: [string, string, string][] = [
  ["Checkbox", "- [ ] |", "to do"],
  ["Divider", "---\n|", "line across"],
  ["Heading 1", "# |", "big"],
  ["Heading 2", "## |", "medium"],
  ["Heading 3", "### |", "small"],
  ["Bullet list", "- |", "•"],
  ["Numbered list", "1. |", "1."],
  ["Quote", "> |", "aside"],
  ["Code block", "```\n|\n```", "monospace"],
  ["Table", "| Column | Column |\n| --- | --- |\n| | |", "rows"],
  ["Link to note", "[[|]]", "[[ ]]"],
  ["Tag", "#|", "#"],
];
function slash(cx: CompletionContext) {
  const m = cx.matchBefore(/^[ \t]*\/[\w ]*$/);
  if (!m) return null;
  const at = m.from + m.text.indexOf("/");
  return {
    from: at,
    filter: true,
    validFor: /^\/[\w ]*$/,
    // Boosted in list order, so an unfiltered menu reads as written above.
    options: BLOCKS.map(([label, src, detail], i): Completion => ({
      label: "/" + label.toLowerCase(), displayLabel: label, detail, boost: 50 - i,
      apply: (view, _c, from, to) => {
        // Straight under a line of text, `---` would underline it into a heading and a
        // table would join its paragraph: both need a blank line above.
        const line = view.state.doc.lineAt(from);
        const gap = (label === "Divider" || label === "Table") && line.number > 1 && view.state.doc.line(line.number - 1).text.trim() ? "\n" : "";
        const text = gap + src.replace("|", ""), caret = from + gap.length + src.indexOf("|");
        view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: caret }, userEvent: "input.complete" });
      },
    })),
  };
}

const exts = (crlf: boolean) => [
  autocompletion({ override: [slash], icons: false }),
  history(),
  keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab, { key: "Mod-s", run: () => { void flush(); return true; } }]),
  markdown({ base: markdownLanguage }),
  syntaxHighlighting(look),
  EditorView.lineWrapping,
  EditorView.contentAttributes.of({ "aria-label": "Note", spellcheck: "true" }),
  focused, EditorView.focusChangeEffect.of((_s, on) => focusSet.of(on)), tableField,
  preview, clicks,
  EditorView.updateListener.of((u) => { if (u.docChanged && !loading) { dirty = true; conflict = null; drawMeta(); clearTimeout(timer); timer = setTimeout(() => void flush(), 600); } }),
  crlf ? EditorState.lineSeparator.of("\r\n") : [],
];

let loading = false;
const view = new EditorView({ parent: $("editor"), state: EditorState.create({ doc: "", extensions: exts(false) }) });
// Replace the text without it counting as the user's edit.
function setText(text: string, fresh: boolean) {
  loading = true;
  if (fresh) view.setState(EditorState.create({ doc: text, extensions: exts(text.includes("\r\n")) }));
  else view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: Math.min(view.state.selection.main.head, text.length) } });
  loading = false;
}

// ---- saving

// Write the open note if it has unsaved text. Never called for a note only opened.
async function flush(): Promise<void> {
  clearTimeout(timer);
  if (saving) await saving;
  if (!open || !dirty || conflict) return;
  const name = open, text = view.state.sliceDoc();
  let saved = false;
  saving = (async () => {
    drawMeta("Saving…");
    const r = await post({ op: "save", name, text, base });
    if (open !== name) return;
    if (r.ok) { saved = true; base = r.mtime; if (view.state.sliceDoc() === text) dirty = false; upsert({ name, mtime: r.mtime, text }); }
    else if (r.status === 409) conflict = { text: r.text ?? "", mtime: r.mtime ?? 0 };
    else toast(r.error || "Not saved");
  })();
  await saving; saving = null;
  drawMeta();
  // Typed on while that save was out: save again. A failed save waits for the next keystroke.
  if (saved && dirty && !conflict && open === name) { clearTimeout(timer); timer = setTimeout(() => void flush(), 600); }
}
function upsert(n: Note) { notes = [n, ...notes.filter((x) => x.name !== n.name)]; drawSide(); drawLinks(); }

// ---- the vault

async function load() {
  let r: { notes?: Note[]; error?: string };
  try { r = await (await fetch("/vault?dir=" + encodeURIComponent(dir))).json(); } catch { toast("The board is not running"); return; }
  if (!r.notes) { toast(r.error || "Could not read notes"); return; }
  notes = r.notes;
  const mine = open && notes.find((n) => n.name === open);
  // Someone else changed the open note: take it only when nothing typed here is unsaved.
  if (mine && mine.mtime !== base && !dirty && !saving) { base = mine.mtime; setText(mine.text, false); }
  view.dispatch({ effects: refresh.of(null) });
  drawSide(); drawLinks(); drawPane();
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
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const r = main.getBoundingClientRect(), top = main.scrollTop;
  const sheet = main.cloneNode(true) as HTMLElement;
  sheet.classList.add("sheet");
  sheet.setAttribute("aria-hidden", "true");
  sheet.inert = true;
  Object.assign(sheet.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
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
  const done = () => { main.classList.remove("dealt"); sheet.remove(); };
  main.animate([{ transform: "translateX(56px)", opacity: 0 }, { transform: "none", opacity: 1 }], DEAL).finished.then(done, done);
  // The old page is gone before the new one is fully up, so the two never read as one.
  sheet.animate([{ transform: "none", opacity: 1 }, { transform: "translateX(-24px)", opacity: 0, offset: 0.6 }, { transform: "translateX(-24px)", opacity: 0 }], { ...DEAL, fill: "forwards" });
  sheet.querySelector<HTMLElement>(".shade")!.animate([{ opacity: 0 }, { opacity: 1 }], { ...DEAL, fill: "forwards" });
}

// False when the open note still holds text that is not on disk: it stays open.
async function openNote(name: string | null): Promise<boolean> {
  if (name === open) return true;
  await flush();
  if (dirty) { toast(conflict ? "Choose Keep mine or Load theirs first" : "This note is not saved yet"); return false; }
  const sheet = lift();
  open = name; conflict = null; confirmDelete = false; dirty = false;
  const n = name ? notes.find((x) => x.name === name) : null;
  base = n?.mtime ?? 0;
  setText(n?.text ?? "", true);
  try { name ? sessionStorage.setItem("kz-note:" + dir, name) : sessionStorage.removeItem("kz-note:" + dir); } catch { /* private window */ }
  document.body.classList.remove("side-open");
  drawSide(); drawPane(); drawLinks();
  turn(sheet);
  return true;
}

async function create(name: string) {
  const r = await post({ op: "save", name, text: "", base: 0 });
  if (!r.ok) { toast(r.status === 409 ? "A note with that name exists" : r.error || "Could not create the note"); return false; }
  upsert({ name: r.name, mtime: r.mtime, text: "" });
  return openNote(r.name);
}
async function openOrCreate(name: string) {
  const hit = resolve(name, notes.map((n) => n.name));
  if (hit) return void openNote(hit);
  if (await create(name)) view.focus();
}
async function newNote() {
  if (await create(freshName(notes.map((n) => n.name), open ? folderOf(open) : ""))) { const t = $<HTMLInputElement>("title"); t.focus(); t.select(); }
}

async function rename(to: string) {
  if (!open || !to.trim() || to.trim() === open) { drawPane(); return; }
  const from = open;
  await flush();
  const r = await post({ op: "rename", name: from, to });
  if (!r.ok) { toast(r.error || "Could not rename"); drawPane(); return; }
  // Another note was opened meanwhile: the rename stands, the editor stays where it is.
  if (open !== from) { await load(); return; }
  open = to.trim().replace(/\.md$/i, "").split("/").map((p) => p.trim()).join("/");
  await load();
  base = notes.find((n) => n.name === open)?.mtime ?? base;
  toast(folderOf(from) === folderOf(open) ? "Renamed" : `Moved to ${folderOf(open) || "the top"}`);
}

async function remove() {
  if (!open) return;
  clearTimeout(timer);
  const r = await post({ op: "delete", name: open });
  if (!r.ok) { toast(r.error || "Could not delete"); return; }
  toast("Moved to notes/.trash");
  dirty = false; notes = notes.filter((n) => n.name !== open);
  await openNote(null);
}

// ---- drawing

function drawSide() {
  const q = $<HTMLInputElement>("q").value.trim().toLowerCase();
  // Tags, most used first.
  const count = new Map<string, number>();
  for (const n of notes) for (const g of new Set(tags(n.text).map((x) => x.tag))) count.set(g, (count.get(g) ?? 0) + 1);
  const tg = q.startsWith("#") ? q.slice(1) : null;
  $("tags").innerHTML = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([g, c]) => `<button class="chip${g === tg ? " on" : ""}" data-tag="${esc(g)}" aria-pressed="${g === tg}">#${esc(g)} <span>${c}</span></button>`).join("");
  $("tagsh").hidden = !count.size;
  const row = (n: string, withFolder = false) => {
    const note = notes.find((x) => x.name === n);
    return `<li><button class="nt${n === open ? " cur" : ""}" data-open="${esc(n)}"${n === open ? ' aria-current="true"' : ""}><span class="nm">${esc(last(n))}</span>${withFolder && folderOf(n) ? `<span class="fd">${esc(folderOf(n))}</span>` : ""}<span class="age">${note ? age(note.mtime) : ""}</span></button></li>`;
  };
  if (q) {
    const hits = notes.filter((n) => tg !== null
      ? tags(n.text).some((x) => x.tag === tg || x.tag.startsWith(tg + "/"))
      : n.name.toLowerCase().includes(q) || n.text.toLowerCase().includes(q));
    $("tree").innerHTML = hits.length ? `<ul>${hits.map((n) => row(n.name, true)).join("")}</ul>` : `<p class="none">No note matches.</p>`;
    return;
  }
  const draw = (tr: Tree, path: string): string => `<ul>${[...tr.folders].map(([f, sub]) => {
    const p = path + f;
    return `<li><details data-folder="${esc(p)}"${shut.has(p) ? "" : " open"}><summary><i class="chev">${ico("chev")}</i>${ico("folder")}<span>${esc(f)}</span></summary>${draw(sub, p + "/")}</details></li>`;
  }).join("")}${tr.notes.map((n) => row(n)).join("")}</ul>`;
  $("tree").innerHTML = notes.length ? draw(tree(notes.map((n) => n.name)), "") : "";
}

// Full screen: the open note alone, no header or sidebar. Off until the icon turns it
// on; it then holds from note to note until the icon or Esc turns it off. With no note
// open the page is never full screen: picking one needs the sidebar.
let full = false;
function setFull(on: boolean) { full = on; drawPane(); }

function drawPane() {
  const has = !!open;
  document.body.classList.toggle("full", has && full);
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
  if (conflict) {
    m.innerHTML = `<span class="warnw">This note changed somewhere else since you opened it.</span><span class="acts"><button class="btn ghost" id="theirs">Load theirs</button><button class="btn pri" id="mine">Keep mine</button></span>`;
    $("theirs").onclick = () => { const c = conflict!; conflict = null; dirty = false; base = c.mtime; setText(c.text, false); drawMeta(); };
    $("mine").onclick = () => { base = conflict!.mtime; conflict = null; void flush(); };
    return;
  }
  if (confirmDelete) {
    m.innerHTML = `<span>Move this note to <code>notes/.trash</code>?</span><span class="acts"><button class="btn ghost" id="cancel">Cancel</button><button class="btn danger" id="del">Delete</button></span>`;
    $("cancel").onclick = () => { confirmDelete = false; drawMeta(); };
    $("del").onclick = () => { confirmDelete = false; void remove(); };
    return;
  }
  const where = folderOf(open);
  m.innerHTML = `<span>${where ? esc(where) : "Notes"}</span><span>·</span><span id="saved">${state ?? (dirty ? "Not saved yet" : "Saved")}</span><span class="sp"></span><button class="ib" id="full" title="${full ? "Exit full screen (Esc)" : "Full screen"}" aria-label="${full ? "Exit full screen" : "Full screen"}">${ico(full ? "min" : "max")}</button><button class="ib" id="trash" title="Delete note" aria-label="Delete note">${ico("trash")}</button>`;
  $("trash").onclick = () => { confirmDelete = true; drawMeta(); };
  $("full").onclick = () => setFull(!full);
}

function drawLinks() {
  const box = $("links");
  if (!open) { box.hidden = true; return; }
  const names = notes.map((n) => n.name);
  const from = notes.filter((n) => n.name !== open && wikilinks(n.text).some((l) => resolve(l.name, names) === open));
  box.hidden = !from.length;
  box.innerHTML = `<h3>Linked from</h3><ul>${from.map((n) => `<li><button class="nt" data-open="${esc(n.name)}"><span class="nm">${esc(last(n.name))}</span>${folderOf(n.name) ? `<span class="fd">${esc(folderOf(n.name))}</span>` : ""}</button></li>`).join("")}</ul>`;
}

function age(ms: number) {
  const s = (Date.now() - ms) / 1000;
  return s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
}

// ---- wiring

document.addEventListener("click", (e) => {
  // The narrow layout's drawer closes on any click outside it.
  const tg = e.target as HTMLElement;
  if (document.body.classList.contains("side-open") && !tg.closest?.(".side,#side")) document.body.classList.remove("side-open");
  const el = (e.target as HTMLElement).closest?.("[data-open],[data-tag]") as HTMLElement | null;
  if (!el || el.closest(".cm-editor")) return;
  if (el.dataset.open) void openNote(el.dataset.open);
  else if (el.dataset.tag) { const q = $<HTMLInputElement>("q"); q.value = q.value === "#" + el.dataset.tag ? "" : "#" + el.dataset.tag; drawSide(); }
});
$("tree").addEventListener("toggle", (e) => {
  const d = e.target as HTMLDetailsElement;
  if (d.dataset.folder) d.open ? shut.delete(d.dataset.folder) : shut.add(d.dataset.folder);
}, true);
$("q").addEventListener("input", drawSide);
$("new").onclick = () => void newNote();
$("new2").onclick = () => void newNote();
$("side").onclick = () => document.body.classList.toggle("side-open");
const title = $<HTMLInputElement>("title");
title.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); title.blur(); }
  if (e.key === "Escape") { title.value = open ?? ""; title.blur(); }
});
title.addEventListener("blur", () => void rename(title.value));
document.addEventListener("keydown", (e) => {
  // Esc in the name or search field is theirs (it undoes a rename there).
  if (e.key !== "Escape" || (e.target as HTMLElement).matches?.("input")) return;
  document.body.classList.remove("side-open");
  if (document.body.classList.contains("full")) setFull(false);
});
// Closing with text not on disk: the browser asks first.
addEventListener("beforeunload", (e) => { if (dirty) e.preventDefault(); });
// Leaving with unsaved text: a keepalive request outlives the page.
addEventListener("pagehide", () => {
  if (open && dirty && !conflict) fetch("/vault", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ dir, op: "save", name: open, text: view.state.sliceDoc(), base }) });
});

// The project: ?dir= in the URL, else the one the board picked last, else where it started.
(async () => {
  try { const th = localStorage.getItem("kz-theme"); if (th) document.documentElement.dataset.theme = th; } catch { /* no storage */ }
  let S: { dir: string | null; projects: { dir: string; label: string }[] };
  try { S = await (await fetch("/state")).json(); } catch { toast("The board is not running"); return; }
  let kept: string | null = null;
  try { kept = localStorage.getItem("kz-proj"); } catch { /* no storage */ }
  const want = new URLSearchParams(location.search).get("dir");
  const known = (d: string | null) => !!d && S.projects.some((p) => p.dir === d);
  dir = [want, kept, S.dir].find(known) ?? S.projects[0]?.dir ?? "";
  const sel = $<HTMLSelectElement>("proj");
  sel.innerHTML = S.projects.map((p) => `<option value="${esc(p.dir)}"${p.dir === dir ? " selected" : ""}>${esc(p.label)}</option>`).join("");
  sel.onchange = async () => {
    if (!(await openNote(null))) { sel.value = dir; return; }
    dir = sel.value;
    // window.: `history` here is CodeMirror's undo extension.
    const u = new URL(location.href); u.searchParams.set("dir", dir); window.history.replaceState(null, "", u);
    await load();
  };
  await load();
  let again: string | null = null;
  try { again = sessionStorage.getItem("kz-note:" + dir); } catch { /* no storage */ }
  if (again && notes.some((n) => n.name === again)) await openNote(again);
  // Every write under a state dir arrives as `changed`, this page's own saves included.
  const listen = () => {
    const es = new EventSource("/events");
    es.onmessage = (ev) => { if (ev.data === "changed") void load(); };
    es.onerror = () => { es.close(); setTimeout(listen, 3000); };
  };
  listen();
})();
