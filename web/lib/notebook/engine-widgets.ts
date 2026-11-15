// The live preview's widgets: what replaces markdown the cursor is not on (a checkbox, a bullet, a rule, an image, a table,
// a chip for a link to the board), and the table decorations. Cells and chips are text nodes: nothing in a note becomes markup.
import { EditorView, Decoration, WidgetType, type DecorationSet } from "@codemirror/view";
import { EditorState, StateEffect, StateField, type Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { parseTable } from "./text.ts";

// What the page lets a widget do: leave for the board (the note is written first) and say something.
export type WidgetHost = { go(href: string): void; toast(msg: string): void };

export class Check extends WidgetType {
  constructor(
    readonly on: boolean,
    readonly at: number,
  ) {
    super();
  }
  eq(o: Check) {
    return o.on === this.on && o.at === this.at;
  }
  toDOM(view: EditorView) {
    const b = document.createElement("input");
    b.type = "checkbox";
    b.checked = this.on;
    b.className = "cm-task";
    b.setAttribute("aria-label", this.on ? "done" : "to do");
    b.addEventListener("mousedown", (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.at, to: this.at + 3, insert: this.on ? "[ ]" : "[x]" } });
    });
    return b;
  }
  ignoreEvent() {
    return true;
  }
}
export class Bullet extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-bullet";
    s.textContent = "•";
    return s;
  }
}
export class Rule extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-rule";
    return s;
  }
}
export class Img extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }
  eq(o: Img) {
    return o.src === this.src && o.alt === this.alt;
  }
  toDOM() {
    const i = document.createElement("img");
    i.src = this.src;
    i.alt = this.alt;
    i.className = "cm-img";
    return i;
  }
}

// A table the cursor is not in is drawn as one; clicking it puts the cursor in its
// source. Cells are text nodes: nothing in a note becomes markup.
export class TableView extends WidgetType {
  constructor(
    readonly src: string,
    readonly at: number,
  ) {
    super();
  }
  eq(o: TableView) {
    return o.src === this.src && o.at === this.at;
  }
  toDOM(view: EditorView) {
    const t = parseTable(this.src),
      wrap = document.createElement("div"),
      table = document.createElement("table");
    wrap.className = "cm-table";
    const row = (cells: string[], tag: "th" | "td") => {
      const tr = document.createElement("tr");
      cells.forEach((c, i) => {
        const el = document.createElement(tag);
        el.textContent = c;
        if (t.align[i]) el.style.textAlign = t.align[i]!;
        tr.append(el);
      });
      return tr;
    };
    const head = document.createElement("thead"),
      body = document.createElement("tbody");
    head.append(row(t.head, "th"));
    t.rows.forEach((r) => body.append(row(r, "td")));
    table.append(head, body);
    wrap.append(table);
    wrap.addEventListener("mousedown", (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: this.at } });
      view.focus();
    });
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}
// Whether the editor has focus, as state: an unfocused editor shows every table drawn.
export const focusSet = StateEffect.define<boolean>();
export const focused = StateField.define<boolean>({
  create: () => false,
  update: (v, tr) => tr.effects.reduce((f, e) => (e.is(focusSet) ? e.value : f), v),
});
// Block widgets may span lines, which a view plugin may not do: tables live in a field.
function tables(state: EditorState) {
  const out: Range<Decoration>[] = [],
    sel = state.selection.main,
    live = state.field(focused, false);
  syntaxTree(state).iterate({
    enter(n) {
      if (n.name !== "Table") return;
      const from = state.doc.lineAt(n.from).from,
        to = state.doc.lineAt(n.to).to;
      if (live && sel.to >= from && sel.from <= to) return false;
      out.push(
        Decoration.replace({ widget: new TableView(state.sliceDoc(from, to), from), block: true }).range(from, to),
      );
      return false;
    },
  });
  return Decoration.set(out);
}
export const tableField = StateField.define<DecorationSet>({
  create: tables,
  update: (v, tr) =>
    tr.docChanged ||
    tr.selection ||
    tr.effects.some((e) => e.is(focusSet)) ||
    syntaxTree(tr.startState) !== syntaxTree(tr.state)
      ? tables(tr.state)
      : v,
  provide: (f) => EditorView.decorations.from(f),
});

// A link to the board is a chip: the card's state icon, its name, and what the link points at inside it.
export const ICON: Record<string, string> = {
  idea: "idea",
  starting: "idea",
  running: "run",
  stalled: "stall",
  waiting: "wait",
  done: "done",
  abandoned: "aband",
};

// An <svg><use href="#id"/></svg> from the page's sprite sheet.
function sprite(id: string) {
  const ns = "http://www.w3.org/2000/svg",
    s = document.createElementNS(ns, "svg"),
    u = document.createElementNS(ns, "use");
  u.setAttribute("href", "#" + id);
  s.append(u);
  return s;
}
export class BoardChip extends WidgetType {
  constructor(
    readonly name: string,
    readonly sub: string,
    readonly status: string,
    readonly href: string | null,
    readonly host: WidgetHost,
  ) {
    super();
  }
  eq(o: BoardChip) {
    return o.name === this.name && o.sub === this.sub && o.status === this.status && o.href === this.href;
  }
  toDOM() {
    const c = document.createElement("span");
    c.className = "cm-board" + (this.href ? "" : " cm-board-missing");
    c.title = this.href ? "Open on the board" : "Not on the board";
    if (this.status) {
      const ic = document.createElement("span");
      ic.className = "st d-" + (ICON[this.status] ?? "idea");
      ic.append(sprite("s-" + (ICON[this.status] ?? "idea")));
      c.append(ic);
    }
    c.append(this.name);
    if (this.sub) {
      const s = document.createElement("span");
      s.className = "sub";
      s.textContent = "› " + this.sub;
      c.append(s);
    }
    c.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (this.href) this.host.go(this.href);
      else this.host.toast("That is not on the board");
    });
    return c;
  }
  ignoreEvent() {
    return true;
  }
}
