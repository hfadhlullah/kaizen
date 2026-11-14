// Keeps the React layers in order (see web/README.md and .kaizen/notes/Project/Conventions and gotchas.md):
//   pages -> components -> ui -> lib/core/utils.ts, and lib imports only lib.
// A page or component never imports a Radix package (or cmdk) itself: popups come from web/ui.
// components/ and lib/ hold feature folders only; each has an index.ts, stays small, and is imported through it.
import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const web = dirname(import.meta.dir);
type Layer = "ui" | "components" | "pages" | "lib";
const LAYERS: Layer[] = ["ui", "components", "pages", "lib"];
// What each layer may import from this repo, by layer; ui may take lib/core/utils.ts only.
const MAY: Record<Layer, Layer[]> = {
  ui: ["ui", "lib"],
  components: ["ui", "components", "lib"],
  pages: ["ui", "components", "pages", "lib"],
  lib: ["lib"],
};
const PRIMITIVES = /^(radix-ui|@radix-ui\/.+|cmdk)$/;

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(join(dir, e.name))
      : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
        ? [join(dir, e.name)]
        : [],
  );
const specifiers = (src: string) =>
  [...src.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g)].map((m) => m[1]!);
const layerOf = (abs: string): string => relative(web, abs).split(/[\\/]/)[0]!;

// Every rule broken by `files` (absolute path -> source), as readable lines.
function violations(files: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [file, src] of Object.entries(files)) {
    const from = layerOf(file) as Layer;
    for (const spec of specifiers(src)) {
      const where = `${relative(web, file)} imports "${spec}"`;
      if (!isLocal(spec)) {
        if (from !== "ui" && PRIMITIVES.test(spec))
          out.push(`${where}: use the piece in web/ui instead of the package`);
        continue;
      }
      const target = resolveSpec(file, spec),
        to = layerOf(target);
      if (!LAYERS.includes(to as Layer))
        out.push(`${where}: ${from}/ may not import ${to === ".." ? "outside web/" : "web/" + to}`);
      else if (!MAY[from].includes(to as Layer))
        out.push(`${where}: ${from}/ may not import ${to}/ (imports only go downward)`);
      else if (from === "ui" && to === "lib" && !/^lib[\\/]core[\\/]utils\.ts$/.test(relative(web, target)))
        out.push(`${where}: ui/ takes only lib/core/utils.ts`);
    }
  }
  return out;
}

test("web/ui, components, pages and lib only import downward, and only ui wraps the primitive packages", () => {
  const files = Object.fromEntries(LAYERS.flatMap((l) => walk(join(web, l))).map((f) => [f, readFileSync(f, "utf8")]));
  expect(Object.keys(files).length).toBeGreaterThan(20);
  expect(violations(files)).toEqual([]);
});

test("the check itself fails on an upward import, a lib import of ui, a ui import beyond utils, and a Radix import in a page", () => {
  const f = (layer: string, name: string) => join(web, layer, name);
  const bad = violations({
    [f("ui", "a.tsx")]: 'import { X } from "../components/x.tsx";',
    [f("ui", "b.tsx")]: 'import { y } from "../lib/core/store.ts";',
    [f("components", "c.tsx")]: 'import { P } from "../pages/p.tsx";',
    [f("lib", "d.ts")]: 'import { Button } from "../ui/button.tsx";',
    [f("pages", "e.tsx")]: 'import { Popover } from "radix-ui";',
    [f("components", "g.tsx")]: 'import * as P from "@radix-ui/react-popover";',
    [f("pages", "h.tsx")]: 'import { go } from "../board/views.ts";',
  });
  expect(bad.length).toBe(7);
  expect(
    violations({
      [f("ui", "ok.tsx")]:
        'import { cn } from "../lib/core/utils.ts"; import { Icon } from "./icon.tsx"; import { Popover } from "radix-ui";',
      [f("pages", "ok.tsx")]:
        'import { Chip } from "../components/shared/chip.tsx"; import { Button } from "../ui/button.tsx"; import { x } from "../lib/core/store.ts";',
    }),
  ).toEqual([]);
});

// A popup, dialog or list box is a piece from web/ui (Radix draws it, in #kz-portal); a page, component or lib file
// never builds one by hand or draws HTML strings.
const HAND_BUILT =
  /<dialog\b|createElement\(["']dialog|role=["'](?:dialog|alertdialog|listbox)["']|menu-pop|innerHTML|dangerouslySetInnerHTML/;
const handBuilt = (files: Record<string, string>) =>
  Object.entries(files).flatMap(([f, src]) =>
    HAND_BUILT.test(src) ? [`${relative(web, f)} builds a popup or HTML by hand`] : [],
  );
test("no page, component or lib file hand-builds a dialog, menu or list box, or sets innerHTML", () => {
  const files = Object.fromEntries(
    ["components", "pages", "lib"].flatMap((l) => walk(join(web, l))).map((f) => [f, readFileSync(f, "utf8")]),
  );
  expect(handBuilt(files)).toEqual([]);
  // ...and it does catch one.
  expect(
    handBuilt({
      [join(web, "components", "x.tsx")]: '<div role="dialog">',
      [join(web, "pages", "y.tsx")]: "el.innerHTML = a",
      [join(web, "components", "z.tsx")]: "<Dialog>",
    }).length,
  ).toBe(2);
});

// workspace.ts is shared with the notebook and Video bundles. The Projects list, its filter, the worktree menu and the
// resource popup are React (components/rail, components/resources): the board mounts them (react-mount.ts), the Notebook
// page gets the list and filter from the kit it mounts itself (kit.ts, in notebook.js), and Video lists no projects. What
// stays here opens the Add a project sheet only through the onBoard() guard or the kit, and settings.ts / tasks-page.tsx
// never wipe a header host another part mounted (#ptabs, #psub, #hx).
test("shared side-menu code only opens React hosts the page has; no page wipes a mounted host", () => {
  const rd = (p: string) => readFileSync(join(web, p), "utf8");
  const ws = rd("board/workspace.ts");
  expect(ws.match(/\bopenAdd\(/g)?.length).toBe(3); // the board branch, the kit's, and the ?add= arrival
  expect(ws).toMatch(/function addProject[\s\S]*?if \(onBoard\(\)\) return openAdd[\s\S]*?kitFor\(\)\.then\(\(k\) => k\.openAdd\(o\), \(\) => leave\(/);
  // The list and the popups are gone from the old code and have a mount on each page that has them.
  expect(ws).not.toMatch(/drawList|drawPop|pfpop|wsMenu|rankDrag|innerHTML = drawn/);
  expect(existsSync(join(web, "board/resources.ts"))).toBe(false);
  expect(ws).toMatch(/!onBoard\(\) && kitHere\(\)\) void kitFor\(\)\.then\(\(k\) => connectRail\(k\.rail\)/);
  expect(rd("board/react-mount.ts")).toMatch(/\["plist", RailList\], \["pfilter-host", RailFilter\]\] as const/);
  // The footer's resource button is part of the footer bar now.
  expect(rd("components/footer/foot-bar.tsx")).toMatch(/<ResourcesButton \/>/);
  expect(rd("notebook/kit.ts")).toMatch(/\["plist",\s*RailList\],\s*\["pfilter-host",\s*RailFilter\]/);
  for (const f of ["board", "notes", "video"]) expect(rd(`html/${f}.html`)).toContain('<span id="pfilter-host" style="display:contents"></span>');
  expect(rd("html/board.html")).toContain('<footer class="foot kz-ui" id="foot"');
  // Search: the notebook page opens the palette from the kit and falls back to the board; every page load from the palette
  // goes through go(), which writes the notebook's open note first.
  const se = rd("board/search.ts");
  expect(se).toMatch(/kitFor\(\)\.then\([\s\S]*?\(\) => leave\("\/\?view=board&search=1"\)/);
  expect(se.match(/location\.href =/g)?.length).toBe(2); // go() on the board and leave()'s own
  expect(rd("board/settings.ts")).not.toMatch(/\$\("(?:ptabs|psub)"\)\.(?:innerHTML|textContent)\s*=/);
  expect(rd("pages/tasks-page.tsx")).not.toMatch(/getElementById\("hx"\)\?*\.replaceChildren/);
});

// The run workspace centre: the panes, the layout tree, the gutters, the Browser tab and the panel grip are React
// (components/run, components/panes, lib/run). run-view.ts holds the plumbing (which items the workspace has, sessions,
// keys); it builds no pane, gutter, frame or terminal element and no Preview tab (components/panes/preview-pane.tsx).
test("run-view.ts builds no pane, gutter, frame or terminal element and keeps no layout tree of its own", () => {
  const src = readFileSync(join(web, "board/run-view.ts"), "utf8");
  expect(src).not.toMatch(/createElement\(["'`](?:section|header|iframe|webview)/);
  expect(src).not.toMatch(/makePane|\.rtree|\.rgut|kz-runtabs|splitAt|termLoad|new Map<string, \{ el:/);
  const ui = readFileSync(join(web, "html/board.html"), "utf8");
  expect(ui).not.toMatch(/\.rtree|\.rgut|\.rdrop|id="rgrip"/);
  // The Preview tab is React over lib/run/preview.ts: no HTML strings, no leftover classes.
  expect(src).not.toMatch(/previewPane|directPreview|insertAdjacentHTML|mountPreview/);
  expect(ui).not.toMatch(/\.rprev|\.shots\b|\.rnone/);
  expect(readFileSync(join(web, "components/panes/preview-pane.tsx"), "utf8")).not.toMatch(/innerHTML/);
});

// The floating Home window and the phone's Home and Runs pages are React (components/home, components/phone; state and rules
// in lib/home, lib/phone). board/home-ws.ts only wires the events the old code sees and board/phone.ts is gone; neither
// builds markup, and the page's own CSS keeps none of their old rules.
test("the Home window and the phone pages are drawn by React, not by board/ modules or board.html", () => {
  expect(existsSync(join(web, "board/phone.ts"))).toBe(false);
  const ws = readFileSync(join(web, "board/home-ws.ts"), "utf8");
  expect(ws).not.toMatch(/innerHTML|insertAdjacentHTML|createElement|\$\(["']hws/);
  const css = readFileSync(join(web, "html/board.html"), "utf8");
  expect(css).not.toMatch(/\.hws\{|\.hwsh|\.hwstab|\.hwsb\b|\.hwsbtn|\.pag\{|\.pdev\b|\.prow\b|\.pslide|\.pmore|\.psec2|\.pusage|#phome h3/);
  // The Home window's terminal is the run view's TerminalPane, not a second way to mount xterm.
  expect(readFileSync(join(web, "components/home/home-window.tsx"), "utf8")).toMatch(/<TerminalPane/);
});

// The Terminal page is React (pages/terminal-page.tsx over components/terminal and lib/terminal: rules, store, keys). board/terms.ts
// only feeds it the sessions and keeps the side menu's badge; it builds no markup and board.html keeps none of the tile CSS.
test("the Terminal page is drawn by React, not by board/terms.ts or board.html", () => {
  const src = readFileSync(join(web, "board/terms.ts"), "utf8");
  expect(src).not.toMatch(/innerHTML|insertAdjacentHTML|createElement|\$\(["']terms/);
  expect(src.split("\n").length).toBeLessThan(80);
  const css = readFileSync(join(web, "html/board.html"), "utf8");
  expect(css).not.toMatch(/\.tile\b|\.tgrid|\.tsplit|\.ttabs|\.tbar\b|body\.tdrag|body\.tmax/);
  expect(readFileSync(join(web, "components/terminal/terminal-tile.tsx"), "utf8")).toMatch(/<TerminalPane/);
});

// The board's footer (usage chips with their popovers, resources, terminal count, phone) and the status strip with the
// phone's status button are React (components/footer and components/board over lib/footer and lib/board/strip.ts).
test("the footer and the status strip are drawn by React, not by workspace.ts, cards.ts or board.html", () => {
  const ws = readFileSync(join(web, "board/workspace.ts"), "utf8");
  expect(ws).not.toMatch(/usageChips|\$\("(?:usage|phone|tcount)"\)|utip|uchip/);
  const cards = readFileSync(join(web, "board/cards.ts"), "utf8");
  expect(cards).not.toMatch(/\$\("(?:strip|fbtn)"\)|statusSheet|innerHTML/);
  const css = readFileSync(join(web, "html/board.html"), "utf8");
  expect(css).not.toMatch(/\.uchip|\.utip|\.urow|\.umtr|\.strip\b|\.ftr\.on/);
  expect(readFileSync(join(web, "components/footer/foot-bar.tsx"), "utf8")).not.toMatch(/innerHTML/);
});

// The Project context pane (files, notes, terminal sessions) is React (components/context over lib/context); board/context.ts
// only tells it the project and the sessions and wires the header's button.
test("the Project context pane is drawn by React, not by board/context.ts", () => {
  const src = readFileSync(join(web, "board/context.ts"), "utf8");
  expect(src).not.toMatch(/createElement|innerHTML|replaceChildren|\.append\(/);
  expect(src.split("\n").length).toBeLessThan(50);
  expect(readFileSync(join(web, "html/board.html"), "utf8")).toContain('<div id="context-host"');
});

// The run panel's document tabs (Request, Plan, Backlog with its Work list, Review with the Fix form) are React
// (components/run/doc-body.tsx over lib/run/doc.ts and the panel store); panel.ts decides which tab shows and hands it
// the text. It builds no markup. md() stays for the note editor (rich.ts); the panel's progress renderer is gone.
test("the panel's document tabs are drawn by React, not by panel.ts", () => {
  const src = readFileSync(join(web, "board/panel.ts"), "utf8");
  expect(src).not.toMatch(/innerHTML|insertAdjacentHTML|createElement|html`|raw\(|md\(|progress\(/);
  expect(readFileSync(join(web, "board/markdown.ts"), "utf8")).not.toMatch(/export function progress\b/);
  expect(readFileSync(join(web, "components/run/doc-body.tsx"), "utf8")).not.toMatch(/innerHTML/);
});

// The Notes tab (components/notes, lib/notes) and dictation (lib/dictation, the microphone button in components/shared) are
// React and lib. board/chat.ts and board/dictation.ts are gone, panel.ts hands the notes to react.drawNotes, the host no longer
// carries a mic, and the page's CSS keeps none of the old note-list or microphone rules (only the rules of the note editor's
// own element and the glow on the field being dictated into).
test("the notes chat and dictation are drawn by React, not by board/ modules or board.html", () => {
  const rd = (p: string) => readFileSync(join(web, p), "utf8");
  for (const f of ["board/chat.ts", "board/dictation.ts"]) expect(existsSync(join(web, f))).toBe(false);
  expect(rd("board/panel.ts")).not.toMatch(/\bchat\(|from "\.\/(?:chat|dictation)\.ts"/);
  expect(rd("board/panel.ts")).toMatch(/react\.drawNotes\(/);
  expect(rd("lib/core/host.ts")).not.toMatch(/\bmic\(|stopDictation/);
  expect(rd("board/react-mount.ts")).not.toMatch(/dictation\.ts/);
  const css = rd("html/board.html");
  expect(css).not.toMatch(/\.vu\{|\.ib\.mic|\.row \.mic|\.msg\{|\.chat\{|\.desc\{|\.notes textarea|\.notes \.tools|\.notes \.att|\.notes \.row/);
  expect(css).toMatch(/\.notes \.rich\{/); // the editor engine's own element (board/rich.ts) keeps its rules
  expect(css).toMatch(/\.dictating\{/);
  // the engine runs only in the board's bundle: nothing the notebook or Video bundles import reaches it
  for (const f of ["notebook/notebook.ts", "video/video.ts", "notebook/kit.ts"]) expect(rd(f)).not.toMatch(/dictation|lib\/notes|components\/notes/);
  // ...nor does the engine ride along in the kit bundle (it imports the shared barrel, which holds MicButton): its worker source is a
  // function so the bundler drops it where no microphone button is mounted.
  for (const f of ["notebook.js", "video.js"]) expect(rd(`dist/${f}`)).not.toContain("automatic-speech-recognition");
});

// The Notes page is React (pages/notebook-page.tsx, components/notebook, lib/notebook) in one bundle that carries React itself:
// notebook.ts only starts things, notes.html is a shell (no drawn markup, no toast, no select), the lazy kit bundle and its
// script loader are gone, and the editor engine is made in exactly one place (EditorPane, once per note opening).
test("the Notes page is drawn by React, with one editor component and no lazy kit bundle", () => {
  const rd = (p: string) => readFileSync(join(web, p), "utf8");
  const entry = rd("notebook/notebook.ts");
  expect(entry.split("\n").length).toBeLessThan(40);
  expect(entry).not.toMatch(/innerHTML|createElement\(["'`](?!div)|getElementById\("(?!root)/);
  expect(entry).toMatch(/createRoot\(document\.getElementById\("root"\)!\)\.render\(createElement\(NotebookPage\)\)/);
  expect(existsSync(join(web, "dist/notebook-kit.js"))).toBe(false);
  const html = rd("html/notes.html");
  expect(html).toContain('<div id="root" style="display:contents"></div>');
  expect(html).not.toMatch(/id="(?:pane|tree|tags|editor|meta|toast|proj|q)"|class="(?:app|hdr|wrap|side)"|select\.sel\{/);
  expect(rd("notebook/kit-loader.ts")).not.toMatch(/createElement|\.src =|\.href =/);
  // the engine view is made once, by the one component that owns it (and by nothing else in components or pages)
  const files = Object.fromEntries(
    ["components", "pages"].flatMap((l) => walk(join(web, l))).map((f) => [relative(web, f).split(/[\\/]/).join("/"), readFileSync(f, "utf8")]),
  );
  expect(Object.keys(files).filter((f) => /\bcreateEditor\(/.test(files[f]!))).toEqual(["components/notebook/editor-pane.tsx"]);
  expect(files["components/notebook/editor-pane.tsx"]).toMatch(/useLayoutEffect\([\s\S]*?\}, \[\]\)/);
  expect(files["components/notebook/note-body.tsx"]).toMatch(/<EditorPane key=\{doc\} \/>/);
  // every way out of the page writes the open note first
  const session = rd("lib/notebook/vault-session.ts");
  for (const e of ["beforeunload", "visibilitychange", "kz-leave", "pagehide"]) expect(session).toContain(`"${e}"`);
});

// The annotator: the Browser tab's toolbar and notes list are React (components/annotate, state and rules in lib/annotate) and the
// page-side script (web/annotate/annotate.ts, injected into the framed page) is TypeScript bundled to dist/annotate.js, which the
// server and the proxy serve at the old URLs. board/annotate.ts, the hand-written annotate.js and the old toolbar CSS are gone.
test("the annotator is React plus one bundled page script, with no old board module, hand-written script or toolbar CSS", () => {
  const rd = (p: string) => readFileSync(join(web, p), "utf8");
  expect(existsSync(join(web, "board/annotate.ts"))).toBe(false);
  expect(existsSync(join(web, "board/annotate-lib.ts"))).toBe(false);
  expect(readdirSync(join(web, "annotate"))).toEqual(["annotate.ts"]);
  expect(rd("annotate/annotate.ts")).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/);
  expect(rd("components/panes/browser-pane.tsx")).toMatch(/<AnnotatePanel ann=\{ann\} \/>/);
  expect(rd("board/run-view.ts")).not.toMatch(/annotat/i);
  expect(rd("html/board.html")).not.toMatch(/\.annbar|\.annlist|\.annn|\.annset|\.annempty/);
  const root = dirname(web);
  expect(readFileSync(join(root, "cli/web.ts"), "utf8")).toMatch(/ANNOTATE_JS = join\(dirname\(import\.meta\.dir\), "web", "dist", "annotate\.js"\)/);
  expect(readFileSync(join(root, "cli/annotate-proxy.ts"), "utf8")).toMatch(/"web", "dist", "annotate\.js"/);
  // the page script takes only the pure rules, never the board's store or React
  expect(specifiers(rd("annotate/annotate.ts"))).toEqual(["@lib/annotate/page.ts"]);
});

// ---- feature folders: components/<feature>/ and lib/<feature>/ ----
// Only folders live directly under components/ and lib/; none grows past MAX_FILES source files (*.test.ts sit beside the
// code they test and are not counted; split by feature instead); each
// has an index.ts, and anything outside a folder imports it through that index (inside a folder, files import each
// other directly, which keeps barrels out of cycles). `import type` follows the same rule: no type-only exception is
// needed. Exceptions, each for a reason:
//  - web/ui takes lib/core/utils.ts directly (the layer rule above: ui never reaches into the feature folders);
//  - a few web/board bridge files run in the notebook and Video bundles or in tests with no DOM; a barrel would pull the
//    board's stores (zustand + localStorage at import) into them, so they import the one small file they need.
const MAX_FILES = 25;
const BRIDGE_DIRECT = [
  "board/workspace.ts",
  "board/ws-tabs.ts",
  "board/badge.ts",
  "board/labels.ts",
  "board/search.ts",
  "board/update.ts",
];
const isTest = (name: string) => /\.test\.tsx?$/.test(name);
// Aliases (tsconfig paths): "@web/x" is web/x, "@lib/x" is web/lib/x, "@components/x" is web/components/x. A path with
// no file extension is a folder and means its index.ts. Everything else is relative.
const ALIASES: Record<string, string> = { "@web/": "", "@lib/": "lib/", "@components/": "components/" };
const aliasOf = (spec: string) => Object.keys(ALIASES).find((a) => spec.startsWith(a));
const isLocal = (spec: string) => spec.startsWith(".") || aliasOf(spec) !== undefined;
const resolveSpec = (file: string, spec: string) => {
  const a = aliasOf(spec);
  const path = a !== undefined ? join(web, ALIASES[a], spec.slice(a.length)) : resolve(dirname(file), spec);
  return /\.[jt]sx?$/.test(path) ? path : join(path, "index.ts");
};
const norm = (p: string) => p.split(/[\\/]/).join("/");
const featureOf = (rel: string) => rel.match(/^((?:components|lib)\/[^/]+)\/[^/]+$/)?.[1] ?? null;

function indexViolations(files: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [file, src] of Object.entries(files)) {
    const from = norm(relative(web, file));
    if (BRIDGE_DIRECT.includes(from)) continue;
    for (const spec of specifiers(src).filter(isLocal)) {
      const to = norm(relative(web, resolveSpec(file, spec)));
      const folder = featureOf(to);
      if (!folder || folder === featureOf(from) || to.endsWith("/index.ts")) continue;
      if (from.startsWith("ui/") && to === "lib/core/utils.ts") continue;
      out.push(`${from} imports "${spec}": import ${folder}/index.ts instead`);
    }
  }
  return out;
}

test("components/ and lib/ hold feature folders of at most 25 files, each with an index.ts", () => {
  const bad: string[] = [];
  for (const layer of ["components", "lib"]) {
    for (const e of readdirSync(join(web, layer), { withFileTypes: true })) {
      if (!e.isDirectory()) bad.push(`${layer}/${e.name}: loose file, put it in a feature folder`);
      else {
        const dir = join(web, layer, e.name);
        const all = readdirSync(dir, { withFileTypes: true });
        const files = all.filter((f) => !isTest(f.name)); // tests live beside the code and do not count toward the size
        if (files.some((f) => f.isDirectory())) bad.push(`${layer}/${e.name}: no folders inside a feature folder`);
        if (!existsSync(join(dir, "index.ts"))) bad.push(`${layer}/${e.name}: no index.ts`);
        else if (/\.test\b/.test(readFileSync(join(dir, "index.ts"), "utf8")))
          bad.push(`${layer}/${e.name}: index.ts must not export tests`);
        if (files.length > MAX_FILES)
          bad.push(`${layer}/${e.name}: ${files.length} files, over ${MAX_FILES}: split it`);
      }
    }
  }
  expect(bad).toEqual([]);
});

test("imports from outside a feature folder go through its index.ts", () => {
  const files = Object.fromEntries(
    ["components", "pages", "lib", "board"].flatMap((l) => walk(join(web, l))).map((f) => [f, readFileSync(f, "utf8")]),
  );
  expect(indexViolations(files)).toEqual([]);
  for (const f of BRIDGE_DIRECT) expect(existsSync(join(web, f))).toBe(true);
  // ...and the check catches a deep import, from a page, a component and a lib file, while allowing the rest.
  const at = (p: string) => join(web, p);
  expect(
    indexViolations({
      [at("pages/a.tsx")]: 'import { T } from "../components/task/task-row.tsx";',
      [at("components/git/b.tsx")]:
        'import { s } from "../../lib/board/board-store.ts"; import type { C } from "../../lib/core/board.ts";',
      [at("lib/task/c.ts")]: 'import { x } from "../core/api.ts";',
    }).length,
  ).toBe(4);
  expect(
    indexViolations({
      [at("pages/a.tsx")]: 'import { T } from "../components/task/index.ts";',
      [at("components/git/b.tsx")]: 'import { a } from "./git-tab.tsx"; import { s } from "../../lib/git/index.ts";',
      [at("ui/c.tsx")]: 'import { cn } from "../lib/core/utils.ts";',
      [at("board/workspace.ts")]: 'import { ask } from "../lib/core/ask.ts";',
    }),
  ).toEqual([]);
});

// web/ top level: folders and README.md; this file lives in checks/. Page shells live in html/, bundles in dist/, entry sources in an app folder.
test("web/ holds only folders and README.md", () => {
  const files = readdirSync(web, { withFileTypes: true })
    .filter((e) => !e.isDirectory())
    .map((e) => e.name)
    .sort();
  expect(files).toEqual(["README.md"]);
});
