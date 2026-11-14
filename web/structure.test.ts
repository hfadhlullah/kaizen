// Keeps the React layers in order (see .kaizen/notes/Project/Conventions and gotchas.md):
//   pages -> components -> ui -> lib/core/utils.ts, and lib imports only lib.
// A page or component never imports a Radix package (or cmdk) itself: popups come from web/ui.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const web = import.meta.dir;
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
      if (!spec.startsWith(".")) {
        if (from !== "ui" && PRIMITIVES.test(spec))
          out.push(`${where}: use the piece in web/ui instead of the package`);
        continue;
      }
      const target = resolve(dirname(file), spec),
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
        'import { Chip } from "../components/chip.tsx"; import { Button } from "../ui/button.tsx"; import { x } from "../lib/core/store.ts";',
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
