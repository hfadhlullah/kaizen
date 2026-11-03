import { expect, test } from "bun:test";
import { phoneState, qrSvg } from "./phone-setup.ts";

const status = (over: object = {}) => JSON.stringify({
  BackendState: "Running",
  Self: { DNSName: "pc.tail1.ts.net.", UserID: 7 },
  User: { 7: { LoginName: "me@example.com" } },
  Peer: { a: { OS: "android", HostName: "pixel", Online: true }, b: { OS: "linux", HostName: "nas", Online: true } },
  ...over,
});

test("no tailscale command is missing; logged out or unreadable is login", () => {
  expect(phoneState(null, new Set()).state).toBe("missing");
  expect(phoneState("", new Set()).state).toBe("login");
  expect(phoneState(status({ BackendState: "NeedsLogin" }), new Set()).state).toBe("login");
});

test("running but not shared is ready, with the account the phone must use and only phones listed", () => {
  const s = phoneState(status(), new Set());
  expect(s).toMatchObject({ state: "ready", account: "me@example.com", url: "", qr: "" });
  expect(s.phones).toEqual([{ name: "pixel", online: true }]);
});

test("a saved board name is connected, with its address and a QR of it", () => {
  const s = phoneState(status(), new Set(["pc.tail1.ts.net"]));
  expect(s).toMatchObject({ state: "connected", url: "https://pc.tail1.ts.net" });
  expect(s.qr).toStartWith("<svg");
  expect(s.qr).toContain('fill="#000"');
});

test("qrSvg is square and grows with the text", () => {
  const n = (svg: string) => Number(/viewBox="0 0 (\d+)/.exec(svg)![1]);
  expect(n(qrSvg("https://a.ts.net"))).toBeGreaterThanOrEqual(29);
  expect(n(qrSvg("https://" + "x".repeat(40) + ".ts.net"))).toBeGreaterThan(n(qrSvg("https://a.ts.net")));
});

test("connect stops at missing or login, and turns a permission refusal into the one command to run", async () => {
  const { connectPhone } = await import("./phone-setup.ts");
  const missing = async () => ({ ok: false, out: "", err: "tailscale is not installed" });
  expect(await connectPhone(7420, missing)).toMatchObject({ state: "missing" });
  const out = status({ BackendState: "NeedsLogin" });
  expect(await connectPhone(7420, async () => ({ ok: false, out, err: "" }))).toMatchObject({ state: "login" });
  const calls: string[][] = [];
  const denied = async (argv: string[]) => (calls.push(argv), argv[1] === "serve" ? { ok: false, out: "", err: "Access denied: serve config denied" } : { ok: true, out: status(), err: "" });
  const r = await connectPhone(7420, denied) as { error: string };
  expect(r.error).toContain("sudo tailscale set --operator=$USER");
  expect(calls[1]).toEqual(["tailscale", "serve", "--bg", "127.0.0.1:7420"]);
});
