// The note editor: CodeMirror 6 with the live preview, the `/` and `[[` menus and the markdown keys, made once per open
// note (the page keys it by name) and thrown away with it, so its cursor, scroll and undo history live exactly as long as the
// note stays open. The page reaches it only through the handle `createEditor` returns and the `EditorHost` it hands in.
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { markdown, markdownLanguage, markdownKeymap } from "@codemirror/lang-markdown";
import { autocompletion } from "@codemirror/autocomplete";
import { focused, focusSet, tableField } from "./engine-widgets.ts";
import { clicks, look, preview, refresh } from "./engine-preview.ts";
import { links, slash } from "./engine-complete.ts";
import type { EditorHost } from "./engine-types.ts";

export type EditorHandle = {
  text(): string; // the note as it would be written
  replace(text: string): void; // someone else's version: not the person's edit, cursor kept
  refresh(): void; // the list of notes or the board's items changed: redraw links
  focus(): void;
  destroy(): void;
};

const exts = (host: EditorHost, crlf: boolean, typed: () => boolean) => [
  autocompletion({ override: [slash, links(host)], icons: false }),
  history(),
  keymap.of([
    ...markdownKeymap,
    ...defaultKeymap,
    ...historyKeymap,
    indentWithTab,
    {
      key: "Mod-s",
      run: () => {
        host.save();
        return true;
      },
    },
  ]),
  markdown({ base: markdownLanguage }),
  syntaxHighlighting(look),
  EditorView.lineWrapping,
  EditorView.contentAttributes.of({ "aria-label": "Note", spellcheck: "true" }),
  focused,
  EditorView.focusChangeEffect.of((_s, on) => focusSet.of(on)),
  tableField,
  preview(host),
  clicks(host),
  EditorView.updateListener.of((u) => {
    if (u.docChanged && typed()) host.edited();
  }),
  crlf ? EditorState.lineSeparator.of("\r\n") : [],
];

export function createEditor(parent: HTMLElement, text: string, host: EditorHost): EditorHandle {
  let loading = false; // a replace in progress is not the person's edit
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: text, extensions: exts(host, text.includes("\r\n"), () => !loading) }),
  });
  return {
    text: () => view.state.sliceDoc(),
    replace(next) {
      loading = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
        selection: { anchor: Math.min(view.state.selection.main.head, next.length) },
      });
      loading = false;
    },
    refresh: () => view.dispatch({ effects: refresh.of(null) }),
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
