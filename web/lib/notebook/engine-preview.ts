// The live preview: markdown hidden and typeset on every line the cursor is not on (decorations from the syntax tree, plus
// wikilinks and tags, which are not markdown), the highlight style, and what a click on the typeset parts does.
import { EditorView, Decoration, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { StateEffect, type Range } from "@codemirror/state";
import { syntaxTree, HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { wikilinks, tags, resolve, safeUrl, boardLink, resolveRun, anchorWords, type BoardLink } from "./text.ts";
import { Bullet, BoardChip, Check, Img, Rule } from "./engine-widgets.ts";
import type { Board, EditorHost } from "./engine-types.ts";

// A link to the board: where it goes, what the chip says, and whether it is there.
export function boardTarget(l: BoardLink, board: Board, dir: string) {
  const q = (o: Record<string, string>) => "/?" + new URLSearchParams({ all: "1", dir, ...o }).toString();
  if (l.kind === "idea") {
    const t = l.text.toLowerCase();
    const task =
      board.ideas.find((i) => i.text.toLowerCase() === t) ??
      board.ideas.find((i) => i.text.toLowerCase().startsWith(t));
    return {
      name: task?.text ?? l.text,
      sub: "idea",
      status: task?.status ?? "",
      href: task ? q({ idea: task.text }) : null,
    };
  }
  const id = resolveRun(
      l.id,
      board.runs.map((r) => r.id),
    ),
    run = board.runs.find((r) => r.id === id);
  const item = l.item && run && (l.item.type === "finding" ? run.findings : run.backlog).some((x) => x.n === l.item!.n);
  const ok = !!run && (!l.item || item);
  return {
    name: run?.short ?? l.id,
    sub: anchorWords(l),
    status: run?.status ?? "",
    href: ok
      ? q({ run: run!.id, ...(l.tab ? { tab: l.tab } : {}), ...(l.item ? { item: `${l.item.type}-${l.item.n}` } : {}) })
      : null,
  };
}
// Leave for the board only once the note is on disk.

const hide = Decoration.replace({});
export const refresh = StateEffect.define<null>(); // the list of notes changed: redraw missing links

function build(view: EditorView, host: EditorHost): DecorationSet {
  const { state } = view,
    doc = state.doc,
    out: Range<Decoration>[] = [];
  const live = new Set<number>();
  // Only a focused editor has a cursor line: a note just opened reads fully typeset.
  if (view.hasFocus)
    for (const r of state.selection.ranges)
      for (let l = doc.lineAt(r.from).number; l <= doc.lineAt(r.to).number; l++) live.add(l);
  const on = (pos: number) => live.has(doc.lineAt(pos).number);
  // A plugin may not replace a line break: anything that would is left as written.
  const put = (d: Decoration, from: number, to: number) => {
    if (doc.lineAt(from).number === doc.lineAt(to).number) out.push(d.range(from, to));
  };
  const lines = (from: number, to: number, cls: string) => {
    for (let l = doc.lineAt(from).number; l <= doc.lineAt(to).number; l++)
      out.push(Decoration.line({ class: cls }).range(doc.line(l).from));
  };
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(n) {
        const name = n.name;
        const h = /^ATXHeading(\d)$/.exec(name);
        if (h) {
          lines(n.from, n.from, `cm-h cm-h${Math.min(+h[1]!, 4)}`);
          return;
        }
        if (name === "HeaderMark" && n.node.parent?.name.startsWith("ATX")) {
          if (!on(n.from))
            put(
              hide,
              n.from,
              Math.min(n.to + (doc.sliceString(n.to, n.to + 1) === " " ? 1 : 0), doc.lineAt(n.from).to),
            );
          return;
        }
        if (
          name === "EmphasisMark" ||
          name === "StrikethroughMark" ||
          (name === "CodeMark" && n.node.parent?.name === "InlineCode")
        ) {
          if (!on(n.from)) put(hide, n.from, n.to);
          return;
        }
        if (name === "Blockquote") {
          lines(n.from, n.to, "cm-quote");
          return;
        }
        if (name === "QuoteMark") {
          if (!on(n.from))
            put(
              hide,
              n.from,
              Math.min(n.to + (doc.sliceString(n.to, n.to + 1) === " " ? 1 : 0), doc.lineAt(n.from).to),
            );
          return;
        }
        if (name === "FencedCode") {
          lines(n.from, n.to, "cm-fence");
          out.push(
            Decoration.line({ class: "cm-fence-a" }).range(doc.lineAt(n.from).from),
            Decoration.line({ class: "cm-fence-z" }).range(doc.lineAt(n.to).from),
          );
          return false;
        }
        if (name === "HorizontalRule") {
          if (!on(n.from)) put(Decoration.replace({ widget: new Rule() }), n.from, n.to);
          return;
        }
        if (name === "ListMark" && n.node.parent?.parent?.name === "BulletList") {
          if (on(n.from)) return;
          const task = n.node.nextSibling?.name === "Task";
          put(
            task ? hide : Decoration.replace({ widget: new Bullet() }),
            n.from,
            task ? Math.min(n.to + 1, doc.lineAt(n.from).to) : n.to,
          );
          return;
        }
        if (name === "TaskMarker") {
          if (!on(n.from))
            put(
              Decoration.replace({ widget: new Check(/x/i.test(doc.sliceString(n.from, n.to)), n.from) }),
              n.from,
              n.to,
            );
          return;
        }
        if (name === "Image") {
          const url = n.node.getChild("URL"),
            marks = n.node.getChildren("LinkMark");
          if (on(n.from) || !url || marks.length < 2) return false;
          const src = safeUrl(doc.sliceString(url.from, url.to));
          if (src && /^https?:/i.test(src))
            put(
              Decoration.replace({ widget: new Img(src, doc.sliceString(marks[0]!.to, marks[1]!.from)) }),
              n.from,
              n.to,
            );
          return false;
        }
        if (name === "Link") {
          const url = n.node.getChild("URL"),
            marks = n.node.getChildren("LinkMark");
          // Only the inline form `[text](url)`; a reference link stays as written.
          if (!url || marks.length < 4) return;
          const href = safeUrl(doc.sliceString(url.from, url.to));
          const text = { from: marks[0]!.to, to: marks[1]!.from };
          // A link to somewhere safeUrl refuses stays as written, so what it points at is visible.
          if (on(n.from) || !href) {
            out.push(Decoration.mark({ class: "cm-link-src" }).range(n.from, n.to));
            return;
          }
          if (text.to > text.from)
            out.push(
              Decoration.mark({ class: "cm-link", attributes: { "data-href": href } }).range(text.from, text.to),
            );
          put(hide, marks[0]!.from, marks[0]!.to);
          put(hide, marks[1]!.from, n.to);
          return;
        }
        if (name === "URL" && n.node.parent?.name !== "Link" && n.node.parent?.name !== "Image") {
          const href = safeUrl(doc.sliceString(n.from, n.to));
          out.push(
            Decoration.mark({ class: "cm-link", attributes: href && !on(n.from) ? { "data-href": href } : {} }).range(
              n.from,
              n.to,
            ),
          );
        }
      },
    });
  }
  // Wikilinks and tags are not markdown: found by notes-lib over the text.
  // ponytail: the whole note is scanned on each redraw; limit to visible ranges if notes reach megabytes.
  const text = doc.toString(),
    names = host.names();
  for (const w of wikilinks(text)) {
    const bl = boardLink(w);
    if (bl) {
      if (on(w.from)) {
        out.push(Decoration.mark({ class: "cm-wiki" }).range(w.from, w.to));
        continue;
      }
      const t = boardTarget(bl, host.board(), host.dir());
      put(
        Decoration.replace({
          widget: new BoardChip(w.label !== w.target ? w.label : t.name, t.sub, t.status, t.href, host),
        }),
        w.from,
        w.to,
      );
      continue;
    }
    const target = resolve(w.name, names);
    const cls = "cm-wiki" + (target ? "" : " cm-wiki-missing");
    if (on(w.from)) {
      out.push(Decoration.mark({ class: cls }).range(w.from, w.to));
      continue;
    }
    const labelAt = text.lastIndexOf(w.label, w.to - 2);
    const lf = labelAt > w.from ? labelAt : w.from + 2,
      lt = lf + w.label.length;
    put(hide, w.from, lf);
    out.push(Decoration.mark({ class: cls, attributes: { "data-note": target ?? w.name } }).range(lf, lt));
    put(hide, lt, w.to);
  }
  for (const g of tags(text))
    out.push(
      Decoration.mark({ class: "cm-tag", attributes: on(g.from) ? {} : { "data-tag": g.tag } }).range(g.from, g.to),
    );
  return Decoration.set(out, true);
}

export const preview = (host: EditorHost) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view, host);
      }
      update(u: ViewUpdate) {
        if (
          u.docChanged ||
          u.viewportChanged ||
          u.selectionSet ||
          u.focusChanged ||
          syntaxTree(u.startState) !== syntaxTree(u.state) ||
          u.transactions.some((tr) => tr.effects.some((e) => e.is(refresh)))
        )
          this.decorations = build(u.view, host);
      }
    },
    { decorations: (v) => v.decorations },
  );

export const look = HighlightStyle.define([
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  {
    tag: t.monospace,
    fontFamily: "var(--mono)",
    fontSize: "0.86em",
    background: "var(--bg)",
    borderRadius: "var(--r-s)",
    padding: "1px 4px",
  },
  { tag: [t.processingInstruction, t.meta, t.url, t.labelName, t.contentSeparator], color: "var(--dim)" },
  { tag: t.link, color: "var(--accent)" },
  { tag: t.quote, color: "var(--dim)" },
]);

// Clicks on what the preview drew: a link opens, a wikilink opens its note, a tag filters.
export const clicks = (host: EditorHost) =>
  EditorView.domEventHandlers({
    mousedown(e) {
      const el = (e.target as HTMLElement).closest?.("[data-href],[data-note],[data-tag]") as HTMLElement | null;
      if (!el || e.button !== 0) return false;
      e.preventDefault();
      const href = el.dataset.href;
      // A relative link is a note (`[x](Other%20note.md)`), as in Obsidian; the rest open in a tab.
      if (href && !/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        let name = href;
        try {
          name = decodeURIComponent(href);
        } catch {
          /* as written */
        }
        const hit = resolve(name.split("#")[0]!, host.names());
        hit ? host.openNote(hit) : host.toast(`No note named ${name}`);
      } else if (href) window.open(href, "_blank", "noopener");
      else if (el.dataset.note) host.openOrCreate(el.dataset.note);
      else if (el.dataset.tag) {
        host.search("#" + el.dataset.tag);
      }
      return true;
    },
  });
