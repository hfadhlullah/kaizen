import { expect, test } from "bun:test";
import { Autosave, type SaveResult, type SaveState } from "./autosave.ts";

// A clock the test moves by hand, and a save the test settles by hand.
function rig(read: () => string | null = () => "text") {
  let now = 0,
    id = 0;
  const timers = new Map<number, { at: number; f: () => void }>();
  const timer = {
    set: (f: () => void, ms: number) => (timers.set(++id, { at: now + ms, f }), id),
    clear: (t: unknown) => void timers.delete(t as number),
  };
  const tick = (ms: number) => {
    now += ms;
    for (const [k, t] of [...timers]) if (t.at <= now) (timers.delete(k), t.f());
  };
  const calls: { name: string; text: string; base: number }[] = [];
  const settle: ((r: SaveResult) => void)[] = [];
  const states: SaveState[] = [];
  const errors: string[] = [];
  const saved: [string, string, number][] = [];
  const a = new Autosave({
    read: () => read(),
    timer,
    save: (name, text, base) => {
      calls.push({ name, text, base });
      return new Promise((ok) => settle.push(ok));
    },
    onState: (s) => states.push(s),
    onSaved: (n, t, m) => saved.push([n, t, m]),
    onError: (m) => errors.push(m),
  });
  return { a, tick, calls, settle, states, errors, saved, pending: () => timers.size };
}
const nap = () => new Promise((r) => setTimeout(r, 0));

test("a burst of edits saves once, 600 ms after the last", async () => {
  const r = rig();
  r.a.open("A", 5);
  r.a.edit();
  r.tick(400);
  r.a.edit();
  r.tick(599);
  expect(r.calls.length).toBe(0);
  r.tick(1);
  expect(r.calls).toEqual([{ name: "A", text: "text", base: 5 }]);
  r.settle[0]!({ ok: true, mtime: 9 });
  await nap();
  expect(r.a.dirty).toBe(false);
  expect(r.a.base).toBe(9);
  expect(r.saved).toEqual([["A", "text", 9]]);
  expect(r.a.state).toBe("saved");
  expect(r.pending()).toBe(0);
});

test("flush writes at once, cancels the wait, and does nothing for a note only opened", async () => {
  const r = rig();
  r.a.open("A", 1);
  await r.a.flush();
  expect(r.calls.length).toBe(0);
  r.a.edit();
  const p = r.a.flush();
  expect(r.pending()).toBe(0);
  expect(r.calls.length).toBe(1);
  expect(r.a.state).toBe("saving");
  r.settle[0]!({ ok: true, mtime: 2 });
  await p;
  expect(r.a.state).toBe("saved");
});

test("a second flush waits for the save in flight, then has nothing left to write", async () => {
  const r = rig();
  r.a.open("A");
  r.a.edit();
  const one = r.a.flush();
  const two = r.a.flush();
  expect(r.calls.length).toBe(1);
  r.settle[0]!({ ok: true, mtime: 3 });
  await Promise.all([one, two]);
  expect(r.calls.length).toBe(1);
});

test("typing while a save is out saves again when it lands", async () => {
  let text = "one";
  const r = rig(() => text);
  r.a.open("A", 1);
  r.a.edit();
  const p = r.a.flush();
  text = "one two";
  r.a.edit();
  r.settle[0]!({ ok: true, mtime: 2 });
  await p;
  expect(r.a.dirty).toBe(true); // the text on disk is not what is in the editor
  expect(r.pending()).toBe(1);
  r.tick(600);
  expect(r.calls.map((c) => [c.text, c.base])).toEqual([
    ["one", 1],
    ["one two", 2],
  ]);
});

test("a 409 is a conflict: no more saving until Keep mine or Load theirs", async () => {
  const r = rig();
  r.a.open("A", 1);
  r.a.edit();
  const p = r.a.flush();
  r.settle[0]!({ ok: false, status: 409, text: "theirs", mtime: 7 });
  await p;
  expect(r.a.state).toBe("conflict");
  expect(r.a.conflict).toEqual({ text: "theirs", mtime: 7 });
  await r.a.flush();
  expect(r.calls.length).toBe(1);
  // Keep mine: the next save is against their mtime.
  r.a.keepMine();
  expect(r.calls.length).toBe(2);
  expect(r.calls[1]!.base).toBe(7);
  r.settle[1]!({ ok: true, mtime: 8 });
  await nap();
  expect(r.a.state).toBe("saved");
});

test("Load theirs clears the conflict and the dirty mark, and takes their mtime as the base", async () => {
  const r = rig();
  r.a.open("A", 1);
  r.a.edit();
  const p = r.a.flush();
  r.settle[0]!({ ok: false, status: 409, text: "theirs", mtime: 7 });
  await p;
  expect(r.a.takeTheirs()).toEqual({ text: "theirs", mtime: 7 });
  expect(r.a.state).toBe("saved");
  expect(r.a.base).toBe(7);
  expect(r.a.takeTheirs()).toBeNull();
});

test("typing clears a conflict flag set by an earlier refused save", async () => {
  const r = rig();
  r.a.open("A", 1);
  r.a.edit();
  const p = r.a.flush();
  r.settle[0]!({ ok: false, status: 409, mtime: 2 });
  await p;
  r.a.edit();
  expect(r.a.conflict).toBeNull();
  expect(r.a.state).toBe("unsaved");
});

test("a failed save keeps the note dirty, says why, and waits for the next keystroke", async () => {
  const r = rig();
  r.a.open("A", 1);
  r.a.edit();
  const p = r.a.flush();
  r.settle[0]!({ ok: false, status: 500, error: "disk full" });
  await p;
  expect(r.errors).toEqual(["disk full"]);
  expect(r.a.dirty).toBe(true);
  expect(r.pending()).toBe(0);
  r.a.edit();
  expect(r.pending()).toBe(1);
});

test("a save that lands after another note was opened is ignored", async () => {
  const r = rig();
  r.a.open("A", 1);
  r.a.edit();
  const p = r.a.flush();
  r.a.open("B", 4);
  r.settle[0]!({ ok: true, mtime: 9 });
  await p;
  expect(r.a.name).toBe("B");
  expect(r.a.base).toBe(4);
  expect(r.saved).toEqual([]);
});

test("open() drops a pending wait; discard() (a deleted note) does too; no editor means no write", async () => {
  const r = rig();
  r.a.open("A");
  r.a.edit();
  r.a.open("B");
  expect(r.pending()).toBe(0);
  r.a.edit();
  r.a.discard();
  expect(r.pending()).toBe(0);
  expect(r.a.dirty).toBe(false);
  const none = rig(() => null);
  none.a.open("A");
  none.a.edit();
  await none.a.flush();
  expect(none.calls.length).toBe(0);
});

test("a rename keeps the note open under its new name and the new base", async () => {
  const r = rig();
  r.a.open("A", 1);
  r.a.renamed("Folder/A", 6);
  r.a.edit();
  void r.a.flush();
  expect(r.calls[0]).toEqual({ name: "Folder/A", text: "text", base: 6 });
});
