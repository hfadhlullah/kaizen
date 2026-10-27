import { test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

test("new notification sounds play real files while saved choices stay intact", async () => {
  const oldListener = globalThis.addEventListener;
  const oldStorage = globalThis.localStorage;
  const oldAudio = globalThis.Audio;
  const oldContext = globalThis.AudioContext;
  const values = new Map<string, string>();
  const played: string[] = [];
  const tones: number[] = [];
  (globalThis as any).addEventListener = () => {};
  (globalThis as any).localStorage = { getItem: (key: string) => values.get(key) ?? null };
  (globalThis as any).Audio = class {
    constructor(readonly src: string) {}
    play() {
      played.push(this.src);
      return Promise.resolve();
    }
  };
  (globalThis as any).AudioContext = class {
    currentTime = 0;
    destination = {};
    resume() {
      return Promise.resolve();
    }
    createOscillator() {
      return {
        type: "",
        frequency: { value: 0 },
        connect(g: unknown) {
          return g;
        },
        start() {
          tones.push(1);
        },
        stop() {},
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {
          return this;
        },
      };
    }
  };
  try {
    const { SOUNDS, soundPick, playSound, notifyUser } = await import("./toast.ts");
    const samples = SOUNDS.filter((s) => !["off", "chime", "bell", "pop"].includes(s));
    expect(samples).toHaveLength(10);
    expect(soundPick()).toBe("Bellatrix");
    notifyUser("done");
    expect(played).toEqual(["/sounds/Bellatrix.mp3"]);
    for (const name of samples) {
      expect(existsSync(join(dirname(import.meta.dir), "sounds", `${name}.mp3`))).toBe(true);
      playSound(name);
    }
    expect(played.slice(1)).toEqual(samples.map((name) => `/sounds/${name}.mp3`));
    values.set("kz-sound", "off");
    notifyUser("quiet");
    expect(played).toHaveLength(11);
    for (const name of ["chime", "bell", "pop"]) {
      values.set("kz-sound", name);
      expect(soundPick()).toBe(name);
      notifyUser("legacy");
    }
    expect(tones).toHaveLength(4);
  } finally {
    globalThis.addEventListener = oldListener;
    globalThis.localStorage = oldStorage;
    globalThis.Audio = oldAudio;
    globalThis.AudioContext = oldContext;
  }
});
