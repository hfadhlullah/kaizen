// The editor's save rules as a small state machine, with no DOM and no clock of its own (the timer and the request are
// handed in, so a test can drive both). One note is open at a time. An edit marks it dirty and starts a 600 ms wait;
// `flush()` writes it at once (before leaving, switching, closing). While a save is out, a second flush waits for it;
// typing during a save schedules another when it lands; a refused save (the file changed elsewhere) is a conflict and
// stops all saving until the person picks Keep mine or Load theirs; a failed save waits for the next keystroke.
export type SaveResult =
  { ok: true; mtime: number } | { ok: false; status?: number; error?: string; text?: string; mtime?: number };
export type Conflict = { text: string; mtime: number };
export type SaveState = "saved" | "unsaved" | "saving" | "conflict";
export type AutosaveDeps = {
  read(): string | null; // the editor's text now, null when there is no editor
  save(name: string, text: string, base: number): Promise<SaveResult>;
  timer: { set(f: () => void, ms: number): unknown; clear(t: unknown): void };
  onState?(s: SaveState, conflict: Conflict | null): void;
  onSaved?(name: string, text: string, mtime: number): void; // the note is on disk
  onError?(message: string): void;
  delay?: number;
};

export class Autosave {
  name: string | null = null; // the note in the editor
  base = 0; // the mtime it was loaded or last saved at
  dirty = false;
  conflict: Conflict | null = null;
  private saving: Promise<void> | null = null;
  private timer: unknown;
  constructor(private d: AutosaveDeps) {}

  get busy() {
    return this.saving !== null;
  }
  get state(): SaveState {
    return this.conflict ? "conflict" : this.saving ? "saving" : this.dirty ? "unsaved" : "saved";
  }
  private emit() {
    this.d.onState?.(this.state, this.conflict);
  }
  private wait() {
    this.d.timer.clear(this.timer);
    this.timer = this.d.timer.set(() => void this.flush(), this.d.delay ?? 600);
  }

  // A note was opened (or none): nothing of the old one is left to save, so callers flush first.
  open(name: string | null, base = 0) {
    this.d.timer.clear(this.timer);
    this.name = name;
    this.base = base;
    this.dirty = false;
    this.conflict = null;
    this.emit();
  }
  // The text changed by the person typing (never by loading a note).
  edit() {
    this.dirty = true;
    this.conflict = null;
    this.emit();
    this.wait();
  }
  // Someone else's version was loaded into the editor: it is the new base.
  adopt(mtime: number) {
    this.base = mtime;
  }
  // The note was renamed on disk and stays open under its new name.
  renamed(name: string, mtime = this.base) {
    this.name = name;
    this.base = mtime;
  }
  // The note was deleted: nothing to save.
  discard() {
    this.d.timer.clear(this.timer);
    this.dirty = false;
    this.emit();
  }
  // Conflict: keep what is typed (and write it over theirs), or take theirs.
  keepMine() {
    if (!this.conflict) return;
    this.base = this.conflict.mtime;
    this.conflict = null;
    void this.flush();
  }
  takeTheirs(): Conflict | null {
    const c = this.conflict;
    if (!c) return null;
    this.conflict = null;
    this.dirty = false;
    this.base = c.mtime;
    this.emit();
    return c;
  }

  // Write the open note if it has unsaved text. Never called for a note only opened.
  async flush(): Promise<void> {
    this.d.timer.clear(this.timer);
    if (this.saving) await this.saving;
    if (!this.name || !this.dirty || this.conflict) return;
    const name = this.name,
      text = this.d.read();
    if (text === null) return;
    let saved = false;
    this.saving = (async () => {
      const r = await this.d.save(name, text, this.base);
      if (this.name !== name) return;
      if (r.ok) {
        saved = true;
        this.base = r.mtime;
        if (this.d.read() === text) this.dirty = false;
        this.d.onSaved?.(name, text, r.mtime);
      } else if (r.status === 409) this.conflict = { text: r.text ?? "", mtime: r.mtime ?? 0 };
      else this.d.onError?.(r.error || "Not saved");
    })();
    this.emit(); // reads "saving" from here
    await this.saving;
    this.saving = null;
    this.emit();
    // Typed on while that save was out: save again. A failed save waits for the next keystroke.
    if (saved && this.dirty && !this.conflict && this.name === name) this.wait();
  }
}
