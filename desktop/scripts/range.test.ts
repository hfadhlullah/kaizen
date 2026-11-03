import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rangeResponse } from "./range.ts";

const file = () => { const f = join(tmpdir(), `kz-range-${Math.random().toString(36).slice(2)}`); writeFileSync(f, "0123456789abcdefghij"); return Bun.file(f); };

test("no Range: the whole file", async () => {
  const r = await rangeResponse(file(), null);
  expect([r.status, await r.text()]).toEqual([200, "0123456789abcdefghij"]);
});

test("one range: 206 with Content-Range", async () => {
  const r = await rangeResponse(file(), "bytes=5-7");
  expect([r.status, r.headers.get("content-range"), await r.text()]).toEqual([206, "bytes 5-7/20", "567"]);
});

test("several ranges: multipart/byteranges carrying the bytes of a real file", async () => {
  const r = await rangeResponse(file(), "bytes=0-2, 5-7");
  expect(r.headers.get("content-type")).toBe("multipart/byteranges; boundary=kzrange");
  expect(await r.text()).toBe(
    "--kzrange\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes 0-2/20\r\n\r\n012" +
    "\r\n--kzrange\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes 5-7/20\r\n\r\n567\r\n--kzrange--\r\n");
});

test("open-ended and suffix ranges", async () => {
  expect(await (await rangeResponse(file(), "bytes=15-")).text()).toBe("fghij");
  expect(await (await rangeResponse(file(), "bytes=-3")).text()).toBe("hij");
});
