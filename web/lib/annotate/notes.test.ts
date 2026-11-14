import { expect, test } from "bun:test";
import {
  editedComment,
  formatBody,
  fromPage,
  markersOf,
  plural,
  sendBody,
  withoutCrops,
  without,
  type Note,
} from "./notes.ts";
import { MAX_BOARD_NOTES } from "./rules.ts";

const px = { origin: "http://127.0.0.1:5000", target: "http://localhost:3000" };
const note = (n: number, extra: object = {}): Note => ({
  id: "i" + n,
  n,
  comment: "c" + n,
  selector: "#" + n,
  kind: "element",
  ...extra,
});

test("a note from the page gets a fresh id and number, a safe crop, and the app's own address", () => {
  const n = fromPage(
    { comment: "x", crop: "data:image/png;base64,AAAA", url: "http://127.0.0.1:5000/a?b=1", page: 5 },
    0,
    7,
    px,
  )!;
  expect(n.n).toBe(7);
  expect(n.id.length).toBeGreaterThan(3);
  expect(n.crop).toBe("data:image/png;base64,AAAA");
  expect(n.url).toBe("http://localhost:3000/a?b=1");
  expect(n.page).toBe("5");
  expect(fromPage({ crop: "<img onerror=x>", url: "javascript:1" }, 0, 1, px)).toMatchObject({
    crop: undefined,
    url: "",
    page: "",
  });
  expect(fromPage({ comment: "x" }, MAX_BOARD_NOTES, 1, px)).toBeNull();
});

test("what the page draws for each note, and what is saved and sent for Copy, leave out the crop", () => {
  const ns = [note(1, { crop: "data:image/png;base64,AAAA", path: "html > body" })];
  expect(markersOf(ns)[0]).toEqual({
    n: 1,
    kind: "element",
    selector: "#1",
    items: undefined,
    pb: undefined,
    page: undefined,
    comment: "c1",
    intent: undefined,
    severity: undefined,
  });
  expect("crop" in withoutCrops(ns)[0]!).toBe(false);
  expect(formatBody(ns, { level: "compact", components: false })).toEqual({
    notes: [{ id: "i1", n: 1, comment: "c1", selector: "#1", kind: "element", path: "html > body" }],
    level: "compact",
    components: false,
  });
});

test("Send carries the run, the notes with their crops, and the output settings", () => {
  const ns = [note(1, { crop: "data:image/png;base64,AAAA" })];
  const b = sendBody({ dir: "/s", id: "r" }, ns, { level: "forensic", components: true });
  expect(b).toMatchObject({ dir: "/s", id: "r", level: "forensic", components: true });
  expect(b.notes[0]!.crop).toBe("data:image/png;base64,AAAA");
  expect(b.notes[0]).not.toBe(ns[0]);
});

test("delete by number; an edit is trimmed and an empty or unchanged one changes nothing", () => {
  const ns = [note(1), note(2)];
  expect(without(ns, 1).map((n) => n.n)).toEqual([2]);
  expect(editedComment(ns, 1, "  new ")[0]!.comment).toBe("new");
  expect(editedComment(ns, 1, "   ")).toBe(ns);
  expect(editedComment(ns, 1, "c1")).toBe(ns);
  expect(editedComment(ns, 9, "x")).toBe(ns);
  expect(plural(1, "note")).toBe("1 note");
  expect(plural(2, "note")).toBe("2 notes");
});
