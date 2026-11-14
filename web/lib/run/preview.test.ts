import { expect, test } from "bun:test";
import { parse } from "@lib/markdown";
import { planPreview, previewIn, shotName, splitShots } from "./preview.ts";

const file = (i: string) => "/file?p=" + i;
const base = { direct: null, loopback: true, fileUrl: file };

test("a run's own Preview wins over what an agent last showed", () => {
  const d = planPreview({ ...base, pv: "Run it.", direct: { image: "a.png" } });
  expect(d).toEqual({ kind: "report", url: undefined, text: "Run it." });
});

test("with no Preview, the agent's screenshot or page shows", () => {
  expect(planPreview({ ...base, pv: null, direct: { image: "out/a.png" } })).toEqual({
    kind: "image",
    src: "/file?p=out/a.png",
    name: "a.png",
  });
  expect(planPreview({ ...base, pv: null, direct: { url: "http://localhost:1/" } })).toEqual({
    kind: "frame",
    src: "http://localhost:1/",
  });
  expect(planPreview({ ...base, pv: null })).toEqual({ kind: "report", url: undefined, text: null });
});

test("a localhost address is framed only without screenshots and on the board's own computer", () => {
  const pv = "open http://localhost:5173/app now";
  expect(planPreview({ ...base, pv })).toEqual({ kind: "frame", src: "http://localhost:5173/app" });
  expect(planPreview({ ...base, pv, loopback: false })).toEqual({
    kind: "report",
    url: "http://localhost:5173/app",
    text: pv,
  });
  const shots = pv + "\n\n![x](attachments/x.png)";
  expect(planPreview({ ...base, pv: shots }).kind).toBe("report");
});

test("splitShots takes every image out of its block and drops what it empties", () => {
  const { blocks, shots } = splitShots(
    parse(
      "Text ![a](/f/one.png) more\n\n![](/f/two%20x.png)\n\n- ![c](/f/c.png) item\n\n| h |\n|-|\n| ![t](/f/t.png) |",
    ),
  );
  expect(shots.map((s) => s.src)).toEqual(["/f/one.png", "/f/two%20x.png", "/f/c.png", "/f/t.png"]);
  expect(blocks.map((b) => b.k)).toEqual(["p", "list", "table"]);
  expect(JSON.stringify(blocks)).not.toContain('"img"');
  expect(shotName(shots[1]!)).toBe("two x.png");
  expect(shotName(shots[0]!)).toBe("a");
  expect(shotName({ src: "/file?dir=%2Fp%2F.kaizen&p=runs%2Fx%2Fattachments%2Fa%20b.png", alt: "" })).toBe("a b.png");
});

test("previewIn keeps a worktree's preview out of its parent workspace", () => {
  expect(previewIn("/p", "/p")).toBe(true);
  expect(previewIn("/p/sub", "/p")).toBe(true);
  expect(previewIn("/p/.kaizen/wt/x", "/p")).toBe(false);
});
