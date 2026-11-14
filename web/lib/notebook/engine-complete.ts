// The two completion lists: `/` at the start of a line offers the blocks (nobody has to remember markdown), and `[[`
// offers notes, runs and tasks. They are CodeMirror's autocomplete tooltip, styled by the page.
import { startCompletion, type CompletionContext, type Completion } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { resolveRun, TABS } from "./text.ts";
import type { EditorHost } from "./engine-types.ts";

// The `/` menu: at the start of a line, `/` offers the blocks, so nobody has to
// remember markdown. Picking one replaces the `/word` with the block's source; `|`
// in the text marks where the cursor lands.
export const BLOCKS: [string, string, string][] = [
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
  ["Link to run", "[[run:|]]", "board"],
  ["Tag", "#|", "#"],
];
export function slash(cx: CompletionContext) {
  const m = cx.matchBefore(/^[ \t]*\/[\w ]*$/);
  if (!m) return null;
  const at = m.from + m.text.indexOf("/");
  return {
    from: at,
    filter: true,
    validFor: /^\/[\w ]*$/,
    // Boosted in list order, so an unfiltered menu reads as written above.
    options: BLOCKS.map(([label, src, detail], i): Completion => ({
      label: "/" + label.toLowerCase(),
      displayLabel: label,
      detail,
      boost: 50 - i,
      apply: (view, _c, from, to) => {
        // Straight under a line of text, `---` would underline it into a heading and a
        // table would join its paragraph: both need a blank line above.
        const line = view.state.doc.lineAt(from);
        const gap =
          (label === "Divider" || label === "Table") &&
          line.number > 1 &&
          view.state.doc.line(line.number - 1).text.trim()
            ? "\n"
            : "";
        const text = gap + src.replace("|", ""),
          caret = from + gap.length + src.indexOf("|");
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: caret },
          userEvent: "input.complete",
        });
        // A link is only begun: the next list offers what it can point at.
        if (label.startsWith("Link to")) setTimeout(() => startCompletion(view));
      },
    })),
  };
}

// `[[` offers notes, runs and tasks; `#` after a run offers its tabs, findings and
// backlog items. Picking one closes the link unless it is a run, which leaves the
// cursor before `]]` so a `#` can follow.
export const links = (host: EditorHost) => (cx: CompletionContext) => {
  const m = cx.matchBefore(/\[\[[^\]\n|]*$/);
  if (!m) return null;
  const q = m.text.slice(2),
    close = cx.state.sliceDoc(cx.pos, cx.pos + 2) === "]]";
  const put = (text: string, stay: boolean) => (view: EditorView, _c: Completion, from: number, to: number) => {
    view.dispatch({
      changes: { from, to, insert: text + (close ? "" : "]]") },
      selection: { anchor: from + text.length + (stay ? 0 : 2) },
      userEvent: "input.complete",
    });
  };
  const anchor = /^run:\s*([\w.-]+)#([\w-]*)$/i.exec(q);
  if (anchor) {
    const id = resolveRun(
        anchor[1]!,
        host.board().runs.map((r) => r.id),
      ),
      run = host.board().runs.find((r) => r.id === id);
    if (!run) return null;
    const cut = (t: string) => (t.length > 60 ? t.slice(0, 59) + "…" : t);
    return {
      from: cx.pos - anchor[2]!.length,
      validFor: /^[\w-]*$/,
      options: [
        ...TABS.map((t, i): Completion => ({ label: t, detail: "tab", boost: 20 - i, apply: put(t, false) })),
        ...run.findings.map((f): Completion => ({
          label: `finding-${f.n}`,
          detail: cut(f.text) + (f.done ? " (closed)" : ""),
          apply: put(`finding-${f.n}`, false),
        })),
        ...run.backlog.map((b): Completion => ({
          label: `backlog-${b.n}`,
          detail: `${b.status}: ${cut(b.text)}`,
          apply: put(`backlog-${b.n}`, false),
        })),
      ],
    };
  }
  return {
    from: m.from + 2,
    validFor: /^[^\]\n|#]*$/,
    options: [
      ...host.names().map((n): Completion => ({ label: n, detail: "note", apply: put(n, false) })),
      // Newest first, by the name the board shows; the full id is what gets written.
      ...[...host.board().runs]
        .sort((a, b) => b.id.localeCompare(a.id))
        .map((r, i): Completion => ({
          label: "run:" + r.id,
          displayLabel: r.short,
          detail: r.id.slice(0, 10) + " · " + r.title,
          boost: Math.max(-99, 60 - i),
          apply: put("run:" + r.id, true),
        })),
      ...host.board().ideas.map((i): Completion => ({
        label: "idea:" + i.text,
        detail: "idea",
        apply: put("idea:" + i.text, false),
      })),
    ],
  };
};
