import { expect, test } from "bun:test";
import { phoneLine, qrSrc, waCard, waPolling, type WAStatus } from "./lib/phone-setup.ts";

const wa = (o: Partial<WAStatus> = {}): WAStatus => ({
  installed: true,
  running: false,
  connected: false,
  user: null,
  qrSvg: null,
  error: null,
  ...o,
});

test("the phone line names the online phones, else says why none is", () => {
  expect(phoneLine([])).toEqual({ on: false, text: "No phone on your tailnet yet" });
  expect(phoneLine([{ name: "Pixel", online: false }])).toEqual({
    on: false,
    text: "Phone on your tailnet, offline right now",
  });
  expect(
    phoneLine([
      { name: "Pixel", online: true },
      { name: "iPad", online: true },
      { name: "Old", online: false },
    ]),
  ).toEqual({ on: true, text: "Phone online: Pixel, iPad" });
});

test("the WhatsApp card follows the bridge: connected beats a QR, a QR beats a saved login, then running, then idle", () => {
  expect(waCard(wa({ connected: true, qrSvg: "<svg/>", saved: true }))).toBe("connected");
  expect(waCard(wa({ qrSvg: "<svg/>", saved: true }))).toBe("qr");
  expect(waCard(wa({ saved: true, running: true }))).toBe("reconnecting");
  expect(waCard(wa({ running: true }))).toBe("connecting");
  expect(waCard(wa())).toBe("idle");
});

test("WhatsApp is polled only while a link is on its way", () => {
  expect(waPolling(null, true)).toBe(false);
  expect(waPolling(wa(), false)).toBe(false);
  expect(waPolling(wa(), true)).toBe(true);
  expect(waPolling(wa({ qrSvg: "<svg/>" }), false)).toBe(true);
  expect(waPolling(wa({ running: true }), false)).toBe(true);
  expect(waPolling(wa({ saved: true }), false)).toBe(true);
  expect(waPolling(wa({ connected: true, running: true }), true)).toBe(false);
});

test("the QR becomes a data URL an <img> can show", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1"/></svg>';
  const src = qrSrc(svg);
  expect(src.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
  expect(decodeURIComponent(src.split(",")[1]!)).toBe(svg);
});
