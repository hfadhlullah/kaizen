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

// workspace.ts is shared with the notebook and Video bundles, which mount no React: the sheet and the menu it opens
// are asked for only through the onBoard() guard (addProject / wsMenu), and settings.ts / tasks-page.tsx never wipe a
// header host another part mounted (#ptabs, #psub, #hx).
test("shared side-menu code only opens React hosts the page has; no page wipes a mounted host", () => {
  const rd = (p: string) => readFileSync(join(web, p), "utf8");
  const ws = rd("board/workspace.ts");
  expect(ws.match(/\bopenAdd\(/g)?.length).toBe(2); // addProject's board branch and the ?add= arrival
  expect(ws).toMatch(/function addProject[\s\S]*?if \(onBoard\(\)\) return openAdd/);
  expect(ws).toMatch(/function wsMenu\([^)]*\) \{\n  if \(!onBoard\(\)\) return;/);
  expect(rd("board/settings.ts")).not.toMatch(/\$\("(?:ptabs|psub)"\)\.(?:innerHTML|textContent)\s*=/);
  expect(rd("pages/tasks-page.tsx")).not.toMatch(/getElementById\("hx"\)\?*\.replaceChildren/);
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
  "board/labels.ts",
  "board/search.ts",
  "board/dictation.ts",
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
