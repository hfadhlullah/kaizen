import { expect, test } from "bun:test";
import { PANE_PARTITION, paneAllows, paneAttach, paneNavigable } from "./browser-pane.ts";

test("paneAttach forces the persistent partition and strips what a page could use to reach the machine", () => {
  const params: any = { src: "http://localhost:8000/", partition: "persist:evil", nodeintegration: "true", preload: "/etc/x.js", webpreferences: "nodeIntegration=yes", disablewebsecurity: "" };
  const prefs: any = { nodeIntegration: true, preloadURL: "file:///x" };
  expect(paneAttach(params, prefs, "/app/pane-preload.js")).toBe("http://localhost:8000/");
  expect(params).toEqual({ src: "http://localhost:8000/", partition: PANE_PARTITION });
  expect(prefs).toMatchObject({ nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, preload: "/app/pane-preload.js" });
  expect(prefs.preloadURL).toBeUndefined();
});

test("paneAttach refuses a src that is not a web page", () => {
  for (const src of ["file:///etc/passwd", "kaizen-desktop://restart", "javascript:alert(1)", "data:text/html,x"]) expect(paneAttach({ src }, {}, "/p.js")).toBeNull();
  expect(paneAttach({}, {}, "/p.js")).toBe("about:blank");
});

test("a guest cannot navigate off the web", () => {
  expect(paneNavigable("https://example.com/")).toBe(true);
  expect(paneNavigable("file:///etc/passwd")).toBe(false);
  expect(paneNavigable("kaizen-desktop://log")).toBe(false);
});

test("screen capture and microphone only for pages on this computer", () => {
  expect(paneAllows("display-capture", "http://localhost:8000")).toBe(true);
  expect(paneAllows("media", "http://127.0.0.1:5173")).toBe(true);
  expect(paneAllows("display-capture", "https://evil.example")).toBe(false);
  expect(paneAllows("media", "https://localhost.evil.example")).toBe(false);
  expect(paneAllows("geolocation", "http://localhost:8000")).toBe(false);
  expect(paneAllows("clipboard-sanitized-write", "https://example.com")).toBe(true);
  expect(paneAllows("media", "not a url")).toBe(false);
});
