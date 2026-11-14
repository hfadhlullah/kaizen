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

// A popup, dialog or list box is a piece from web/ui (Radix draws it, in #kz-portal); nothing in web/ builds one by hand,
// draws HTML strings, or makes an element by hand (`x.createElement(...)` on any document, DOMParser, a range's
// createContextualFragment); React's own bare createElement(...) is drawing, canvas/link/script/style are not. video/ is the
// one folder outside the rule (its own page, no React, no board). The files below are the whole list of exceptions, each for
// a reason and with the most uses it may keep: a new use in an exempt file fails until the count is raised on purpose, and a
// file that stops needing its exception fails the test until the line is removed.
const HAND_BUILT =
  /<dialog\b|document\.createElement\(["']dialog|(?<!\[)role=["'](?:dialog|alertdialog|listbox)["']|menu-pop|innerHTML|outerHTML|insertAdjacentHTML|document\.write|dangerouslySetInnerHTML|DOMParser|createContextualFragment/g;
const MADE = /\.createElement(?:NS)?\(\s*(?!["'](?:canvas|link|script|style)["'])/g;
const uses = (src: string) => (src.match(HAND_BUILT)?.length ?? 0) + (src.match(MADE)?.length ?? 0);
// What used to be web/board: the engines that react to lib/server and lib/router and the page's glue. They draw nothing.
const ENGINES = [
  "pages/board/main.ts", "pages/board/views.ts", "pages/board/keys.ts", "pages/board/live.ts", "pages/board/host-bridge.ts",
  "lib/run/panel.ts", "lib/run/workspace.ts", "lib/run/ws-draw.ts", "lib/run/ws-actions.ts", "lib/run/card-terminal.ts", "lib/board/snapshot.ts", "lib/board/on-state.ts", "lib/board/popups.ts",
  "lib/board/nav.ts", "lib/home/home-engine.ts", "lib/home/home-events.ts", "lib/terminal/terms-feed.ts", "lib/context/feed.ts",
  "lib/settings/panel-settings.ts", "lib/git/git-panel.ts", "lib/project/project-pick.ts", "lib/search/search-rows.ts", "lib/rail/rail-boot.ts",
];
const EXEMPT: Record<string, [number, string]> = {
  "term/term.ts": [
    26,
    "xterm's own bundle (term.js, no React): find box, paste button, reconnect strip, and the phone key bar, whose pointerdown + preventDefault keeps the soft keyboard open",
  ],
  "lib/notes/rich.ts": [2, "the note editor's contenteditable engine: sets its markdown as HTML and owns its editable div"],
  "annotate/annotate.ts": [12, "the annotator's page script, injected into the previewed page, where no React or board CSS exists"],
  "lib/notebook/engine-widgets.ts": [15, "CodeMirror widget DOM: the editor engine asks for elements, not React"],
  "lib/notebook/deal.ts": [1, "the card-deal effect's shade element, added to an engine-owned node"],
};
const drawnBy = (files: Record<string, string>) =>
  Object.entries(files).flatMap(([f, src]) => {
    const rel = norm(relative(web, f));
    if (rel in EXEMPT) return uses(src) > EXEMPT[rel]![0] ? [`${rel} has more hand-built DOM than its exception allows`] : [];
    return uses(src) ? [`${rel} builds a popup, an element or HTML by hand`] : [];
  });
const SKIP = new Set(["video", "dist", "html", "sounds", "checks"]);
const allSources = () =>
  readdirSync(web, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !SKIP.has(e.name))
    .flatMap((e) => walk(join(web, e.name)));
test("nothing in web/ except video/ and the named exceptions hand-builds a popup, sets innerHTML or makes elements", () => {
  const files = Object.fromEntries(allSources().map((f) => [f, readFileSync(f, "utf8")]));
  expect(Object.keys(files).length).toBeGreaterThan(100);
  expect(drawnBy(files)).toEqual([]);
  // every exception is still in use, its count is exact (so it shrinks when the file does), and a reason is given
  for (const [f, [n, why]] of Object.entries(EXEMPT)) {
    expect(why.length).toBeGreaterThan(20);
    const src = files[join(web, f)];
    expect(src).toBeDefined();
    expect([f, uses(src!)]).toEqual([f, n]);
  }
  // ...and the check does catch one, in every form it knows.
  expect(
    drawnBy({
      [join(web, "components", "x.tsx")]: '<div role="dialog">',
      [join(web, "pages", "y.tsx")]: "el.innerHTML = a",
      [join(web, "board", "w.ts")]: 'document.createElement("div")',
      [join(web, "lib", "v.ts")]: 'el.insertAdjacentHTML("beforeend", a)',
      [join(web, "components", "z.tsx")]: "<Dialog>",
      [join(web, "lib", "run", "ok.ts")]: 'document.createElement("script")',
      [join(web, "lib", "notes", "rich.ts")]: "ed.innerHTML = a",
      [join(web, "lib", "u.ts")]: '(d: Document) => d.createElement("div")',
      [join(web, "lib", "t.ts")]: 'new DOMParser().parseFromString("<b>", "text/html")',
      [join(web, "lib", "r.ts")]: 'range.createContextualFragment("<b>")',
      [join(web, "components", "s.tsx")]: 'createElement("div")', // React's own call is drawing
      [join(web, "board", "toast.ts")]: 'a.createElement("a"); b.createElement("a")', // over its pinned count
    }).length,
  ).toBe(8);
});

// The DOM is React's. No code looks an element up on the page by selector or id, except the few places named here, each with
// the most lookups it may keep and a reason (a new one fails until the count is raised on purpose; a file that stops needing
// its entry fails until the line is removed). Two rules: (1) the engines (what used to be web/board) look nothing up on any
// node but the ones named in ENGINE_LOOKUPS, so "an engine reaches into no markup" is held, not claimed; (2) anywhere in web/
// outside video/, `document.getElementById`, `document.querySelector` and `document.querySelectorAll` only where DOC_LOOKUPS
// says. A node a component holds as a ref (`box.current?.querySelector(...)`) is the component's own and is not counted.
const LOOKUP = /\b(?:getElementById|querySelector(?:All)?)\s*(?:<[^>()]*>)?\(|\$\(["']/g;
const DOC_LOOKUP = /\bdocument\.(?:getElementById|querySelector(?:All)?)\s*(?:<[^>()]*>)?\(/g;
const ENGINE_LOOKUPS: Record<string, [number, string]> = {
  "pages/board/main.ts": [1, "the page's one mount point, #root"],
  "lib/board/nav.ts": [3, "j/k/arrows walk the cards by DOM order inside the Board's own root (a ref held in the store), the order the person sees"],
  "lib/rail/rail-boot.ts": [1, "a MutationObserver reads the node it is handed to see whether a status icon was added"],
};
const DOC_LOOKUPS: Record<string, [number, string]> = {
  "pages/board/main.ts": [1, "the mount point, #root"],
  "notebook/notebook.ts": [1, "the mount point, #root"],
  "popup/popup.ts": [1, "the mount point, #root"],
  "annotate/annotate.ts": [3, "the annotator's page script, injected into the previewed page: no React there"],
  "lib/core/layers.ts": [1, "does the browser's own dialog element show (the kit draws none; R73)"],
  "lib/shell/stored-look.ts": [1, "the viewport meta in <head>, set before React draws (boot.js and the standalone fit)"],
  "lib/notebook/deal.ts": [2, "the card-deal effect animates the Notes page's .main, a node the engine owns"],
  "components/context/context-panel.tsx": [2, "the dialog form of the pane makes the rest of the app inert: the side menu and the page's other children"],
  "pages/tasks-page.tsx": [1, "scroll the row the keyboard moved to into view, by its data attribute"],
  "lib/icebox/use-ice-keys.ts": [2, "an open popup keeps the keys; scroll the row under the cursor into view, by its data attribute"],
  "lib/icebox/icebox-view.ts": [1, "focus a row's title after it opens, by its data attribute"],
  "lib/icebox/icebox-actions.ts": [1, "focus the current row's title after an action, by its data attribute"],
};
const lookups = (files: Record<string, string>, re: RegExp, table: Record<string, [number, string]>, only?: string[]) =>
  Object.entries(files).flatMap(([f, src]) => {
    const rel = norm(relative(web, f));
    if (only && !only.includes(rel)) return [];
    const n = src.match(re)?.length ?? 0,
      allowed = table[rel]?.[0] ?? 0;
    return n > allowed ? [`${rel} looks up ${n} elements by selector or id; ${allowed} allowed`] : [];
  });
test("nothing looks an element up by id or selector except the named places; the engines look up none but theirs", () => {
  const files = Object.fromEntries(allSources().map((f) => [f, readFileSync(f, "utf8")]));
  expect(lookups(files, DOC_LOOKUP, DOC_LOOKUPS)).toEqual([]);
  expect(lookups(files, LOOKUP, ENGINE_LOOKUPS, ENGINES)).toEqual([]);
  // every entry is still in use, its count exact, a reason given
  for (const [table, re] of [[DOC_LOOKUPS, DOC_LOOKUP], [ENGINE_LOOKUPS, LOOKUP]] as const)
    for (const [f, [n, why]] of Object.entries(table)) {
      expect(why.length).toBeGreaterThan(20);
      const src = files[join(web, f)];
      expect(src).toBeDefined();
      expect([f, src!.match(re)?.length ?? 0]).toEqual([f, n]);
    }
  // ...and the check sees each form, and leaves a ref's own query alone
  const at = (p: string) => join(web, p);
  const bad = lookups(
    {
      [at("lib/run/workspace.ts")]: 'document.querySelector(".hdr h1")',
      [at("lib/search/search-rows.ts")]: "document.querySelector<HTMLTextAreaElement>('[role=\"dialog\"] textarea')",
      [at("lib/run/panel.ts")]: 'box.querySelectorAll("li"); $("hq"); getElementById("x")',
      [at("lib/home/home-engine.ts")]: 'x.querySelector(".a")',
      [at("components/x.tsx")]: 'document.getElementById("a"); document.querySelectorAll(".b")',
      [at("components/ok.tsx")]: 'box.current?.querySelector("textarea"); el.querySelectorAll("li")',
    },
    LOOKUP,
    ENGINE_LOOKUPS,
    ENGINES,
  ).concat(
    lookups(
      {
        [at("components/x.tsx")]: 'document.getElementById("a"); document.querySelectorAll(".b")',
        [at("components/ok.tsx")]: 'box.current?.querySelector("textarea"); el.querySelectorAll("li")',
        [at("lib/y.ts")]: 'document.querySelector<HTMLElement>("[a]")',
      },
      DOC_LOOKUP,
      DOC_LOOKUPS,
    ),
  );
  expect(bad.map((l) => l.split(" looks")[0])).toEqual([
    "lib/run/workspace.ts",
    "lib/search/search-rows.ts",
    "lib/run/panel.ts",
    "lib/home/home-engine.ts",
    "components/x.tsx",
    "lib/y.ts",
  ]);
});

// web/board/ is gone. Its engines are in feature folders of lib/ (lib/run: panel.ts, workspace.ts, card-terminal.ts; lib/board:
// snapshot.ts, on-state.ts, popups.ts, nav.ts; lib/home, lib/terminal, lib/context, lib/git, lib/settings, lib/project,
// lib/search, lib/rail) and the page's own glue in pages/board/ (main, views, keys, live, host-bridge). There are no
// named exceptions: nothing imports a web/board file, and a new top-level folder for old plumbing fails this test.
const onlyForwards = (src: string) => {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").trim();
  return code.length > 0 && /^(?:(?:import|export)\s[^;]*?\bfrom\s+["'][^"']+["'];?\s*)+$/.test(code);
};
test("web/board is gone: no folder, no import of it, and no engine file that only forwards", () => {
  expect(existsSync(join(web, "board"))).toBe(false);
  const files = Object.fromEntries(allSources().map((f) => [f, readFileSync(f, "utf8")]));
  const stray = Object.entries(files).flatMap(([f, src]) =>
    specifiers(src)
      .filter(isLocal)
      .filter((spec) => norm(relative(web, resolveSpec(f, spec))).startsWith("board/"))
      .map((spec) => `${norm(relative(web, f))} imports ${spec}`),
  );
  expect(stray).toEqual([]);
  for (const f of ENGINES) expect([f, onlyForwards(readFileSync(join(web, f), "utf8"))]).toEqual([f, false]);
  // the check sees a one-line forward, a multi-line one and one beside an import, and leaves real code alone
  expect(onlyForwards('export { a } from "./a.ts";')).toBe(true);
  expect(onlyForwards('// x\nexport {\n  a,\n  b,\n} from "./a.ts";\nexport * from "./b.ts"')).toBe(true);
  expect(onlyForwards('import { a } from "./a.ts";\nexport { b } from "./b.ts";')).toBe(true);
  expect(onlyForwards('import { a } from "./a.ts";\nexport const b = a + 1;')).toBe(false);
});

// The page shells are a handful of lines: the head, a root and one script. All the markup is React (pages/*/App.tsx), all
// the styles are in the page's one built stylesheet, all the script is its bundle. video.html is still a whole page. The one
// exception to "one script" is /boot.js in the board's and the Notebook's head: a tiny blocking file (web/boot/boot.ts, no
// inline script) that puts the stored theme, colour and menu fold on <html> before the first paint, so a slow bundle never
// shows the wrong theme (R55).
test("board.html, notes.html and popup.html are small shells with no inline style, script or markup", () => {
  for (const [f, css, js] of [["board", "board.css", "board.js"], ["notes", "notebook.css", "notebook.js"], ["popup", "popup.css", "popup.js"]]) {
    const html = readFileSync(join(web, `html/${f}.html`), "utf8");
    expect(html.split("\n").length).toBeLessThan(25);
    expect(html.length).toBeLessThan(1500);
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain(`<link rel="stylesheet" href="/${css}">`);
    const boot = f === "popup" ? [] : ['<script src="/boot.js">'];
    expect(html.match(/<script\b[^>]*>/g)).toEqual([...boot, `<script src="/${js}">`]);
    if (boot.length) expect(html.indexOf("/boot.js")).toBeLessThan(html.indexOf("<link rel=\"stylesheet\""));
    expect(html).not.toMatch(/<style\b|\sstyle=|<svg\b|<nav\b|<button\b|onclick=/);
    for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) expect(m[1]).toBe("");
  }
  // every page is one App in its own folder, and the Board's holds no state of its own
  for (const f of ["board", "notebook", "popup"]) expect(existsSync(join(web, `pages/${f}/App.tsx`))).toBe(true);
  const app = readFileSync(join(web, "pages/board/App.tsx"), "utf8");
  expect(app.split("\n").length).toBeLessThan(80);
  expect(app).not.toMatch(/useState|useReducer|create\(/);
  // react-mount.ts and the react registry are gone: stores and lib calls are made directly
  expect(existsSync(join(web, "board/react-mount.ts"))).toBe(false);
  expect(readFileSync(join(web, "pages/board/views.ts"), "utf8")).not.toMatch(/export const react\b/);
});

// The server's data and the page that shows are not the engines' to decide any more: lib/server is the one poller (fetch, dedupe,
// the quiet gap, the event stream) writing one store, lib/router the one router (the view, its address, the <body> classes
// through the App). The engines read them and react; it fetches none of what the poller reads and sets no page class.
test("the engines do not poll the server or show pages: lib/server and lib/router do", () => {
  const src = (n: string) => readFileSync(join(web, n), "utf8");
  for (const n of ENGINES) {
    const s = src(n);
    expect([n, /fetch\(["'`]\/(state|shells["'`]|sources|tasks\?all|events)/.test(s) || /new EventSource/.test(s)]).toEqual([n, false]);
    expect([n, /dispatchEvent\(new Event\("kz-(state|view|rail|shells|cards|all-cards|task-attention|changed)"\)\)/.test(s)]).toEqual([n, false]);
    // A page class on <body> is the App's (useRouteClasses): the engines may read the route, never set one.
    expect([n, /body\.classList\.(toggle|add|remove)\(\s*["'`](paged|ice|setv|termv|homev|phomev|pdevv|taskv|taskpagev|runv|phone-menu-open)\b/.test(s)]).toEqual([n, false]);
    expect([n, /classList\.contains\(\s*["'](paged|ice|setv|termv|homev|phomev|pdevv|taskv|taskpagev)["']/.test(s)]).toEqual([n, false]);
    // No panel or page is written as classes: the stores draw them. (What an engine may look up is the next test.)
  }
  // the poller is lib/server's and the router lib/router's; the Board App is the page picker
  for (const f of ["poller.ts", "poll-rules.ts", "server-store.ts"]) expect(existsSync(join(web, "lib/server", f))).toBe(true);
  for (const f of ["route-store.ts", "route-rules.ts", "use-route-classes.ts"]) expect(existsSync(join(web, "lib/router", f))).toBe(true);
  expect(readFileSync(join(web, "pages/board/App.tsx"), "utf8")).toContain("useRouteClasses()");
  expect(readFileSync(join(web, "lib/router/use-route-classes.ts"), "utf8")).toContain("bodyClasses(");
  // no router library
  expect(readFileSync(join(dirname(web), "package.json"), "utf8")).not.toMatch(/react-router|tanstack\/router|wouter/);
  // the engines register with the router and the poller; they do not own the store's data
  expect(src("pages/board/views.ts")).toContain("setRouterHooks(");
  expect(src("lib/board/on-state.ts")).toContain("setEngine(");
});

// workspace.ts is shared with the notebook and Video bundles. The Projects list, its filter, the worktree menu and the
// resource popup are React (components/rail, components/resources): the board's App draws them, the Notebook
// page draws the same components in notebook.js (the kit, kit.ts, lends the popups), and Video lists no projects. What
// stays here opens the Add a project sheet only through the onBoard guard or the kit, and settings.ts / tasks-page.tsx
// never wipe a header host another part mounted (#ptabs, #psub, #hx).
test("shared side-menu code only opens React hosts the page has; no page wipes a mounted host", () => {
  const rd = (p: string) => readFileSync(join(web, p), "utf8");
  const ws = rd("lib/rail/rail-boot.ts");
  expect(ws.match(/\bopenAdd\(/g)?.length).toBe(3); // the board branch, the kit's, and the ?add= arrival
  expect(ws).toMatch(/function addProject[\s\S]*?if \(onBoard\) return openAdd[\s\S]*?kitFor\(\)\.then\(\(k\) => k\.openAdd\(o\), \(\) => leave\(/);
  // The list and the popups are gone from the old code and have a mount on each page that has them.
  expect(ws).not.toMatch(/drawList|drawPop|pfpop|wsMenu|rankDrag|innerHTML = drawn/);
  expect(existsSync(join(web, "board/resources.ts"))).toBe(false);
  expect(ws).toMatch(/!onBoard && kitHere\(\)\) void kitFor\(\)\.catch/);
  // The side menu (components/shell/rail.tsx) draws the list and the filter on both pages.
  expect(rd("components/shell/rail.tsx")).toMatch(/<span id="pfilter-host"[^>]*>\s*<RailFilter \/>[\s\S]*<RailList \/>/);
  // The footer's resource button is part of the footer bar now.
  expect(rd("components/footer/foot-bar.tsx")).toMatch(/<ResourcesButton \/>/);
  expect(rd("html/video.html")).toContain('<span id="pfilter-host" style="display:contents"></span>');
  expect(rd("pages/board/App.tsx")).toContain('<footer className="foot kz-ui" id="foot"');
  // Search: the notebook page opens the palette from the kit and falls back to the board; every page load from the palette
  // goes through go(), which writes the notebook's open note first.
  const se = rd("lib/search/search-rows.ts");
  expect(se).toMatch(/kitFor\(\)\.then\([\s\S]*?\(\) => leave\("\/\?view=board&search=1"\)/);
  expect(se.match(/location\.href =/g)?.length).toBe(1); // go() on the board; leave() (lib/core/leave.ts) is the other way out
  expect(rd("lib/settings/panel-settings.ts")).not.toMatch(/\$\("(?:ptabs|psub)"\)\.(?:innerHTML|textContent)\s*=/);
  expect(rd("pages/tasks-page.tsx")).not.toMatch(/getElementById\("hx"\)\?*\.replaceChildren/);
});

// The run workspace centre: the panes, the layout tree, the gutters, the Browser tab and the panel grip are React
// (components/run, components/panes, lib/run). run-view.ts holds the plumbing (which items the workspace has, sessions,
// keys); it builds no pane, gutter, frame or terminal element and no Preview tab (components/panes/preview-pane.tsx).
test("run-view.ts builds no pane, gutter, frame or terminal element and keeps no layout tree of its own", () => {
  const src = readFileSync(join(web, "lib/run/workspace.ts"), "utf8");
  expect(src).not.toMatch(/createElement\(["'`](?:section|header|iframe|webview)/);
  expect(src).not.toMatch(/makePane|\.rtree|\.rgut|kz-runtabs|splitAt|termLoad|new Map<string, \{ el:/);
  const ui = readFileSync(join(web, "ui/legacy/board.css"), "utf8");
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
  const ws = readFileSync(join(web, "lib/home/home-events.ts"), "utf8");
  expect(ws).not.toMatch(/innerHTML|insertAdjacentHTML|createElement|\$\(["']hws/);
  const css = readFileSync(join(web, "ui/legacy/board.css"), "utf8");
  expect(css).not.toMatch(/\.hws\{|\.hwsh|\.hwstab|\.hwsb\b|\.hwsbtn|\.pag\{|\.pdev\b|\.prow\b|\.pslide|\.pmore|\.psec2|\.pusage|#phome h3/);
  // The Home window's terminal is the run view's TerminalPane, not a second way to mount xterm.
  expect(readFileSync(join(web, "components/home/home-window.tsx"), "utf8")).toMatch(/<TerminalPane/);
});

// The Terminal page is React (pages/terminal-page.tsx over components/terminal and lib/terminal: rules, store, keys). board/terms.ts
// only feeds it the sessions and keeps the side menu's badge; it builds no markup and board.html keeps none of the tile CSS.
test("the Terminal page is drawn by React, not by board/terms.ts or board.html", () => {
  const src = readFileSync(join(web, "lib/terminal/terms-feed.ts"), "utf8");
  expect(src).not.toMatch(/innerHTML|insertAdjacentHTML|createElement|\$\(["']terms/);
  expect(src.split("\n").length).toBeLessThan(80);
  const css = readFileSync(join(web, "ui/legacy/board.css"), "utf8");
  expect(css).not.toMatch(/\.tile\b|\.tgrid|\.tsplit|\.ttabs|\.tbar\b|body\.tdrag|body\.tmax/);
  expect(readFileSync(join(web, "components/terminal/terminal-tile.tsx"), "utf8")).toMatch(/<TerminalPane/);
});

// The board's footer (usage chips with their popovers, resources, terminal count, phone) and the status strip with the
// phone's status button are React (components/footer and components/board over lib/footer and lib/board/strip.ts).
test("the footer and the status strip are drawn by React, not by workspace.ts, cards.ts or board.html", () => {
  const ws = readFileSync(join(web, "lib/rail/rail-boot.ts"), "utf8");
  expect(ws).not.toMatch(/usageChips|\$\("(?:usage|phone|tcount)"\)|utip|uchip/);
  const cards = readFileSync(join(web, "lib/board/snapshot.ts"), "utf8");
  expect(cards).not.toMatch(/\$\("(?:strip|fbtn)"\)|statusSheet|innerHTML/);
  const css = readFileSync(join(web, "ui/legacy/board.css"), "utf8");
  expect(css).not.toMatch(/\.uchip|\.utip|\.urow|\.umtr|\.strip\b|\.ftr\.on/);
  expect(readFileSync(join(web, "components/footer/foot-bar.tsx"), "utf8")).not.toMatch(/innerHTML/);
});

// The Project context pane (files, notes, terminal sessions) is React (components/context over lib/context); board/context.ts
// only tells it the project and the sessions and wires the header's button.
test("the Project context pane is drawn by React, not by board/context.ts", () => {
  const src = readFileSync(join(web, "lib/context/feed.ts"), "utf8");
  expect(src).not.toMatch(/createElement|innerHTML|replaceChildren|\.append\(/);
  expect(src.split("\n").length).toBeLessThan(50);
  expect(readFileSync(join(web, "pages/board/App.tsx"), "utf8")).toContain('<div id="context-host"');
  // the open button is React (in the header) and nothing hides it on a computer: the pane was unreachable once
  expect(readFileSync(join(web, "pages/board/header.tsx"), "utf8")).toContain("<ContextOpen />");
  expect(readFileSync(join(web, "ui/legacy/board.css"), "utf8")).not.toContain("#context,#ctx-open{display:none!important}");
  expect(src).not.toMatch(/ctx-open/);
  expect(readFileSync(join(web, "components/context/context-panel.tsx"), "utf8")).toContain('id="ctx-open"');
  // and nothing is read while the pane is closed
  expect(readFileSync(join(web, "components/context/context-panel.tsx"), "utf8")).not.toMatch(/setOpen\(wide\)/);
});

// The run panel's document tabs (Request, Plan, Backlog with its Work list, Review with the Fix form) are React
// (components/run/doc-body.tsx over lib/run/doc.ts and the panel store); panel.ts decides which tab shows and hands it
// the text. It builds no markup. md() stays for the note editor (rich.ts); the panel's progress renderer is gone.
test("the panel's document tabs are drawn by React, not by panel.ts", () => {
  const src = readFileSync(join(web, "lib/run/panel.ts"), "utf8");
  expect(src).not.toMatch(/innerHTML|insertAdjacentHTML|createElement|html`|raw\(|md\(|progress\(/);
  expect(readFileSync(join(web, "lib/notes/md-html.ts"), "utf8")).not.toMatch(/export function progress\b/);
  expect(readFileSync(join(web, "components/run/doc-body.tsx"), "utf8")).not.toMatch(/innerHTML/);
});

// The Notes tab (components/notes, lib/notes) and dictation (lib/dictation, the microphone button in components/shared) are
// React and lib. board/chat.ts and board/dictation.ts are gone, panel.ts hands the notes to react.drawNotes, the host no longer
// carries a mic, and the page's CSS keeps none of the old note-list or microphone rules (only the rules of the note editor's
// own element and the glow on the field being dictated into).
test("the notes chat and dictation are drawn by React, not by board/ modules or board.html", () => {
  const rd = (p: string) => readFileSync(join(web, p), "utf8");
  for (const f of ["board/chat.ts", "board/dictation.ts"]) expect(existsSync(join(web, f))).toBe(false);
  expect(rd("lib/run/panel.ts")).not.toMatch(/\bchat\(|from "\.\/(?:chat|dictation)\.ts"/);
  expect(rd("lib/run/panel.ts")).toMatch(/drawNotes\(/);
  expect(rd("lib/core/host.ts")).not.toMatch(/\bmic\(|stopDictation/);
  const css = rd("ui/legacy/board.css");
  expect(css).not.toMatch(/\.vu\{|\.ib\.mic|\.row \.mic|\.msg\{|\.chat\{|\.desc\{|\.notes textarea|\.notes \.tools|\.notes \.att|\.notes \.row/);
  expect(css).toMatch(/\.notes \.rich\{/); // the editor engine's own element (board/rich.ts) keeps its rules
  expect(css).toMatch(/\.dictating\{/);
  // the engine runs only in the board's bundle: nothing the notebook or Video bundles import reaches it
  for (const f of ["notebook/notebook.ts", "video/video.ts", "lib/notebook/kit.ts"]) expect(rd(f)).not.toMatch(/dictation|lib\/notes|components\/notes/);
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
  expect(entry).not.toMatch(/innerHTML|\.createElement\(|getElementById\("(?!root)/);
  expect(entry).toMatch(/createRoot\(document\.getElementById\("root"\)!\)\.render\(createElement\(App, \{ embed \}\)\)/);
  expect(existsSync(join(web, "dist/notebook-kit.js"))).toBe(false);
  const html = rd("html/notes.html");
  expect(html).toContain('<div id="root"></div>');
  expect(html).not.toMatch(/id="(?:pane|tree|tags|editor|meta|toast|proj|q)"|class="(?:app|hdr|wrap|side)"|select\.sel\{/);
  expect(rd("lib/notebook/kit-loader.ts")).not.toMatch(/createElement|\.src =|\.href =/);
  // the engine view is made once, by the one component that owns it (and by nothing else in components or pages)
  const files = Object.fromEntries(
    ["components", "pages"].flatMap((l) => walk(join(web, l))).map((f) => [relative(web, f).split(/[\\/]/).join("/"), readFileSync(f, "utf8")]),
  );
  expect(Object.keys(files).filter((f) => /\bcreateEditor\(/.test(files[f]!))).toEqual(["components/notebook/editor-pane.tsx"]);
  expect(files["components/notebook/editor-pane.tsx"]).toMatch(/useLayoutEffect\([\s\S]*?\}, \[\]\)/);
  expect(files["components/notebook/note-body.tsx"]).toMatch(/<EditorPane key=\{doc\} \/>/);
  // every way out of the page writes the open note first
  const session = rd("lib/notebook/vault-session.ts");
  for (const e of ["beforeunload", "visibilitychange", "pagehide"]) expect(session).toContain(`"${e}"`);
  expect(session).toContain("onLeave(flush)"); // leaving through Search or Add a project (lib/core/leave.ts) writes it first
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
  expect(rd("lib/run/workspace.ts")).not.toMatch(/annotat/i);
  expect(rd("ui/legacy/board.css")).not.toMatch(/\.annbar|\.annlist|\.annn|\.annset|\.annempty/);
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
//  - a few bridge files run in the notebook and Video bundles or in tests with no DOM (rail-boot, search-rows, ws-tabs,
//    ws-board); a barrel would pull the board's stores (zustand + localStorage at import) into them, so they import the one
//    small file they need. The board's main.ts is the one place the engines meet and may reach any of them directly.
const MAX_FILES = 25;
const BRIDGE_DIRECT = [
  "pages/board/main.ts",
  "lib/board/ws-board.ts",
  "lib/rail/rail-boot.ts",
  "lib/run/ws-tabs.ts",
  "lib/search/search-rows.ts",
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
    ["components", "pages", "lib"].flatMap((l) => walk(join(web, l))).map((f) => [f, readFileSync(f, "utf8")]),
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
      [at("lib/rail/rail-boot.ts")]: 'import { ask } from "../lib/core/ask.ts";',
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
