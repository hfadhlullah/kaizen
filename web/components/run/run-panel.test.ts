import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PanelFrame } from "@components/shared";

const frame = (more: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(PanelFrame, {
      label: "x",
      header: createElement("i", null, "HEAD"),
      body: createElement("i", null, "BODY"),
      foot: createElement("i", null, "FOOT"),
      strip: createElement("i", null, "STRIP"),
      ...more,
    } as never),
  );

// The run workspace's panel is drawn by PanelFrame; these are the things the old panel rules did that the frame has to keep.
test("a parked panel (the run workspace with no run) is not drawn", () => {
  expect(frame({ hidden: true })).toContain("!hidden");
  expect(frame()).not.toContain("!hidden");
});
test("the strip comes right after the header in the document, so the tab order stays: header, tabs, body, foot", () => {
  const out = frame();
  const at = (w: string) => out.indexOf(w);
  expect(at("HEAD")).toBeLessThan(at("STRIP"));
  expect(at("STRIP")).toBeLessThan(at("BODY"));
  expect(at("BODY")).toBeLessThan(at("FOOT"));
});
test("in the run workspace (flush) the header and the strip keep clear of the desktop app's window controls", () => {
  const out = frame({ flush: true });
  expect(out).toContain("var(--wco, 0px)");
  expect(out).toContain("var(--wch, 0px)");
  expect(frame()).not.toContain("--wco");
});
test("the frame can be an aside with an id and a body that scrolls on its own", () => {
  const out = frame({ as: "aside", id: "panel", flush: true });
  expect(out.startsWith('<aside id="panel"')).toBe(true);
  expect(out).toContain("overflow-hidden");
});
test("folded, only the strip is drawn", () => {
  const out = frame({ folded: true });
  expect(out).toContain("STRIP");
  for (const w of ["HEAD", "BODY", "FOOT"]) expect(out).not.toContain(w);
});
