import { expect, test } from "bun:test";
import { micAudio, openMic } from "./settings-voice.ts";

test("no saved device asks for the default microphone; a saved one is exact", () => {
  expect(micAudio().deviceId).toBeUndefined();
  expect(micAudio("abc").deviceId).toEqual({ exact: "abc" });
  expect(micAudio("abc").channelCount).toBe(1);
});

test("an unplugged microphone falls back to the default and says so; a refusal does not", async () => {
  const asked: any[] = [], said: string[] = [];
  const gone = async (a: any) => { asked.push(a); if (a.deviceId) throw Object.assign(new Error(), { name: "OverconstrainedError" }); return "ok" as any; };
  expect(await openMic(gone, "abc", (m) => said.push(m))).toBe("ok");
  expect(asked.length).toBe(2);
  expect(said.length).toBe(1);
  const refused = async () => { throw Object.assign(new Error(), { name: "NotAllowedError" }); };
  await expect(openMic(refused, "abc", () => {})).rejects.toThrow();
});
